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
from app.services.link_service import validate_public_http_url

from pydantic import BaseModel
import time
import re
from datetime import datetime, timezone

import httpx
from bs4 import BeautifulSoup


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
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
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
            (Link.title.ilike(like)) | (Link.url.ilike(like)) | (Link.description.ilike(like)) | (Link.note.ilike(like))
        )
    # Pinned first, then by sort_order, then newest
    return query.order_by(Link.is_pinned.desc(), Link.sort_order, Link.created_at.desc()).offset(offset).limit(limit).all()


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
    update_data = data.model_dump(exclude_unset=True)
    if "tab_id" in update_data and update_data["tab_id"] is not None:
        tab = db.query(Tab).filter(Tab.id == update_data["tab_id"], Tab.user_id == user.id).first()
        if not tab:
            raise HTTPException(status_code=404, detail="Tab not found")
    for field, value in update_data.items():
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
    allowed_actions = {"delete", "move", "pin", "unpin", "favorite", "unfavorite"}
    if action.action not in allowed_actions:
        raise HTTPException(status_code=400, detail="Unsupported bulk action")
    if action.action == "move":
        if action.tab_id is None:
            raise HTTPException(status_code=400, detail="tab_id is required for move")
        tab = db.query(Tab).filter(Tab.id == action.tab_id, Tab.user_id == user.id).first()
        if not tab:
            raise HTTPException(status_code=404, detail="Tab not found")
    links = db.query(Link).filter(Link.id.in_(action.link_ids), Link.user_id == user.id).all()
    count = 0
    for link in links:
        if action.action == "delete":
            db.delete(link)
        elif action.action == "move":
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
    requested_tab_ids = {item.tab_id for item in items if item.tab_id is not None}
    if requested_tab_ids:
        owned_tab_ids = {
            tab.id
            for tab in db.query(Tab.id).filter(Tab.id.in_(requested_tab_ids), Tab.user_id == user.id).all()
        }
        missing = requested_tab_ids - owned_tab_ids
        if missing:
            raise HTTPException(status_code=404, detail="Tab not found")
    for item in items:
        link = db.query(Link).filter(Link.id == item.id, Link.user_id == user.id).first()
        if link:
            link.sort_order = item.sort_order
            if item.tab_id is not None:
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


# ── Dead Link Checker ──────────────────────────────

@router.post("/check-health")
def check_link_health(
    tab_id: Optional[int] = None,
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Link).filter(Link.user_id == user.id)
    if tab_id is not None:
        query = query.filter(Link.tab_id == tab_id)
    links = query.order_by(Link.id).limit(50).all()

    alive = 0
    dead = 0
    redirects = 0
    checked = 0

    with httpx.Client(timeout=15, follow_redirects=True, trust_env=False) as client:
        for link in links:
            try:
                validate_public_http_url(link.url)
                resp = client.head(link.url)
                status = resp.status_code
            except ValueError:
                status = 0
            except httpx.HTTPError:
                status = 0

            link.http_status = status
            link.last_checked = datetime.now(timezone.utc)
            checked += 1

            if status and status < 400:
                alive += 1
                if status >= 300:
                    redirects += 1
            elif status == 0 or status >= 400:
                dead += 1

            time.sleep(1)

    db.commit()
    return {"checked": checked, "alive": alive, "dead": dead, "redirects": redirects}


@router.get("/dead", response_model=List[LinkOut])
def get_dead_links(
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Link)
        .filter(Link.user_id == user.id, (Link.http_status >= 400) | (Link.http_status == 0))
        .order_by(Link.http_status.desc())
        .all()
    )


# ── Reader Mode (Content Fetching) ─────────────────

@router.post("/{link_id}/fetch-content")
def fetch_link_content(
    link_id: int,
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    try:
        validate_public_http_url(link.url)
        with httpx.Client(timeout=15, follow_redirects=True, trust_env=False) as client:
            resp = client.get(link.url)
            resp.raise_for_status()
        html_text = resp.text[:500_000]
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch URL: {e}")

    try:
        soup = BeautifulSoup(html_text, "html.parser")
        # Remove script, style, nav, footer, header noise
        for tag in soup(["script", "style", "noscript", "nav", "footer", "header", "aside"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)
    except Exception:
        text = re.sub(r"<[^<]+?>", " ", html_text)
        text = re.sub(r"\s+", " ", text).strip()

    link.content = text[:500_000]
    link.content_fetched = datetime.now(timezone.utc)
    db.commit()
    db.refresh(link)

    return {"content": link.content, "content_fetched": link.content_fetched, "link_id": link.id}
