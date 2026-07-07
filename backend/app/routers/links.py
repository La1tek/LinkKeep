from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from urllib.parse import urlparse

from app.database import get_db
from app.models import User, Link, Tab, LinkHighlight
from app.schemas import (
    LinkCreate, LinkUpdate, LinkOut,
    BulkLinkAction, BulkResult,
)
from app.routers.auth import _get_current_user
from app.services.link_service import validate_public_http_url
from app.services.search_index import upsert_link_index
from app.services.folder_access import (
    hidden_locked_descendant_ids,
    parse_unlock_tokens,
    require_tab_access,
    unlocked_tab_ids,
)

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


class DuplicateMergeRequest(BaseModel):
    target_id: int
    source_ids: List[int]


class HighlightCreate(BaseModel):
    text: str
    note: Optional[str] = None
    source_url: Optional[str] = None


router = APIRouter(prefix="/api/links", tags=["links"])


def _normalize_url_for_duplicates(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme in {"http", "https"} and parsed.netloc:
        hostname = (parsed.hostname or "").lower()
        if hostname.startswith("www."):
            hostname = hostname[4:]
        port = f":{parsed.port}" if parsed.port else ""
        path = parsed.path.rstrip("/") or "/"
        query = f"?{parsed.query}" if parsed.query else ""
        return f"{parsed.scheme}://{hostname}{port}{path}{query}".lower()
    return url.rstrip("/").lower().replace("www.", "")


def _merge_tags(*tag_lists) -> list[str]:
    merged = []
    seen = set()
    for tags in tag_lists:
        for tag in tags or []:
            value = str(tag).strip()
            if not value or value in seen:
                continue
            seen.add(value)
            merged.append(value[:64])
    return merged


def _merge_notes(current: str | None, incoming: str | None) -> str | None:
    if not incoming:
        return current
    if not current:
        return incoming
    if incoming in current:
        return current
    return f"{current}\n\n{incoming}"


def _merge_source_into_target(target: Link, source: Link) -> None:
    for field in ("description", "favicon", "image", "content"):
        if not getattr(target, field) and getattr(source, field):
            setattr(target, field, getattr(source, field))
    if target.content_fetched is None and source.content_fetched is not None:
        target.content_fetched = source.content_fetched
    if target.http_status is None and source.http_status is not None:
        target.http_status = source.http_status
    if target.last_checked is None and source.last_checked is not None:
        target.last_checked = source.last_checked
    target.tags = _merge_tags(target.tags, source.tags)
    target.note = _merge_notes(target.note, source.note)
    target.is_favorite = bool(target.is_favorite or source.is_favorite)
    target.is_pinned = bool(target.is_pinned or source.is_pinned)


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
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    tokens = parse_unlock_tokens(folder_unlocks)
    query = db.query(Link).filter(Link.user_id == user.id)
    if tab_id is not None:
        require_tab_access(db, user.id, tab_id, tokens)
        query = query.filter(Link.tab_id == tab_id)
    else:
        hidden_ids = hidden_locked_descendant_ids(db, user.id, tokens)
        unlocked = unlocked_tab_ids(db, user.id, tokens)
        locked_closed_ids = {
            tab.id
            for tab in db.query(Tab.id, Tab.password_hash).filter(Tab.user_id == user.id).all()
            if tab.password_hash and tab.id not in unlocked
        }
        blocked_ids = hidden_ids | locked_closed_ids
        if blocked_ids:
            query = query.filter((Link.tab_id.is_(None)) | (~Link.tab_id.in_(blocked_ids)))
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
def create_link(
    link: LinkCreate,
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    if link.tab_id is not None:
        require_tab_access(db, user.id, link.tab_id, parse_unlock_tokens(folder_unlocks))
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
    upsert_link_index(db, new_link)
    db.commit()
    return new_link


@router.put("/{link_id}", response_model=LinkOut)
def update_link(
    link_id: int,
    data: LinkUpdate,
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    tokens = parse_unlock_tokens(folder_unlocks)
    require_tab_access(db, user.id, link.tab_id, tokens)
    update_data = data.model_dump(exclude_unset=True)
    if "tab_id" in update_data and update_data["tab_id"] is not None:
        require_tab_access(db, user.id, update_data["tab_id"], tokens)
        tab = db.query(Tab).filter(Tab.id == update_data["tab_id"], Tab.user_id == user.id).first()
        if not tab:
            raise HTTPException(status_code=404, detail="Tab not found")
    for field, value in update_data.items():
        setattr(link, field, value)
    upsert_link_index(db, link)
    db.commit()
    db.refresh(link)
    return link


@router.delete("/{link_id}", status_code=204)
def delete_link(
    link_id: int,
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    require_tab_access(db, user.id, link.tab_id, parse_unlock_tokens(folder_unlocks))
    db.delete(link)
    db.commit()


@router.post("/{link_id}/toggle-favorite", response_model=LinkOut)
def toggle_favorite(
    link_id: int,
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    require_tab_access(db, user.id, link.tab_id, parse_unlock_tokens(folder_unlocks))
    link.is_favorite = not link.is_favorite
    db.commit()
    db.refresh(link)
    return link


@router.post("/{link_id}/toggle-pin", response_model=LinkOut)
def toggle_pin(
    link_id: int,
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    require_tab_access(db, user.id, link.tab_id, parse_unlock_tokens(folder_unlocks))
    link.is_pinned = not link.is_pinned
    db.commit()
    db.refresh(link)
    return link


@router.post("/bulk", response_model=BulkResult)
def bulk_action(
    action: BulkLinkAction,
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    tokens = parse_unlock_tokens(folder_unlocks)
    allowed_actions = {"delete", "move", "pin", "unpin", "favorite", "unfavorite"}
    if action.action not in allowed_actions:
        raise HTTPException(status_code=400, detail="Unsupported bulk action")
    if action.action == "move":
        if action.tab_id is None:
            raise HTTPException(status_code=400, detail="tab_id is required for move")
        require_tab_access(db, user.id, action.tab_id, tokens)
        tab = db.query(Tab).filter(Tab.id == action.tab_id, Tab.user_id == user.id).first()
        if not tab:
            raise HTTPException(status_code=404, detail="Tab not found")
    links = db.query(Link).filter(Link.id.in_(action.link_ids), Link.user_id == user.id).all()
    count = 0
    for link in links:
        require_tab_access(db, user.id, link.tab_id, tokens)
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
def reorder_links(
    items: List[ReorderItem],
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    tokens = parse_unlock_tokens(folder_unlocks)
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
            require_tab_access(db, user.id, link.tab_id, tokens)
            link.sort_order = item.sort_order
            if item.tab_id is not None:
                require_tab_access(db, user.id, item.tab_id, tokens)
                link.tab_id = item.tab_id
    db.commit()
    return {"status": "ok"}


@router.get("/duplicates")
def find_duplicates(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    links = db.query(Link).filter(Link.user_id == user.id).all()
    groups = {}
    for link in links:
        url_norm = _normalize_url_for_duplicates(link.url)
        groups.setdefault(url_norm, []).append({"id": link.id, "title": link.title, "url": link.url})
    dups = [
        {"url": group[0]["url"], "links": group}
        for group in groups.values()
        if len(group) > 1
    ]
    return {"duplicates": dups, "count": len(dups)}


@router.get("/{link_id}/highlights")
def list_highlights(link_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    return {
        "highlights": [
            {
                "id": item.id,
                "text": item.text,
                "note": item.note,
                "source_url": item.source_url,
                "created_at": item.created_at,
            }
            for item in db.query(LinkHighlight).filter(LinkHighlight.link_id == link.id, LinkHighlight.user_id == user.id).order_by(LinkHighlight.created_at.desc()).all()
        ]
    }


@router.post("/{link_id}/highlights", status_code=201)
def create_highlight(link_id: int, data: HighlightCreate, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Highlight text is required")
    item = LinkHighlight(
        link_id=link.id,
        user_id=user.id,
        text=text[:10_000],
        note=(data.note or None),
        source_url=data.source_url or link.url,
    )
    db.add(item)
    upsert_link_index(db, link)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "text": item.text, "note": item.note, "source_url": item.source_url, "created_at": item.created_at}


@router.post("/duplicates/merge")
def merge_duplicates(
    data: DuplicateMergeRequest,
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    target = db.query(Link).filter(Link.id == data.target_id, Link.user_id == user.id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target link not found")

    source_ids = [source_id for source_id in data.source_ids if source_id != target.id]
    if not source_ids:
        raise HTTPException(status_code=400, detail="source_ids must contain at least one non-target link")

    sources = db.query(Link).filter(Link.id.in_(source_ids), Link.user_id == user.id).all()
    if len(sources) != len(set(source_ids)):
        raise HTTPException(status_code=404, detail="One or more source links were not found")

    target_norm = _normalize_url_for_duplicates(target.url)
    for source in sources:
        if _normalize_url_for_duplicates(source.url) != target_norm:
            raise HTTPException(status_code=400, detail="Only links with the same normalized URL can be merged")

    for source in sources:
        _merge_source_into_target(target, source)
        db.delete(source)

    db.commit()
    db.refresh(target)
    return {"merged": len(sources), "link": LinkOut.model_validate(target)}


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
    upsert_link_index(db, link)
    db.commit()
    db.refresh(link)

    return {"content": link.content, "content_fetched": link.content_fetched, "link_id": link.id}
