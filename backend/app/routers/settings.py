from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Literal, List
import secrets
from html import escape
from datetime import datetime, timezone
from urllib.parse import urlparse

from app.database import get_db
from app.models import User, Tab, Link
from app.schemas import LinkOut, TabOut, UserOut
from app.auth import get_password_hash, verify_password
from app.routers.auth import _get_current_user
from app.version import APP_VERSION

router = APIRouter(prefix="/api/settings", tags=["settings"])


class ChangePassword(BaseModel):
    current_password: str
    new_password: str = Field(min_length=4, max_length=256)


class ChangeUsername(BaseModel):
    new_username: str = Field(min_length=1, max_length=64)


class ImportData(BaseModel):
    tabs: List[dict] = Field(default_factory=list)
    links: List[dict] = Field(default_factory=list)
    mode: Literal["skip", "merge", "replace"] | None = None


ImportMode = Literal["skip", "merge", "replace"]


def _normalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Only http and https URLs are allowed")
    hostname = (parsed.hostname or "").lower()
    if hostname.startswith("www."):
        hostname = hostname[4:]
    port = f":{parsed.port}" if parsed.port else ""
    path = parsed.path.rstrip("/") or "/"
    query = f"?{parsed.query}" if parsed.query else ""
    return f"{parsed.scheme}://{hostname}{port}{path}{query}".lower()


def _clean_tags(tags) -> list[str]:
    result = []
    seen = set()
    for tag in tags or []:
        value = str(tag).strip()
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value[:64])
    return result


def _merge_notes(current: str | None, incoming: str | None) -> str | None:
    if not incoming:
        return current
    if not current:
        return incoming
    if incoming in current:
        return current
    return f"{current}\n\n{incoming}"


def _merge_link(existing: Link, link_data: dict, tab_id: int | None) -> None:
    if not existing.title or existing.title == "Untitled":
        existing.title = str(link_data.get("title") or "Untitled")[:256]
    for field in ("description", "favicon", "image", "content"):
        incoming = link_data.get(field)
        if incoming and not getattr(existing, field):
            setattr(existing, field, incoming)
    if tab_id is not None and existing.tab_id is None:
        existing.tab_id = tab_id
    existing.tags = _clean_tags([*(existing.tags or []), *link_data.get("tags", [])])
    existing.is_favorite = bool(existing.is_favorite or link_data.get("is_favorite", False))
    existing.is_pinned = bool(existing.is_pinned or link_data.get("is_pinned", False))
    existing.note = _merge_notes(existing.note, link_data.get("note"))


def _export_user_data(user: User, db: Session) -> dict:
    tabs = db.query(Tab).filter(Tab.user_id == user.id).all()
    links = db.query(Link).filter(Link.user_id == user.id).all()
    return {
        "version": APP_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user": {"username": user.username, "created_at": user.created_at.isoformat() if user.created_at else None},
        "tabs": [
            {"id": t.id, "name": t.name, "color": t.color, "icon": t.icon, "sort_order": t.sort_order, "parent_id": t.parent_id}
            for t in tabs
        ],
        "links": [
            {
                "id": l.id, "title": l.title, "url": l.url, "description": l.description,
                "favicon": l.favicon, "tab_id": l.tab_id, "tags": l.tags or [],
                "is_favorite": l.is_favorite, "is_pinned": l.is_pinned, "note": l.note,
                "image": l.image, "sort_order": l.sort_order,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in links
        ],
    }


def _import_user_data(data: ImportData, user: User, db: Session, mode: ImportMode) -> dict:
    if mode == "replace":
        db.query(Link).filter(Link.user_id == user.id).delete()
        db.query(Tab).filter(Tab.user_id == user.id).delete()
        db.flush()

    tab_id_map = {}
    pending_parents = []
    result = {"mode": mode, "tabs": 0, "links": 0, "merged": 0, "skipped": 0}

    for tab_data in data.tabs:
        old_id = tab_data.get("id")
        name = str(tab_data.get("name") or "Imported")[:128]
        existing_tab = None
        if mode in {"skip", "merge"}:
            existing_tab = db.query(Tab).filter(Tab.user_id == user.id, Tab.name == name).first()

        if existing_tab and mode == "skip":
            if old_id:
                tab_id_map[old_id] = existing_tab.id
            result["skipped"] += 1
            continue

        if existing_tab and mode == "merge":
            existing_tab.color = tab_data.get("color") or existing_tab.color
            existing_tab.icon = tab_data.get("icon") or existing_tab.icon
            existing_tab.sort_order = tab_data.get("sort_order", existing_tab.sort_order)
            if old_id:
                tab_id_map[old_id] = existing_tab.id
            pending_parents.append((existing_tab, tab_data.get("parent_id")))
            result["merged"] += 1
            continue

        new_tab = Tab(
            name=name,
            color=tab_data.get("color", "#6366f1"),
            icon=tab_data.get("icon", "FolderSimple"),
            sort_order=tab_data.get("sort_order", 0),
            user_id=user.id,
        )
        db.add(new_tab)
        db.flush()
        if old_id:
            tab_id_map[old_id] = new_tab.id
        pending_parents.append((new_tab, tab_data.get("parent_id")))
        result["tabs"] += 1

    for tab, old_parent_id in pending_parents:
        if old_parent_id and old_parent_id in tab_id_map and tab_id_map[old_parent_id] != tab.id:
            tab.parent_id = tab_id_map[old_parent_id]

    existing_by_url = {
        _normalize_url(link.url): link
        for link in db.query(Link).filter(Link.user_id == user.id).all()
    }

    for link_data in data.links:
        url = str(link_data.get("url", "")).strip()
        try:
            normalized_url = _normalize_url(url)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid import URL: {exc}") from exc

        old_tab_id = link_data.get("tab_id")
        new_tab_id = tab_id_map.get(old_tab_id) if old_tab_id else None
        existing_link = existing_by_url.get(normalized_url)

        if existing_link and mode == "skip":
            result["skipped"] += 1
            continue

        if existing_link and mode == "merge":
            _merge_link(existing_link, link_data, new_tab_id)
            result["merged"] += 1
            continue

        new_link = Link(
            title=str(link_data.get("title") or "Untitled")[:256],
            url=url,
            description=link_data.get("description"),
            favicon=link_data.get("favicon"),
            image=link_data.get("image"),
            tab_id=new_tab_id,
            tags=_clean_tags(link_data.get("tags", [])),
            is_favorite=link_data.get("is_favorite", False),
            is_pinned=link_data.get("is_pinned", False),
            note=link_data.get("note"),
            sort_order=link_data.get("sort_order", 0),
            user_id=user.id,
        )
        db.add(new_link)
        db.flush()
        existing_by_url[normalized_url] = new_link
        result["links"] += 1

    db.commit()
    return {"message": "Import complete", **result}


@router.put("/password")
def change_password(data: ChangePassword, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(data.new_password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    return {"message": "Password updated"}


@router.put("/username", response_model=UserOut)
def change_username(data: ChangeUsername, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == data.new_username).first()
    if existing and existing.id != user.id:
        raise HTTPException(status_code=400, detail="Username already taken")
    user.username = data.new_username
    db.commit()
    db.refresh(user)
    return user


@router.post("/bot-token")
def create_bot_token(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    token = secrets.token_urlsafe(24)
    user_settings = dict(user.settings or {})
    user_settings["bot_link_token"] = token
    user.settings = user_settings
    db.commit()
    return {"token": token, "command": f"/start {token}"}


@router.get("/export")
def export_data(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    return _export_user_data(user, db)


@router.post("/import")
def import_data(
    data: ImportData,
    mode: ImportMode = "merge",
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    return _import_user_data(data, user, db, data.mode or mode)


@router.get("/backup")
def backup_data(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    return _export_user_data(user, db)


@router.post("/restore")
def restore_data(
    data: ImportData,
    mode: ImportMode = "replace",
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    return _import_user_data(data, user, db, data.mode or mode)


@router.delete("/account", status_code=204)
def delete_account(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    db.delete(user)
    db.commit()


@router.get("/export-html")
def export_html(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    from fastapi.responses import Response

    tabs = db.query(Tab).filter(Tab.user_id == user.id).all()
    links = db.query(Link).filter(Link.user_id == user.id).all()

    html_parts = [
        "<!DOCTYPE html>",
        '<html><head><meta charset="UTF-8">',
        f"<title>LinkKeep Export - {escape(user.username)}</title>",
        "</head><body>",
        f"<h1>LinkKeep - {escape(user.username)}</h1>",
    ]

    for tab in tabs:
        tab_links = [l for l in links if l.tab_id == tab.id]
        html_parts.append(f"<h2>{escape(tab.name)}</h2><ul>")
        for link in tab_links:
            html_parts.append(f'<li><a href="{escape(link.url, quote=True)}">{escape(link.title)}</a></li>')
        html_parts.append("</ul>")

    # Links without tabs
    orphan = [l for l in links if l.tab_id is None]
    if orphan:
        html_parts.append("<h2>Unsorted</h2><ul>")
        for link in orphan:
            html_parts.append(f'<li><a href="{escape(link.url, quote=True)}">{escape(link.title)}</a></li>')
        html_parts.append("</ul>")

    html_parts.append("</body></html>")
    return Response(content="\n".join(html_parts), media_type="text/html",
                    headers={"Content-Disposition": "attachment; filename=linkkeep-export.html"})
