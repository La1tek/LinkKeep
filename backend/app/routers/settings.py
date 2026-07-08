import csv
import hashlib
import io
import json
import base64

from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Literal, List
import secrets
from html import escape
from datetime import datetime, timezone
from urllib.parse import urlparse

from app.database import get_db
from app.models import ApiToken, AppNotification, BackupSnapshot, User, Tab, Link
from app.schemas import ApiTokenCreate, ApiTokenCreated, ApiTokenOut, ImportPreviewOut, LinkOut, NotificationOut, TabOut, UserOut
from app.auth import get_password_hash, verify_password
from app.routers.auth import _get_current_user
from app import config
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


class SnapshotCreate(BaseModel):
    name: str | None = Field(default=None, max_length=160)


ImportMode = Literal["skip", "merge", "replace"]
ImportSource = Literal["bookmarks_html", "pocket_json", "raindrop_csv", "generic_json"]


def _normalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Only http and https URLs are allowed")
    hostname = (parsed.hostname or "").lower()
    if hostname.startswith("www."):
        hostname = hostname[4:]
    port = f":{parsed.port}" if parsed.port else ""
    path = parsed.path.rstrip("/") or "/"
    ignored = {"fbclid", "gclid", "dclid", "yclid", "mc_cid", "mc_eid", "igshid", "ref"}
    query_items = []
    for part in parsed.query.split("&"):
        if not part:
            continue
        key = part.split("=", 1)[0].lower()
        if key.startswith("utm_") or key in ignored:
            continue
        query_items.append(part)
    query = f"?{'&'.join(query_items)}" if query_items else ""
    return f"{parsed.scheme.lower()}://{hostname}{port}{path}{query}".lower()


def _new_api_token() -> str:
    return f"lkat_{secrets.token_urlsafe(32)}"


def _hash_api_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


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
    existing.is_read = bool(existing.is_read or link_data.get("is_read", False))
    existing.priority = link_data.get("priority") or existing.priority or "normal"
    existing.reminder_at = _parse_datetime(link_data.get("reminder_at")) or existing.reminder_at
    existing.note = _merge_notes(existing.note, link_data.get("note"))


def _parse_datetime(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _export_user_data(user: User, db: Session) -> dict:
    tabs = db.query(Tab).filter(Tab.user_id == user.id).all()
    links = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None)).all()
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
                "is_read": l.is_read, "priority": l.priority, "reminder_at": l.reminder_at.isoformat() if l.reminder_at else None,
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
            canonical_url=normalized_url,
            description=link_data.get("description"),
            favicon=link_data.get("favicon"),
            image=link_data.get("image"),
            tab_id=new_tab_id,
            tags=_clean_tags(link_data.get("tags", [])),
            is_favorite=link_data.get("is_favorite", False),
            is_pinned=link_data.get("is_pinned", False),
            is_read=link_data.get("is_read", False),
            priority=link_data.get("priority") or "normal",
            reminder_at=_parse_datetime(link_data.get("reminder_at")),
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


def _preview_user_data(data: ImportData, user: User, db: Session, mode: ImportMode) -> ImportPreviewOut:
    current_tabs = db.query(Tab).filter(Tab.user_id == user.id).all()
    current_links = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None)).all()
    tab_names = {tab.name for tab in current_tabs}
    link_urls = {}
    for link in current_links:
        try:
            link_urls[link.canonical_url or _normalize_url(link.url)] = link
        except ValueError:
            continue

    preview = ImportPreviewOut(
        mode=mode,
        replace_deletes_links=len(current_links) if mode == "replace" else 0,
        replace_deletes_tabs=len(current_tabs) if mode == "replace" else 0,
    )
    for tab_data in data.tabs:
        name = str(tab_data.get("name") or "Imported")[:128]
        if mode != "replace" and name in tab_names:
            preview.tabs_existing += 1
        else:
            preview.tabs_new += 1

    for link_data in data.links:
        url = str(link_data.get("url", "")).strip()
        try:
            normalized = _normalize_url(url)
        except ValueError:
            preview.links_invalid += 1
            continue
        if mode != "replace" and normalized in link_urls:
            preview.links_existing += 1
        else:
            preview.links_new += 1
        if len(preview.sample_links) < 5:
            preview.sample_links.append({"title": str(link_data.get("title") or "Untitled")[:256], "url": url})
    return preview


def _links_from_bookmarks_html(raw: str) -> list[dict]:
    soup = BeautifulSoup(raw, "html.parser")
    links = []
    for anchor in soup.find_all("a"):
        href = (anchor.get("href") or "").strip()
        if not href:
            continue
        links.append({
            "title": anchor.get_text(strip=True) or href,
            "url": href,
            "tags": ["imported"],
        })
    return links


def _links_from_pocket_json(raw: str) -> list[dict]:
    data = json.loads(raw)
    if isinstance(data, dict):
        items = data.get("list", data.get("items", data))
        if isinstance(items, dict):
            items = list(items.values())
    else:
        items = data
    links = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        url = item.get("given_url") or item.get("resolved_url") or item.get("url")
        if not url:
            continue
        links.append({
            "title": item.get("given_title") or item.get("resolved_title") or item.get("title") or url,
            "url": url,
            "tags": _clean_tags((item.get("tags") or {}).keys() if isinstance(item.get("tags"), dict) else item.get("tags", [])),
        })
    return links


def _links_from_raindrop_csv(raw: str) -> list[dict]:
    rows = csv.DictReader(io.StringIO(raw))
    links = []
    for row in rows:
        url = row.get("url") or row.get("link") or row.get("URL")
        if not url:
            continue
        tags = row.get("tags") or row.get("Tags") or ""
        links.append({
            "title": row.get("title") or row.get("Title") or url,
            "url": url,
            "description": row.get("excerpt") or row.get("description") or row.get("Description"),
            "tags": _clean_tags(tags.replace("|", ",").split(",")),
        })
    return links


def _parse_import_file(source: ImportSource, raw: str) -> ImportData:
    if source == "bookmarks_html":
        return ImportData(links=_links_from_bookmarks_html(raw))
    if source == "pocket_json":
        return ImportData(links=_links_from_pocket_json(raw))
    if source == "raindrop_csv":
        return ImportData(links=_links_from_raindrop_csv(raw))
    data = json.loads(raw)
    if isinstance(data, list):
        return ImportData(links=data)
    return ImportData(**data)


def _trim_backup_snapshots(db: Session, user_id: int) -> int:
    snapshots = (
        db.query(BackupSnapshot)
        .filter(BackupSnapshot.user_id == user_id)
        .order_by(BackupSnapshot.created_at.desc(), BackupSnapshot.id.desc())
        .all()
    )
    removed = 0
    for snapshot in snapshots[config.BACKUP_SNAPSHOT_RETENTION:]:
        db.delete(snapshot)
        removed += 1
    return removed


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


@router.get("/api-tokens", response_model=list[ApiTokenOut])
def list_api_tokens(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(ApiToken)
        .filter(ApiToken.user_id == user.id)
        .order_by(ApiToken.created_at.desc())
        .all()
    )


@router.post("/api-tokens", response_model=ApiTokenCreated, status_code=201)
def create_api_token(data: ApiTokenCreate, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    raw_token = _new_api_token()
    row = ApiToken(
        user_id=user.id,
        name=data.name,
        token_hash=_hash_api_token(raw_token),
        token_prefix=raw_token[:12],
        scopes=data.scopes,
    )
    db.add(row)
    db.add(AppNotification(user_id=user.id, type="api_token", title="API token created", body=data.name, payload={"token_name": data.name}))
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "name": row.name,
        "token_prefix": row.token_prefix,
        "scopes": row.scopes or [],
        "created_at": row.created_at,
        "last_used_at": row.last_used_at,
        "revoked_at": row.revoked_at,
        "token": raw_token,
    }


@router.delete("/api-tokens/{token_id}", status_code=204)
def revoke_api_token(token_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    row = db.query(ApiToken).filter(ApiToken.id == token_id, ApiToken.user_id == user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="API token not found")
    row.revoked_at = datetime.now(timezone.utc)
    db.commit()


@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(AppNotification)
        .filter(AppNotification.user_id == user.id)
        .order_by(AppNotification.created_at.desc())
        .limit(100)
        .all()
    )


@router.post("/notifications/{notification_id}/read", response_model=NotificationOut)
def mark_notification_read(notification_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    row = db.query(AppNotification).filter(AppNotification.id == notification_id, AppNotification.user_id == user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    row.read_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/notifications", status_code=204)
def clear_notifications(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    db.query(AppNotification).filter(AppNotification.user_id == user.id).delete()
    db.commit()


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


@router.post("/import/preview", response_model=ImportPreviewOut)
def preview_import_data(
    data: ImportData,
    mode: ImportMode = "merge",
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    return _preview_user_data(data, user, db, data.mode or mode)


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


@router.post("/restore/preview", response_model=ImportPreviewOut)
def preview_restore_data(
    data: ImportData,
    mode: ImportMode = "replace",
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    return _preview_user_data(data, user, db, data.mode or mode)


@router.post("/import-file")
async def import_file(
    source: ImportSource,
    mode: ImportMode = "merge",
    file: UploadFile = File(...),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    raw = (await file.read()).decode("utf-8", errors="replace")
    try:
        data = _parse_import_file(source, raw)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot parse import file: {exc}") from exc
    return _import_user_data(data, user, db, data.mode or mode)


@router.post("/import-file/preview", response_model=ImportPreviewOut)
async def preview_import_file(
    source: ImportSource,
    mode: ImportMode = "merge",
    file: UploadFile = File(...),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    raw = (await file.read()).decode("utf-8", errors="replace")
    try:
        data = _parse_import_file(source, raw)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot parse import file: {exc}") from exc
    return _preview_user_data(data, user, db, data.mode or mode)


@router.get("/snapshots")
def list_snapshots(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    snapshots = (
        db.query(BackupSnapshot)
        .filter(BackupSnapshot.user_id == user.id)
        .order_by(BackupSnapshot.created_at.desc(), BackupSnapshot.id.desc())
        .all()
    )
    return {
        "snapshots": [
            {"id": snapshot.id, "name": snapshot.name, "created_at": snapshot.created_at}
            for snapshot in snapshots
        ]
    }


@router.post("/snapshots", status_code=201)
def create_snapshot(
    data: SnapshotCreate | None = None,
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    snapshot = BackupSnapshot(
        user_id=user.id,
        name=(data.name if data else None) or f"Snapshot {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
        data=_export_user_data(user, db),
    )
    db.add(snapshot)
    db.flush()
    removed = _trim_backup_snapshots(db, user.id)
    db.commit()
    db.refresh(snapshot)
    return {"id": snapshot.id, "name": snapshot.name, "created_at": snapshot.created_at, "removed_old": removed}


@router.post("/snapshots/{snapshot_id}/restore")
def restore_snapshot(
    snapshot_id: int,
    mode: ImportMode = "replace",
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    snapshot = db.query(BackupSnapshot).filter(BackupSnapshot.id == snapshot_id, BackupSnapshot.user_id == user.id).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return _import_user_data(ImportData(**snapshot.data), user, db, mode)


@router.get("/snapshots/{snapshot_id}/preview", response_model=ImportPreviewOut)
def preview_snapshot_restore(
    snapshot_id: int,
    mode: ImportMode = "replace",
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    snapshot = db.query(BackupSnapshot).filter(BackupSnapshot.id == snapshot_id, BackupSnapshot.user_id == user.id).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return _preview_user_data(ImportData(**snapshot.data), user, db, mode)


@router.delete("/snapshots/{snapshot_id}", status_code=204)
def delete_snapshot(snapshot_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    snapshot = db.query(BackupSnapshot).filter(BackupSnapshot.id == snapshot_id, BackupSnapshot.user_id == user.id).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    db.delete(snapshot)
    db.commit()


@router.delete("/account", status_code=204)
def delete_account(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    db.delete(user)
    db.commit()


@router.get("/export-html")
def export_html(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    from fastapi.responses import Response

    tabs = db.query(Tab).filter(Tab.user_id == user.id).all()
    links = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None)).all()

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
