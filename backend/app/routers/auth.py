from datetime import datetime, timedelta, timezone
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer

from app.database import get_db
from app.models import SessionToken, User
from app.schemas import SessionOut, UserCreate, UserOut, Token
from app.auth import get_password_hash, verify_password, create_access_token, decode_token
from app import config

router = APIRouter(prefix="/api/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def _cred_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _decode_bearer_token(token: str) -> dict:
    try:
        payload = decode_token(token)
        if payload.get("sub") is None:
            raise _cred_exception()
        return payload
    except Exception:
        raise _cred_exception()


def _get_current_payload(token: str = Depends(oauth2_scheme)) -> dict:
    return _decode_bearer_token(token)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _get_current_user(payload: dict = Depends(_get_current_payload), db: Session = Depends(get_db)) -> User:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    subject = payload.get("sub")
    user = None
    try:
        user = db.query(User).filter(User.id == int(subject)).first()
    except (TypeError, ValueError):
        # Backwards compatibility for tokens issued before v2.4.
        user = db.query(User).filter(User.username == subject).first()
    if user is None:
        raise cred_exc

    jti = payload.get("jti")
    if jti:
        session = db.query(SessionToken).filter(SessionToken.token_jti == jti, SessionToken.user_id == user.id).first()
        now = datetime.now(timezone.utc)
        if session is None or session.revoked_at is not None or _as_utc(session.expires_at) <= now:
            raise cred_exc
    return user


@router.post("/register", response_model=UserOut, status_code=201)
def register(user: UserCreate, db: Session = Depends(get_db)):
    if not config.ALLOW_REGISTRATION:
        raise HTTPException(status_code=403, detail="Registration is disabled")
    existing = db.query(User).filter(User.username == user.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")
    new_user = User(username=user.username, hashed_password=get_password_hash(user.password))
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/login", response_model=Token)
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    jti = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=config.JWT_EXPIRE_MINUTES)
    token = create_access_token(data={"sub": user.id, "jti": jti}, expires_at=expires_at)
    session = SessionToken(
        user_id=user.id,
        token_jti=jti,
        user_agent=request.headers.get("User-Agent"),
        ip_address=(request.headers.get("X-Forwarded-For") or (request.client.host if request.client else None) or "")
        .split(",")[0]
        .strip()
        or None,
        expires_at=expires_at,
    )
    db.add(session)
    db.commit()
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(_get_current_user)):
    return user


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(
    payload: dict = Depends(_get_current_payload),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    current_jti = payload.get("jti")
    sessions = (
        db.query(SessionToken)
        .filter(SessionToken.user_id == user.id)
        .order_by(SessionToken.created_at.desc())
        .all()
    )
    return [
        {
            "id": session.id,
            "user_agent": session.user_agent,
            "ip_address": session.ip_address,
            "created_at": session.created_at,
            "expires_at": session.expires_at,
            "revoked_at": session.revoked_at,
            "current": session.token_jti == current_jti,
        }
        for session in sessions
    ]


@router.post("/logout", status_code=204)
def logout(
    payload: dict = Depends(_get_current_payload),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    jti = payload.get("jti")
    if jti:
        session = db.query(SessionToken).filter(SessionToken.token_jti == jti, SessionToken.user_id == user.id).first()
        if session and session.revoked_at is None:
            session.revoked_at = datetime.now(timezone.utc)
            db.commit()


@router.delete("/sessions/{session_id}", status_code=204)
def revoke_session(session_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    session = db.query(SessionToken).filter(SessionToken.id == session_id, SessionToken.user_id == user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc)
        db.commit()
