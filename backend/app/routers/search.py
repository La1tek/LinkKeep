from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Link, User
from app.routers.auth import _get_current_user
from app.schemas import LinkOut
from app.services.search_index import rebuild_user_index, search_user_links

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("/fulltext")
def fulltext_search(
    q: str = Query(min_length=1),
    tag: str | None = None,
    favorite: bool | None = None,
    dead: bool | None = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    links = search_user_links(db, user.id, q, limit=limit, offset=offset)
    if tag:
        links = [link for link in links if tag in (link.tags or [])]
    if favorite is not None:
        links = [link for link in links if bool(link.is_favorite) == favorite]
    if dead is not None:
        links = [link for link in links if ((link.http_status == 0) or (link.http_status or 0) >= 400) == dead]

    return {
        "query": q,
        "count": len(links),
        "links": [LinkOut.model_validate(link) for link in links],
    }


@router.post("/reindex")
def reindex(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    indexed = rebuild_user_index(db, user.id)
    db.commit()
    return {"indexed": indexed}
