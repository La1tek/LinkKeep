from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Link, SavedSearch, SmartCollection, Tab, User
from app.routers.auth import _get_current_user
from app.schemas import LinkOut
from app.services.search_index import rebuild_user_index, search_user_links
from app.services.folder_access import hidden_locked_descendant_ids, parse_unlock_tokens, unlocked_tab_ids
from app.services.search_query import apply_db_filters, apply_python_filters, parse_search_query

router = APIRouter(prefix="/api/search", tags=["search"])


class SearchCollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    query: str = Field(min_length=1, max_length=1000)
    color: str | None = "#6366f1"


def _blocked_tab_ids(db: Session, user_id: int, tokens: list[str]) -> set[int]:
    hidden_ids = hidden_locked_descendant_ids(db, user_id, tokens)
    unlocked = unlocked_tab_ids(db, user_id, tokens)
    locked_closed_ids = {
        row.id
        for row in db.query(Tab.id, Tab.password_hash).filter(Tab.user_id == user_id).all()
        if row.password_hash and row.id not in unlocked
    }
    return hidden_ids | locked_closed_ids


def _visible_links(links: list[Link], blocked_ids: set[int]) -> list[Link]:
    if not blocked_ids:
        return links
    return [link for link in links if link.tab_id is None or link.tab_id not in blocked_ids]


@router.get("/fulltext")
def fulltext_search(
    q: str = Query(min_length=1),
    tag: str | None = None,
    favorite: bool | None = None,
    dead: bool | None = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    filters = parse_search_query(q)
    if tag:
        filters.tags.append(tag)
    if favorite is not None:
        base_query = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None), Link.is_favorite == favorite)
    else:
        base_query = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None))
    if dead is not None:
        filters.is_dead = dead

    if filters.text:
        links = search_user_links(db, user.id, filters.text, limit=limit, offset=offset)
        if favorite is not None:
            links = [link for link in links if bool(link.is_favorite) == favorite]
    else:
        links = apply_db_filters(base_query, filters).order_by(Link.created_at.desc()).offset(offset).limit(limit).all()

    links = apply_python_filters(links, filters)
    links = _visible_links(links, _blocked_tab_ids(db, user.id, parse_unlock_tokens(folder_unlocks)))

    return {
        "query": q,
        "count": len(links),
        "links": [LinkOut.model_validate(link) for link in links],
        "filters": {
            "text": filters.text,
            "tags": filters.tags,
            "site": filters.site,
            "type": filters.link_type,
            "is_dead": filters.is_dead,
            "has_note": filters.has_note,
            "has_archive": filters.has_archive,
            "before": filters.before,
            "after": filters.after,
        },
    }


@router.post("/reindex")
def reindex(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    indexed = rebuild_user_index(db, user.id)
    db.commit()
    return {"indexed": indexed}


@router.get("/saved")
def list_saved_searches(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    rows = db.query(SavedSearch).filter(SavedSearch.user_id == user.id).order_by(SavedSearch.created_at.desc()).all()
    return {"saved_searches": [{"id": row.id, "name": row.name, "query": row.query, "created_at": row.created_at} for row in rows]}


@router.post("/saved", status_code=201)
def create_saved_search(data: SearchCollectionCreate, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    row = SavedSearch(user_id=user.id, name=data.name, query=data.query, created_at=datetime.now(timezone.utc))
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "name": row.name, "query": row.query, "created_at": row.created_at}


@router.delete("/saved/{search_id}", status_code=204)
def delete_saved_search(search_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    row = db.query(SavedSearch).filter(SavedSearch.id == search_id, SavedSearch.user_id == user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Saved search not found")
    db.delete(row)
    db.commit()


@router.get("/smart")
def list_smart_collections(
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.query(SmartCollection).filter(SmartCollection.user_id == user.id).order_by(SmartCollection.created_at.desc()).all()
    blocked_ids = _blocked_tab_ids(db, user.id, parse_unlock_tokens(folder_unlocks))
    result = []
    for row in rows:
        filters = parse_search_query(row.query)
        links = apply_python_filters(apply_db_filters(db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None)), filters).limit(500).all(), filters)
        result.append({"id": row.id, "name": row.name, "query": row.query, "color": row.color, "count": len(_visible_links(links, blocked_ids)), "created_at": row.created_at})
    return {"smart_collections": result}


@router.post("/smart", status_code=201)
def create_smart_collection(data: SearchCollectionCreate, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    row = SmartCollection(user_id=user.id, name=data.name, query=data.query, color=data.color or "#6366f1", created_at=datetime.now(timezone.utc))
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "name": row.name, "query": row.query, "color": row.color, "created_at": row.created_at}


@router.delete("/smart/{collection_id}", status_code=204)
def delete_smart_collection(collection_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    row = db.query(SmartCollection).filter(SmartCollection.id == collection_id, SmartCollection.user_id == user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Smart collection not found")
    db.delete(row)
    db.commit()
