from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Link, User
from app.routers.auth import _get_current_user

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


DOMAIN_TAGS = {
    "github.com": "code",
    "gitlab.com": "code",
    "stackoverflow.com": "dev",
    "medium.com": "article",
    "youtube.com": "video",
    "youtu.be": "video",
    "docs.": "docs",
}


def _suggest_tags(link: Link) -> list[str]:
    text = f"{link.title} {link.description or ''} {link.url}".lower()
    host = ""
    try:
        host = urlparse(link.url).hostname or ""
    except Exception:
        pass
    suggestions = set()
    for domain, tag in DOMAIN_TAGS.items():
        if domain in host:
            suggestions.add(tag)
    if any(word in text for word in ("docs", "documentation", "guide", "manual")):
        suggestions.add("docs")
    if any(word in text for word in ("tutorial", "course", "learn")):
        suggestions.add("learning")
    if any(word in text for word in ("pricing", "invoice", "billing")):
        suggestions.add("finance")
    return sorted(tag for tag in suggestions if tag not in (link.tags or []))


@router.get("")
def get_recommendations(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    links = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None)).order_by(Link.updated_at.desc()).limit(200).all()
    stale_cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    autotags = []
    stale = []
    dead = []
    for link in links:
        tags = _suggest_tags(link)
        if tags:
            autotags.append({"link_id": link.id, "title": link.title, "url": link.url, "suggested_tags": tags})
        updated_at = link.updated_at.replace(tzinfo=timezone.utc) if link.updated_at else None
        if updated_at and updated_at < stale_cutoff:
            stale.append({"link_id": link.id, "title": link.title, "url": link.url, "updated_at": link.updated_at})
        if link.http_status == 0 or (link.http_status or 0) >= 400:
            dead.append({"link_id": link.id, "title": link.title, "url": link.url, "http_status": link.http_status})
    return {"autotags": autotags[:50], "stale": stale[:50], "dead": dead[:50]}


@router.post("/apply-tags")
def apply_recommended_tags(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    updated = 0
    links = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None)).all()
    for link in links:
        suggested = _suggest_tags(link)
        if not suggested:
            continue
        link.tags = [*(link.tags or []), *suggested]
        updated += 1
    db.commit()
    return {"updated": updated}
