from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Link, User
from app.routers.auth import _get_current_user

router = APIRouter(prefix="/api/tags", tags=["tags"])


class TagRename(BaseModel):
    new_name: str = Field(min_length=1, max_length=64)


def _clean_tag(value: str) -> str:
    value = value.strip()
    if not value:
        raise HTTPException(status_code=400, detail="Tag is required")
    return value[:64]


@router.get("")
def list_tags(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    counts: dict[str, int] = {}
    links = db.query(Link.tags).filter(Link.user_id == user.id).all()
    for row in links:
        for tag in row.tags or []:
            counts[tag] = counts.get(tag, 0) + 1
    return {
        "tags": [
            {"name": name, "count": count}
            for name, count in sorted(counts.items(), key=lambda item: (-item[1], item[0].lower()))
        ]
    }


@router.put("/{tag_name}")
def rename_tag(
    tag_name: str,
    data: TagRename,
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    old_name = _clean_tag(tag_name)
    new_name = _clean_tag(data.new_name)
    updated = 0

    links = db.query(Link).filter(Link.user_id == user.id).all()
    for link in links:
        tags = link.tags or []
        if old_name not in tags:
            continue
        renamed = [new_name if tag == old_name else tag for tag in tags]
        deduped = []
        seen = set()
        for tag in renamed:
            if tag in seen:
                continue
            seen.add(tag)
            deduped.append(tag)
        link.tags = deduped
        updated += 1

    if updated == 0:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.commit()
    return {"updated": updated, "tag": new_name}


@router.delete("/{tag_name}")
def delete_tag(tag_name: str, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    name = _clean_tag(tag_name)
    updated = 0

    links = db.query(Link).filter(Link.user_id == user.id).all()
    for link in links:
        tags = link.tags or []
        if name not in tags:
            continue
        link.tags = [tag for tag in tags if tag != name]
        updated += 1

    if updated == 0:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.commit()
    return {"updated": updated}
