from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List
import json
import secrets
from html import escape

from app.database import get_db
from app.models import User, Tab, Link
from app.schemas import LinkOut, TabOut, UserOut
from app.auth import get_password_hash, verify_password
from app.routers.auth import _get_current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])


class ChangePassword(BaseModel):
    current_password: str
    new_password: str = Field(min_length=4, max_length=256)


class ChangeUsername(BaseModel):
    new_username: str = Field(min_length=1, max_length=64)


class ImportData(BaseModel):
    tabs: List[dict] = Field(default_factory=list)
    links: List[dict] = Field(default_factory=list)


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
    tabs = db.query(Tab).filter(Tab.user_id == user.id).all()
    links = db.query(Link).filter(Link.user_id == user.id).all()
    return {
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


@router.post("/import")
def import_data(data: ImportData, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    tab_id_map = {}
    imported = {"tabs": 0, "links": 0}

    for tab_data in data.tabs:
        new_tab = Tab(
            name=tab_data.get("name", "Imported"),
            color=tab_data.get("color", "#6366f1"),
            icon=tab_data.get("icon", "FolderSimple"),
            sort_order=tab_data.get("sort_order", 0),
            user_id=user.id,
        )
        db.add(new_tab)
        db.flush()
        old_id = tab_data.get("id")
        if old_id:
            tab_id_map[old_id] = new_tab.id
        imported["tabs"] += 1

    for link_data in data.links:
        url = str(link_data.get("url", "")).strip()
        if not (url.startswith("http://") or url.startswith("https://")):
            raise HTTPException(status_code=400, detail="Invalid import URL: Only http and https URLs are allowed")
        old_tab_id = link_data.get("tab_id")
        new_tab_id = tab_id_map.get(old_tab_id) if old_tab_id else None
        new_link = Link(
            title=link_data.get("title", "Untitled"),
            url=url,
            description=link_data.get("description"),
            favicon=link_data.get("favicon"),
            image=link_data.get("image"),
            tab_id=new_tab_id,
            tags=link_data.get("tags", []),
            is_favorite=link_data.get("is_favorite", False),
            is_pinned=link_data.get("is_pinned", False),
            note=link_data.get("note"),
            sort_order=link_data.get("sort_order", 0),
            user_id=user.id,
        )
        db.add(new_link)
        imported["links"] += 1

    db.commit()
    return {"message": "Import complete", **imported}


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
