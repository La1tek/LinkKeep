from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models import User, Link, Tab
from app.schemas import (
    LinkCreate, LinkUpdate, LinkOut,
    BulkLinkAction, BulkResult,
)
from app.routers.auth import _get_current_user

from pydantic import BaseModel


class ReorderItem(BaseModel):
    id: int
    sort_order: int
    tab_id: Optional[int] = None

router = APIRouter(prefix="/api/links", tags=["links"])


@router.get("", response_model=List[LinkOut])
def list_links(
    tab_id: Optional[int] = None,
    favorite: Optional[bool] = None,
    pinned: Optional[bool] = None,
    ungrouped: Optional[bool] = None,
    q: Optional[str] = None,
    global_search: Optional[bool] = None,
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Link).filter(Link.user_id == user.id)
    if tab_id is not None:
        query = query.filter(Link.tab_id == tab_id)
    if favorite is not None:
        query = query.filter(Link.is_favorite == favorite)
    if pinned is not None:
        query = query.filter(Link.is_pinned == pinned)
    if ungrouped:
        query = query.filter(Link.tab_id.is_(None))
    if q:
        like = f"%{q}%"
        query = query.filter(
            (Link.title.ilike(like)) | (Link.url.ilike(like)) | (Link.description.ilike(like))
        )
    # Pinned first, then by sort_order, then newest
    return query.order_by(Link.is_pinned.desc(), Link.sort_order, Link.created_at.desc()).all()


@router.post("", response_model=LinkOut, status_code=201)
def create_link(link: LinkCreate, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    if link.tab_id is not None:
        tab = db.query(Tab).filter(Tab.id == link.tab_id, Tab.user_id == user.id).first()
        if not tab:
            raise HTTPException(status_code=404, detail="Tab not found")
    max_order = db.query(Link).filter(Link.user_id == user.id).count()
    new_link = Link(
        title=link.title,
        url=link.url,
        description=link.description,
        favicon=link.favicon,
        image=link.image,
        tab_id=link.tab_id,
        tags=link.tags,
        is_favorite=link.is_favorite,
        is_pinned=link.is_pinned,
        note=link.note,
        sort_order=max_order,
        user_id=user.id,
    )
    db.add(new_link)
    db.commit()
    db.refresh(new_link)
    return new_link


@router.put("/{link_id}", response_model=LinkOut)
def update_link(link_id: int, data: LinkUpdate, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(link, field, value)
    db.commit()
    db.refresh(link)
    return link


@router.delete("/{link_id}", status_code=204)
def delete_link(link_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    db.delete(link)
    db.commit()


@router.post("/{link_id}/toggle-favorite", response_model=LinkOut)
def toggle_favorite(link_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    link.is_favorite = not link.is_favorite
    db.commit()
    db.refresh(link)
    return link


@router.post("/{link_id}/toggle-pin", response_model=LinkOut)
def toggle_pin(link_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    link.is_pinned = not link.is_pinned
    db.commit()
    db.refresh(link)
    return link


@router.post("/bulk", response_model=BulkResult)
def bulk_action(action: BulkLinkAction, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    links = db.query(Link).filter(Link.id.in_(action.link_ids), Link.user_id == user.id).all()
    count = 0
    for link in links:
        if action.action == "delete":
            db.delete(link)
        elif action.action == "move" and action.tab_id is not None:
            link.tab_id = action.tab_id
        elif action.action == "pin":
            link.is_pinned = True
        elif action.action == "unpin":
            link.is_pinned = False
        elif action.action == "favorite":
            link.is_favorite = True
        elif action.action == "unfavorite":
            link.is_favorite = False
        count += 1
    db.commit()
    return BulkResult(affected=count)


@router.post("/reorder")
def reorder_links(items: List[ReorderItem], user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    for item in items:
        link = db.query(Link).filter(Link.id == item.id, Link.user_id == user.id).first()
        if link:
            link.sort_order = item.sort_order
            if item.tab_id is not None:
                tab = db.query(Tab).filter(Tab.id == item.tab_id, Tab.user_id == user.id).first()
                if tab:
                    link.tab_id = item.tab_id
    db.commit()
    return {"status": "ok"}


@router.get("/duplicates")
def find_duplicates(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    links = db.query(Link).filter(Link.user_id == user.id).all()
    seen = {}
    dups = []
    for l in links:
        url_norm = l.url.rstrip('/').lower().replace('www.', '')
        if url_norm in seen:
            dups.append({"url": l.url, "links": [seen[url_norm], {"id": l.id, "title": l.title}]})
        else:
            seen[url_norm] = {"id": l.id, "title": l.title}
    return {"duplicates": dups, "count": len(dups)}
