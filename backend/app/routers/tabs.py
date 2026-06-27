from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from app.database import get_db
from app.models import User, Tab, Link
from app.schemas import TabCreate, TabUpdate, TabOut
from app.routers.auth import _get_current_user

router = APIRouter(prefix="/api/tabs", tags=["tabs"])


@router.get("", response_model=List[TabOut])
def list_tabs(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    tabs = db.query(Tab).filter(Tab.user_id == user.id).order_by(Tab.sort_order, Tab.id).all()
    result = []
    for t in tabs:
        out = TabOut.model_validate(t)
        out.link_count = db.query(Link).filter(Link.tab_id == t.id).count()
        result.append(out)
    return result


@router.post("", response_model=TabOut, status_code=201)
def create_tab(tab: TabCreate, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
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
def update_tab(tab_id: int, data: TabUpdate, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    tab = db.query(Tab).filter(Tab.id == tab_id, Tab.user_id == user.id).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Tab not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(tab, field, value)
    db.commit()
    db.refresh(tab)
    out = TabOut.model_validate(tab)
    out.link_count = db.query(Link).filter(Link.tab_id == tab.id).count()
    return out


class ReorderItem(BaseModel):
    id: int
    sort_order: int


@router.post("/reorder")
def reorder_tabs(items: List[ReorderItem], user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    for item in items:
        tab = db.query(Tab).filter(Tab.id == item.id, Tab.user_id == user.id).first()
        if tab:
            tab.sort_order = item.sort_order
    db.commit()
    return {"status": "ok"}


@router.delete("/{tab_id}", status_code=204)
def delete_tab(tab_id: int, keep_links: bool = False, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    tab = db.query(Tab).filter(Tab.id == tab_id, Tab.user_id == user.id).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Tab not found")
    if keep_links:
        db.query(Link).filter(Link.tab_id == tab_id).update({"tab_id": None})
    db.delete(tab)
    db.commit()
