from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from app.database import get_db
from app.models import AppNotification, LinkArchive, LinkAttachment, LinkHealthCheck, LinkHistory, User, Link, Tab, LinkHighlight
from app.schemas import (
    AttachmentCreate, LinkCreate, LinkDetailOut, LinkUpdate, LinkOut,
    BulkLinkAction, BulkResult,
)
from app.routers.auth import _get_current_user
from app.services.automation import apply_automation_rules, record_webhook_event
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


TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
    "fbclid", "gclid", "dclid", "yclid", "mc_cid", "mc_eid", "igshid", "ref",
}


def _canonicalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return url.strip()
    hostname = (parsed.hostname or "").lower()
    if hostname.startswith("www."):
        hostname = hostname[4:]
    if hostname.startswith("m.") and hostname.count(".") >= 2:
        hostname = hostname[2:]
    port = f":{parsed.port}" if parsed.port else ""
    path = parsed.path.rstrip("/") or "/"
    query_items = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if key.lower() not in TRACKING_PARAMS and not key.lower().startswith("utm_")
    ]
    query = urlencode(query_items, doseq=True)
    return urlunparse((parsed.scheme.lower(), f"{hostname}{port}", path, "", query, "")).lower()


def _base_links_query(db: Session, user_id: int, include_deleted: bool = False):
    query = db.query(Link).filter(Link.user_id == user_id)
    if not include_deleted:
        query = query.filter(Link.deleted_at.is_(None))
    return query


def _record_history(db: Session, link: Link, action: str, changes: dict | None = None) -> None:
    db.add(LinkHistory(link_id=link.id, user_id=link.user_id, action=action, changes=changes or {}))


def _notify(db: Session, user_id: int, type_: str, title: str, body: str | None = None, payload: dict | None = None) -> None:
    db.add(AppNotification(user_id=user_id, type=type_, title=title, body=body, payload=payload or {}))


def _serialize_link_detail(link: Link) -> LinkDetailOut:
    return LinkDetailOut(
        link=LinkOut.model_validate(link),
        history=[
            {"id": item.id, "action": item.action, "changes": item.changes or {}, "created_at": item.created_at}
            for item in link.history[:50]
        ],
        archives=[
            {
                "id": archive.id,
                "status": archive.status,
                "error": archive.error,
                "source_url": archive.source_url,
                "created_at": archive.created_at,
                "updated_at": archive.updated_at,
                "has_html": bool(archive.html_snapshot),
                "has_text": bool(archive.readable_text),
                "has_screenshot": bool(archive.screenshot_data_url),
                "has_pdf": bool(archive.pdf_data_url),
            }
            for archive in link.archives[:20]
        ],
        highlights=[
            {
                "id": item.id,
                "text": item.text,
                "note": item.note,
                "source_url": item.source_url,
                "created_at": item.created_at,
            }
            for item in link.highlights[:50]
        ],
        attachments=link.attachments[:50],
    )


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
    read: Optional[bool] = None,
    priority: Optional[str] = None,
    ungrouped: Optional[bool] = None,
    deleted_only: bool = False,
    include_deleted: bool = False,
    q: Optional[str] = None,
    global_search: Optional[bool] = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    tokens = parse_unlock_tokens(folder_unlocks)
    query = _base_links_query(db, user.id, include_deleted=include_deleted or deleted_only)
    if deleted_only:
        query = query.filter(Link.deleted_at.isnot(None))
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
    if read is not None:
        query = query.filter(Link.is_read == read)
    if priority:
        query = query.filter(Link.priority == priority)
    if ungrouped:
        query = query.filter(Link.tab_id.is_(None))
    if q:
        like = f"%{q}%"
        query = query.filter(
            (Link.title.ilike(like)) | (Link.url.ilike(like)) | (Link.canonical_url.ilike(like)) | (Link.description.ilike(like)) | (Link.note.ilike(like))
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
        canonical_url=_canonicalize_url(link.url),
        description=link.description,
        favicon=link.favicon,
        image=link.image,
        tab_id=link.tab_id,
        tags=link.tags,
        is_favorite=link.is_favorite,
        is_pinned=link.is_pinned,
        is_read=link.is_read,
        priority=link.priority or "normal",
        reminder_at=link.reminder_at,
        note=link.note,
        sort_order=max_order,
        user_id=user.id,
    )
    db.add(new_link)
    db.flush()
    _record_history(db, new_link, "created", {"title": new_link.title, "url": new_link.url})
    apply_automation_rules(db, new_link, "link_created")
    record_webhook_event(db, user.id, "link.created", {"link_id": new_link.id, "title": new_link.title, "url": new_link.url})
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
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id, Link.deleted_at.is_(None)).first()
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
    changes = {}
    for field, value in update_data.items():
        old_value = getattr(link, field)
        if old_value != value:
            changes[field] = {"from": old_value, "to": value}
        setattr(link, field, value)
    if "url" in update_data:
        link.canonical_url = _canonicalize_url(link.url)
        changes["canonical_url"] = {"to": link.canonical_url}
    if changes:
        _record_history(db, link, "updated", changes)
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
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id, Link.deleted_at.is_(None)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    require_tab_access(db, user.id, link.tab_id, parse_unlock_tokens(folder_unlocks))
    link.deleted_at = datetime.now(timezone.utc)
    _record_history(db, link, "deleted", {"deleted_at": link.deleted_at.isoformat()})
    _notify(db, user.id, "trash", "Link moved to trash", link.title, {"link_id": link.id})
    db.commit()


@router.get("/trash", response_model=List[LinkOut])
def list_trash(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(Link)
        .filter(Link.user_id == user.id, Link.deleted_at.isnot(None))
        .order_by(Link.deleted_at.desc())
        .limit(500)
        .all()
    )


@router.get("/duplicates")
def find_duplicates(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    links = _base_links_query(db, user.id).all()
    groups = {}
    for link in links:
        url_norm = link.canonical_url or _canonicalize_url(link.url) or _normalize_url_for_duplicates(link.url)
        groups.setdefault(url_norm, []).append({"id": link.id, "title": link.title, "url": link.url, "tags": link.tags or [], "note": link.note})
    dups = [
        {"url": group[0]["url"], "canonical_url": key, "links": group}
        for key, group in groups.items()
        if len(group) > 1
    ]
    return {"duplicates": dups, "count": len(dups)}


@router.get("/dead", response_model=List[LinkOut])
def get_dead_links(
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Link)
        .filter(Link.user_id == user.id, Link.deleted_at.is_(None), (Link.http_status >= 400) | (Link.http_status == 0))
        .order_by(Link.http_status.desc(), Link.last_checked.desc())
        .all()
    )


@router.get("/{link_id}", response_model=LinkDetailOut)
def get_link_detail(
    link_id: int,
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id, Link.deleted_at.is_(None)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    require_tab_access(db, user.id, link.tab_id, parse_unlock_tokens(folder_unlocks))
    return _serialize_link_detail(link)


@router.post("/{link_id}/restore", response_model=LinkOut)
def restore_link(
    link_id: int,
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id, Link.deleted_at.isnot(None)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    require_tab_access(db, user.id, link.tab_id, parse_unlock_tokens(folder_unlocks))
    link.deleted_at = None
    _record_history(db, link, "restored")
    _notify(db, user.id, "restore", "Link restored", link.title, {"link_id": link.id})
    upsert_link_index(db, link)
    db.commit()
    db.refresh(link)
    return link


@router.delete("/{link_id}/destroy", status_code=204)
def destroy_link(
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


@router.post("/{link_id}/attachments", status_code=201)
def create_attachment(
    link_id: int,
    data: AttachmentCreate,
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id, Link.deleted_at.is_(None)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    require_tab_access(db, user.id, link.tab_id, parse_unlock_tokens(folder_unlocks))
    attachment = LinkAttachment(
        link_id=link.id,
        user_id=user.id,
        filename=data.filename.strip(),
        content_type=data.content_type,
        data_url=data.data_url,
        size=len(data.data_url.encode("utf-8")),
    )
    db.add(attachment)
    _record_history(db, link, "attachment_added", {"filename": attachment.filename})
    db.commit()
    db.refresh(attachment)
    return {
        "id": attachment.id,
        "filename": attachment.filename,
        "content_type": attachment.content_type,
        "size": attachment.size,
        "created_at": attachment.created_at,
    }


@router.get("/{link_id}/attachments/{attachment_id}")
def get_attachment(
    link_id: int,
    attachment_id: int,
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    require_tab_access(db, user.id, link.tab_id, parse_unlock_tokens(folder_unlocks))
    attachment = (
        db.query(LinkAttachment)
        .filter(LinkAttachment.id == attachment_id, LinkAttachment.link_id == link.id, LinkAttachment.user_id == user.id)
        .first()
    )
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return {
        "id": attachment.id,
        "filename": attachment.filename,
        "content_type": attachment.content_type,
        "size": attachment.size,
        "data_url": attachment.data_url,
        "created_at": attachment.created_at,
    }


@router.post("/{link_id}/toggle-favorite", response_model=LinkOut)
def toggle_favorite(
    link_id: int,
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id, Link.deleted_at.is_(None)).first()
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
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id, Link.deleted_at.is_(None)).first()
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
    allowed_actions = {
        "delete", "restore", "destroy", "move", "pin", "unpin", "favorite", "unfavorite",
        "read", "unread", "set_priority", "add_tags", "remove_tags",
    }
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
            if link.deleted_at is None:
                link.deleted_at = datetime.now(timezone.utc)
                _record_history(db, link, "deleted", {"bulk": True})
                count += 1
            continue
        elif action.action == "restore":
            if link.deleted_at is not None:
                link.deleted_at = None
                _record_history(db, link, "restored", {"bulk": True})
                upsert_link_index(db, link)
                count += 1
            continue
        elif action.action == "destroy":
            db.delete(link)
            count += 1
            continue
        elif action.action == "move":
            link.tab_id = action.tab_id
            _record_history(db, link, "moved", {"tab_id": action.tab_id})
        elif action.action == "pin":
            link.is_pinned = True
            _record_history(db, link, "pinned", {"bulk": True})
        elif action.action == "unpin":
            link.is_pinned = False
            _record_history(db, link, "unpinned", {"bulk": True})
        elif action.action == "favorite":
            link.is_favorite = True
            _record_history(db, link, "favorited", {"bulk": True})
        elif action.action == "unfavorite":
            link.is_favorite = False
            _record_history(db, link, "unfavorited", {"bulk": True})
        elif action.action == "read":
            link.is_read = True
            _record_history(db, link, "marked_read", {"bulk": True})
        elif action.action == "unread":
            link.is_read = False
            _record_history(db, link, "marked_unread", {"bulk": True})
        elif action.action == "set_priority":
            link.priority = action.priority or "normal"
            _record_history(db, link, "priority_changed", {"priority": link.priority})
        elif action.action == "add_tags":
            link.tags = _merge_tags(link.tags, action.tags)
            _record_history(db, link, "tags_added", {"tags": action.tags})
        elif action.action == "remove_tags":
            remove = set(action.tags or [])
            link.tags = [tag for tag in (link.tags or []) if tag not in remove]
            _record_history(db, link, "tags_removed", {"tags": action.tags})
        upsert_link_index(db, link)
        count += 1
    if count:
        _notify(db, user.id, "bulk", "Bulk action complete", f"{count} links processed", {"action": action.action})
    db.commit()
    return BulkResult(affected=count, action=action.action)


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


@router.get("/{link_id}/highlights")
def list_highlights(link_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id, Link.deleted_at.is_(None)).first()
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
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id, Link.deleted_at.is_(None)).first()
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
    _record_history(db, link, "highlight_added", {"characters": len(text)})
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
    target = db.query(Link).filter(Link.id == data.target_id, Link.user_id == user.id, Link.deleted_at.is_(None)).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target link not found")

    source_ids = [source_id for source_id in data.source_ids if source_id != target.id]
    if not source_ids:
        raise HTTPException(status_code=400, detail="source_ids must contain at least one non-target link")

    sources = db.query(Link).filter(Link.id.in_(source_ids), Link.user_id == user.id, Link.deleted_at.is_(None)).all()
    if len(sources) != len(set(source_ids)):
        raise HTTPException(status_code=404, detail="One or more source links were not found")

    target_norm = target.canonical_url or _canonicalize_url(target.url) or _normalize_url_for_duplicates(target.url)
    for source in sources:
        source_norm = source.canonical_url or _canonicalize_url(source.url) or _normalize_url_for_duplicates(source.url)
        if source_norm != target_norm:
            raise HTTPException(status_code=400, detail="Only links with the same normalized URL can be merged")

    for source in sources:
        _merge_source_into_target(target, source)
        for model in (LinkHighlight, LinkArchive, LinkAttachment, LinkHistory, LinkHealthCheck):
            db.query(model).filter(model.link_id == source.id, model.user_id == user.id).update({"link_id": target.id}, synchronize_session=False)
        _record_history(db, target, "duplicate_merged", {"source_id": source.id, "source_title": source.title})
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
    query = _base_links_query(db, user.id)
    if tab_id is not None:
        query = query.filter(Link.tab_id == tab_id)
    links = query.order_by(Link.id).limit(50).all()

    alive = 0
    dead = 0
    redirects = 0
    checked = 0

    with httpx.Client(timeout=15, follow_redirects=True, trust_env=False) as client:
        for link in links:
            error = None
            final_url = None
            try:
                validate_public_http_url(link.url)
                resp = client.head(link.url)
                status = resp.status_code
                final_url = str(resp.url)
            except ValueError:
                status = 0
                error = "Invalid URL"
            except httpx.HTTPError as exc:
                status = 0
                error = str(exc)[:2000]

            link.http_status = status
            link.last_checked = datetime.now(timezone.utc)
            db.add(LinkHealthCheck(link_id=link.id, user_id=user.id, status=status, final_url=final_url, error=error))
            apply_automation_rules(db, link, "health_check")
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

# ── Reader Mode (Content Fetching) ─────────────────

@router.post("/{link_id}/fetch-content")
def fetch_link_content(
    link_id: int,
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id, Link.deleted_at.is_(None)).first()
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
    _record_history(db, link, "content_fetched", {"characters": len(link.content or "")})
    upsert_link_index(db, link)
    db.commit()
    db.refresh(link)

    return {"content": link.content, "content_fetched": link.content_fetched, "link_id": link.id}
