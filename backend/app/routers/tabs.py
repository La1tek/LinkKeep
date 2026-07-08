from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel, Field

from app.database import get_db
from app.models import User, Tab, Link
from app.schemas import TabCreate, TabUpdate, TabOut
from app.routers.auth import _get_current_user
from app.auth import get_password_hash, verify_password
from app.services.folder_access import hidden_locked_descendant_ids, issue_folder_unlock, parse_unlock_tokens, unlocked_tab_ids
from app.services.folder_access import require_tab_access

router = APIRouter(prefix="/api/tabs", tags=["tabs"])


def _descendant_tab_ids(db: Session, user_id: int, tab_id: int) -> set[int]:
    descendants = set()
    pending = [tab_id]
    while pending:
        parent = pending.pop()
        children = db.query(Tab.id).filter(Tab.user_id == user_id, Tab.parent_id == parent).all()
        for child in children:
            if child.id not in descendants:
                descendants.add(child.id)
                pending.append(child.id)
    return descendants


def _validate_parent(db: Session, user_id: int, tab_id: int | None, parent_id: int | None):
    if parent_id is None:
        return
    parent = db.query(Tab).filter(Tab.id == parent_id, Tab.user_id == user_id).first()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent tab not found")
    if tab_id is not None and parent_id == tab_id:
        raise HTTPException(status_code=400, detail="A tab cannot be its own parent")
    if tab_id is not None and parent_id in _descendant_tab_ids(db, user_id, tab_id):
        raise HTTPException(status_code=400, detail="A tab cannot be moved under its descendant")


class FolderPasswordRequest(BaseModel):
    password: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")


@router.get("", response_model=List[TabOut])
def list_tabs(
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
):
    tokens = parse_unlock_tokens(folder_unlocks)
    unlocked = unlocked_tab_ids(db, user.id, tokens)
    hidden_ids = hidden_locked_descendant_ids(db, user.id, tokens)
    tabs = db.query(Tab).filter(Tab.user_id == user.id).order_by(Tab.sort_order, Tab.id).all()
    by_parent = {}
    for t in tabs:
        if t.id in hidden_ids:
            continue
        by_parent.setdefault(t.parent_id, []).append(t.id)

    def total_links(tab_id: int) -> int:
        total = db.query(Link).filter(Link.user_id == user.id, Link.tab_id == tab_id, Link.deleted_at.is_(None)).count()
        for child_id in by_parent.get(tab_id, []):
            total += total_links(child_id)
        return total

    result = []
    for t in tabs:
        if t.id in hidden_ids:
            continue
        locked_closed = bool(t.password_hash and t.id not in unlocked)
        out = TabOut.model_validate(t)
        out.is_locked = bool(t.password_hash)
        out.is_unlocked = bool(t.password_hash and t.id in unlocked)
        out.link_count = 0 if locked_closed else db.query(Link).filter(Link.user_id == user.id, Link.tab_id == t.id, Link.deleted_at.is_(None)).count()
        out.child_count = 0 if locked_closed else len(by_parent.get(t.id, []))
        out.total_link_count = 0 if locked_closed else total_links(t.id)
        result.append(out)
    return result


@router.post("", response_model=TabOut, status_code=201)
def create_tab(tab: TabCreate, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    _validate_parent(db, user.id, None, tab.parent_id)
    max_order = db.query(Tab).filter(Tab.user_id == user.id).count()
    new_tab = Tab(
        name=tab.name,
        icon=tab.icon,
        color=tab.color,
        sort_order=max_order,
        parent_id=tab.parent_id,
        user_id=user.id,
    )
    db.add(new_tab)
    db.commit()
    db.refresh(new_tab)
    out = TabOut.model_validate(new_tab)
    out.link_count = 0
    return out


@router.put("/{tab_id}", response_model=TabOut)
def update_tab(
    tab_id: int,
    data: TabUpdate,
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    tab = db.query(Tab).filter(Tab.id == tab_id, Tab.user_id == user.id).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Tab not found")
    require_tab_access(db, user.id, tab.id, parse_unlock_tokens(folder_unlocks))
    update_data = data.model_dump(exclude_unset=True)
    if "parent_id" in update_data:
        _validate_parent(db, user.id, tab_id, update_data["parent_id"])
        require_tab_access(db, user.id, update_data["parent_id"], parse_unlock_tokens(folder_unlocks))
    for field, value in update_data.items():
        setattr(tab, field, value)
    db.commit()
    db.refresh(tab)
    out = TabOut.model_validate(tab)
    out.link_count = db.query(Link).filter(Link.user_id == user.id, Link.tab_id == tab.id, Link.deleted_at.is_(None)).count()
    return out


class ReorderItem(BaseModel):
    id: int
    sort_order: int


@router.post("/reorder")
def reorder_tabs(
    items: List[ReorderItem],
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    tokens = parse_unlock_tokens(folder_unlocks)
    for item in items:
        tab = db.query(Tab).filter(Tab.id == item.id, Tab.user_id == user.id).first()
        if tab:
            require_tab_access(db, user.id, tab.id, tokens)
            tab.sort_order = item.sort_order
    db.commit()
    return {"status": "ok"}


@router.post("/{tab_id}/lock")
def lock_tab(
    tab_id: int,
    data: FolderPasswordRequest,
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    tab = db.query(Tab).filter(Tab.id == tab_id, Tab.user_id == user.id).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Tab not found")
    tab.password_hash = get_password_hash(data.password)
    tab.locked_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "locked", "tab_id": tab.id}


@router.post("/{tab_id}/unlock")
def unlock_tab(
    tab_id: int,
    data: FolderPasswordRequest,
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    tab = db.query(Tab).filter(Tab.id == tab_id, Tab.user_id == user.id).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Tab not found")
    if not tab.password_hash:
        return {"status": "unlocked", "tab_id": tab.id, "unlock_token": None, "expires_at": None}
    if not verify_password(data.password, tab.password_hash):
        raise HTTPException(status_code=403, detail="Incorrect folder PIN")
    token, expires_at = issue_folder_unlock(db, user.id, tab.id)
    db.commit()
    return {"status": "unlocked", "tab_id": tab.id, "unlock_token": token, "expires_at": expires_at}


@router.delete("/{tab_id}/lock", status_code=204)
def unlock_tab_permanently(
    tab_id: int,
    data: FolderPasswordRequest,
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    tab = db.query(Tab).filter(Tab.id == tab_id, Tab.user_id == user.id).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Tab not found")
    if tab.password_hash and not verify_password(data.password, tab.password_hash):
        raise HTTPException(status_code=403, detail="Incorrect folder PIN")
    tab.password_hash = None
    tab.locked_at = None
    db.commit()


@router.delete("/{tab_id}", status_code=204)
def delete_tab(
    tab_id: int,
    keep_links: bool = False,
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    tab = db.query(Tab).filter(Tab.id == tab_id, Tab.user_id == user.id).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Tab not found")
    require_tab_access(db, user.id, tab.id, parse_unlock_tokens(folder_unlocks))
    if keep_links:
        db.query(Link).filter(Link.tab_id == tab_id, Link.user_id == user.id).update({"tab_id": None})
    db.delete(tab)
    db.commit()
