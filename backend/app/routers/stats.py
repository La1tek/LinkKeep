from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Link, Tab
from app.schemas import StatsOut, LinkOut
from app.routers.auth import _get_current_user

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("", response_model=StatsOut)
def get_stats(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    total_links = db.query(Link).filter(Link.user_id == user.id).count()
    total_tabs = db.query(Tab).filter(Tab.user_id == user.id).count()
    total_favorites = db.query(Link).filter(Link.user_id == user.id, Link.is_favorite == True).count()
    total_pinned = db.query(Link).filter(Link.user_id == user.id, Link.is_pinned == True).count()
    recent = (
        db.query(Link)
        .filter(Link.user_id == user.id)
        .order_by(Link.created_at.desc())
        .limit(5)
        .all()
    )
    return StatsOut(
        total_links=total_links,
        total_tabs=total_tabs,
        total_favorites=total_favorites,
        total_pinned=total_pinned,
        recent_links=recent,
    )
