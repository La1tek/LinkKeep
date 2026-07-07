from datetime import datetime, timezone
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Link, ShareComment, SharedCollection, ShareInvite, Tab, User
from app.routers.auth import _get_current_user
from app.services.folder_access import parse_unlock_tokens, require_tab_access

router = APIRouter(prefix="/api/shares", tags=["shares"])
public_router = APIRouter(prefix="/api/public", tags=["public"])


class ShareCreate(BaseModel):
    tab_id: int | None = None
    title: str = Field(min_length=1, max_length=160)
    description: str | None = None
    expires_at: datetime | None = None
    role: str = "viewer"
    public_profile: bool = False


class ShareInviteCreate(BaseModel):
    email: str | None = None
    username: str | None = None
    role: str = "viewer"


class ShareCommentCreate(BaseModel):
    link_id: int | None = None
    body: str = Field(min_length=1, max_length=5000)


def _share_out(share: SharedCollection) -> dict:
    return {
        "id": share.id,
        "tab_id": share.tab_id,
        "token": share.token,
        "title": share.title,
        "description": share.description,
        "is_active": share.is_active,
        "role": share.role,
        "public_profile": share.public_profile,
        "expires_at": share.expires_at,
        "created_at": share.created_at,
    }


@router.get("")
def list_shares(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    shares = db.query(SharedCollection).filter(SharedCollection.user_id == user.id).order_by(SharedCollection.created_at.desc()).all()
    return {"shares": [_share_out(share) for share in shares]}


@router.post("", status_code=201)
def create_share(
    data: ShareCreate,
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    if data.tab_id is not None:
        require_tab_access(db, user.id, data.tab_id, parse_unlock_tokens(folder_unlocks))
        tab = db.query(Tab).filter(Tab.id == data.tab_id, Tab.user_id == user.id).first()
        if not tab:
            raise HTTPException(status_code=404, detail="Tab not found")
    share = SharedCollection(
        user_id=user.id,
        tab_id=data.tab_id,
        token=secrets.token_urlsafe(24),
        title=data.title,
        description=data.description,
        role=data.role if data.role in {"viewer", "commenter", "editor"} else "viewer",
        public_profile=data.public_profile,
        expires_at=data.expires_at,
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return _share_out(share)


@router.delete("/{share_id}", status_code=204)
def delete_share(share_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    share = db.query(SharedCollection).filter(SharedCollection.id == share_id, SharedCollection.user_id == user.id).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    db.delete(share)
    db.commit()


@router.post("/{share_id}/invites", status_code=201)
def create_invite(share_id: int, data: ShareInviteCreate, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    share = db.query(SharedCollection).filter(SharedCollection.id == share_id, SharedCollection.user_id == user.id).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    invited_user = db.query(User).filter(User.username == data.username).first() if data.username else None
    invite = ShareInvite(
        share_id=share.id,
        user_id=invited_user.id if invited_user else None,
        email=data.email,
        role=data.role if data.role in {"viewer", "commenter", "editor"} else "viewer",
        token=secrets.token_urlsafe(24),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return {"id": invite.id, "role": invite.role, "email": invite.email, "username": invited_user.username if invited_user else None, "token": invite.token, "created_at": invite.created_at}


@router.get("/{share_id}/comments")
def list_comments(share_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    share = db.query(SharedCollection).filter(SharedCollection.id == share_id, SharedCollection.user_id == user.id).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    comments = db.query(ShareComment).filter(ShareComment.share_id == share.id).order_by(ShareComment.created_at.desc()).all()
    return {"comments": [{"id": c.id, "link_id": c.link_id, "author_name": c.author_name, "body": c.body, "created_at": c.created_at} for c in comments]}


@router.post("/{share_id}/comments", status_code=201)
def create_comment(share_id: int, data: ShareCommentCreate, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    share = db.query(SharedCollection).filter(SharedCollection.id == share_id, SharedCollection.user_id == user.id).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    if data.link_id is not None:
        link = db.query(Link).filter(Link.id == data.link_id, Link.user_id == user.id).first()
        if not link:
            raise HTTPException(status_code=404, detail="Link not found")
    comment = ShareComment(share_id=share.id, link_id=data.link_id, user_id=user.id, author_name=user.username, body=data.body.strip())
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return {"id": comment.id, "link_id": comment.link_id, "author_name": comment.author_name, "body": comment.body, "created_at": comment.created_at}


@public_router.get("/shares/{token}")
def get_public_share(token: str, db: Session = Depends(get_db)):
    share = db.query(SharedCollection).filter(SharedCollection.token == token, SharedCollection.is_active == True).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    if share.expires_at and share.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=404, detail="Share expired")

    query = db.query(Link).filter(Link.user_id == share.user_id)
    if share.tab_id is not None:
        tab = db.query(Tab).filter(Tab.id == share.tab_id, Tab.user_id == share.user_id).first()
        if tab and tab.password_hash:
            raise HTTPException(status_code=404, detail="Share not found")
        query = query.filter(Link.tab_id == share.tab_id)
    else:
        locked_tab_ids = {tab.id for tab in db.query(Tab).filter(Tab.user_id == share.user_id, Tab.password_hash.isnot(None)).all()}
        if locked_tab_ids:
            query = query.filter((Link.tab_id.is_(None)) | (~Link.tab_id.in_(locked_tab_ids)))
    links = query.order_by(Link.is_pinned.desc(), Link.sort_order, Link.created_at.desc()).all()
    comments = db.query(ShareComment).filter(ShareComment.share_id == share.id).order_by(ShareComment.created_at.desc()).limit(100).all()
    return {
        "title": share.title,
        "description": share.description,
        "owner": share.owner.username,
        "role": share.role,
        "created_at": share.created_at,
        "comments": [{"id": c.id, "link_id": c.link_id, "author_name": c.author_name, "body": c.body, "created_at": c.created_at} for c in comments],
        "links": [
            {
                "id": link.id,
                "title": link.title,
                "url": link.url,
                "description": link.description,
                "favicon": link.favicon,
                "tags": link.tags or [],
                "is_pinned": link.is_pinned,
            }
            for link in links
        ],
    }


@public_router.get("/profiles/{username}")
def public_profile(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Profile not found")
    shares = (
        db.query(SharedCollection)
        .filter(SharedCollection.user_id == user.id, SharedCollection.public_profile == True, SharedCollection.is_active == True)
        .order_by(SharedCollection.created_at.desc())
        .all()
    )
    return {
        "username": user.username,
        "created_at": user.created_at,
        "shares": [_share_out(share) for share in shares if not share.expires_at or share.expires_at.replace(tzinfo=timezone.utc) > datetime.now(timezone.utc)],
    }
