from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Link, LinkArchive, User
from app.routers.auth import _get_current_user
from app.services.archive import create_link_archive
from app.services.folder_access import parse_unlock_tokens, require_tab_access


router = APIRouter(prefix="/api", tags=["archives"])


def _archive_out(archive: LinkArchive, include_payload: bool = False) -> dict:
    data = {
        "id": archive.id,
        "link_id": archive.link_id,
        "status": archive.status,
        "error": archive.error,
        "source_url": archive.source_url,
        "created_at": archive.created_at,
        "updated_at": archive.updated_at,
        "has_html": bool(archive.html_snapshot),
        "has_text": bool(archive.readable_text),
        "has_screenshot": bool(archive.screenshot_data_url),
        "has_pdf": bool(archive.pdf_data_url),
    }
    if include_payload:
        data.update(
            {
                "html_snapshot": archive.html_snapshot,
                "readable_text": archive.readable_text,
                "screenshot_data_url": archive.screenshot_data_url,
                "pdf_data_url": archive.pdf_data_url,
            }
        )
    return data


@router.post("/links/{link_id}/archive", status_code=201)
async def archive_link(
    link_id: int,
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    require_tab_access(db, user.id, link.tab_id, parse_unlock_tokens(folder_unlocks))
    archive = await create_link_archive(db, link)
    return _archive_out(archive)


@router.get("/links/{link_id}/archives")
def list_link_archives(
    link_id: int,
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    require_tab_access(db, user.id, link.tab_id, parse_unlock_tokens(folder_unlocks))
    archives = (
        db.query(LinkArchive)
        .filter(LinkArchive.link_id == link.id, LinkArchive.user_id == user.id)
        .order_by(LinkArchive.created_at.desc())
        .all()
    )
    return {"archives": [_archive_out(archive) for archive in archives]}


@router.get("/archives/{archive_id}")
def get_archive(
    archive_id: int,
    folder_unlocks: str | None = Header(None, alias="X-LinkKeep-Folder-Unlocks"),
    user: User = Depends(_get_current_user),
    db: Session = Depends(get_db),
):
    archive = db.query(LinkArchive).filter(LinkArchive.id == archive_id, LinkArchive.user_id == user.id).first()
    if not archive:
        raise HTTPException(status_code=404, detail="Archive not found")
    require_tab_access(db, user.id, archive.link.tab_id, parse_unlock_tokens(folder_unlocks))
    return _archive_out(archive, include_payload=True)
