from datetime import datetime, timezone
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Link, SharedCollection, Tab, User
from app.routers.auth import _get_current_user

router = APIRouter(prefix="/api/shares", tags=["shares"])
public_router = APIRouter(prefix="/api/public", tags=["public"])


class ShareCreate(BaseModel):
    tab_id: int | None = None
    title: str = Field(min_length=1, max_length=160)
    description: str | None = None
    expires_at: datetime | None = None


def _share_out(share: SharedCollection) -> dict:
    return {
        "id": share.id,
        "tab_id": share.tab_id,
        "token": share.token,
        "title": share.title,
        "description": share.description,
        "is_active": share.is_active,
        "expires_at": share.expires_at,
        "created_at": share.created_at,
    }


@router.get("")
def list_shares(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    shares = db.query(SharedCollection).filter(SharedCollection.user_id == user.id).order_by(SharedCollection.created_at.desc()).all()
    return {"shares": [_share_out(share) for share in shares]}


@router.post("", status_code=201)
def create_share(data: ShareCreate, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    if data.tab_id is not None:
        tab = db.query(Tab).filter(Tab.id == data.tab_id, Tab.user_id == user.id).first()
        if not tab:
            raise HTTPException(status_code=404, detail="Tab not found")
    share = SharedCollection(
        user_id=user.id,
        tab_id=data.tab_id,
        token=secrets.token_urlsafe(24),
        title=data.title,
        description=data.description,
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


@public_router.get("/shares/{token}")
def get_public_share(token: str, db: Session = Depends(get_db)):
    share = db.query(SharedCollection).filter(SharedCollection.token == token, SharedCollection.is_active == True).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    if share.expires_at and share.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=404, detail="Share expired")

    query = db.query(Link).filter(Link.user_id == share.user_id)
    if share.tab_id is not None:
        query = query.filter(Link.tab_id == share.tab_id)
    links = query.order_by(Link.is_pinned.desc(), Link.sort_order, Link.created_at.desc()).all()
    return {
        "title": share.title,
        "description": share.description,
        "owner": share.owner.username,
        "created_at": share.created_at,
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
