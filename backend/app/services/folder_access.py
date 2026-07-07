from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import FolderUnlockSession, Tab


UNLOCK_TTL_MINUTES = 30
UNLOCK_HEADER = "X-LinkKeep-Folder-Unlocks"


def parse_unlock_tokens(header_value: str | None) -> list[str]:
    if not header_value:
        return []
    return [token.strip() for token in header_value.split(",") if token.strip()]


def hash_unlock_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_folder_unlock(db: Session, user_id: int, tab_id: int) -> tuple[str, datetime]:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=UNLOCK_TTL_MINUTES)
    db.add(
        FolderUnlockSession(
            user_id=user_id,
            tab_id=tab_id,
            token_hash=hash_unlock_token(token),
            expires_at=expires_at,
        )
    )
    return token, expires_at


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def locked_ancestor_ids(db: Session, user_id: int, tab_id: int | None) -> list[int]:
    if tab_id is None:
        return []
    locked_ids: list[int] = []
    current = db.query(Tab).filter(Tab.id == tab_id, Tab.user_id == user_id).first()
    visited = set()
    while current and current.id not in visited:
        visited.add(current.id)
        if current.password_hash:
            locked_ids.append(current.id)
        if current.parent_id is None:
            break
        current = db.query(Tab).filter(Tab.id == current.parent_id, Tab.user_id == user_id).first()
    return locked_ids


def unlocked_tab_ids(db: Session, user_id: int, tokens: list[str]) -> set[int]:
    if not tokens:
        return set()
    token_hashes = [hash_unlock_token(token) for token in tokens]
    now = datetime.now(timezone.utc)
    rows = (
        db.query(FolderUnlockSession)
        .filter(FolderUnlockSession.user_id == user_id, FolderUnlockSession.token_hash.in_(token_hashes))
        .all()
    )
    return {row.tab_id for row in rows if _as_utc(row.expires_at) > now}


def can_access_tab(db: Session, user_id: int, tab_id: int | None, tokens: list[str]) -> bool:
    locked_ids = locked_ancestor_ids(db, user_id, tab_id)
    if not locked_ids:
        return True
    unlocked = unlocked_tab_ids(db, user_id, tokens)
    return all(tab_id in unlocked for tab_id in locked_ids)


def require_tab_access(db: Session, user_id: int, tab_id: int | None, tokens: list[str]) -> None:
    if not can_access_tab(db, user_id, tab_id, tokens):
        raise HTTPException(status_code=403, detail="Folder is locked")


def hidden_locked_descendant_ids(db: Session, user_id: int, tokens: list[str]) -> set[int]:
    tabs = db.query(Tab).filter(Tab.user_id == user_id).all()
    by_parent: dict[int | None, list[Tab]] = {}
    for tab in tabs:
        by_parent.setdefault(tab.parent_id, []).append(tab)

    unlocked = unlocked_tab_ids(db, user_id, tokens)
    hidden: set[int] = set()

    def walk(parent_id: int | None, locked_parent_hidden: bool) -> None:
        for tab in by_parent.get(parent_id, []):
            hidden_by_parent = locked_parent_hidden
            if hidden_by_parent:
                hidden.add(tab.id)
                walk(tab.id, True)
                continue
            is_locked_closed = bool(tab.password_hash and tab.id not in unlocked)
            walk(tab.id, is_locked_closed)

    walk(None, False)
    return hidden
