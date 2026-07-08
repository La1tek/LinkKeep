from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import config
from app.database import get_db
from app.models import ApiToken, AppNotification, BackupSnapshot, Job, Link, LinkArchive, SessionToken, Tab, User
from app.routers.auth import _get_current_user

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _require_admin(user: User = Depends(_get_current_user)) -> User:
    if config.ADMIN_USERNAMES and user.username in config.ADMIN_USERNAMES:
        return user
    raise HTTPException(status_code=403, detail="Admin access required")


@router.get("/overview")
def overview(admin: User = Depends(_require_admin), db: Session = Depends(get_db)):
    return {
        "users": db.query(User).count(),
        "links": db.query(Link).count(),
        "active_links": db.query(Link).filter(Link.deleted_at.is_(None)).count(),
        "trashed_links": db.query(Link).filter(Link.deleted_at.isnot(None)).count(),
        "tabs": db.query(Tab).count(),
        "jobs": {
            "queued": db.query(Job).filter(Job.status == "queued").count(),
            "running": db.query(Job).filter(Job.status == "running").count(),
            "failed": db.query(Job).filter(Job.status == "failed").count(),
        },
        "archives": {
            "succeeded": db.query(LinkArchive).filter(LinkArchive.status == "succeeded").count(),
            "failed": db.query(LinkArchive).filter(LinkArchive.status == "failed").count(),
            "pending": db.query(LinkArchive).filter(LinkArchive.status == "pending").count(),
        },
        "snapshots": db.query(BackupSnapshot).count(),
        "sessions": db.query(SessionToken).count(),
        "api_tokens": db.query(ApiToken).filter(ApiToken.revoked_at.is_(None)).count(),
        "notifications": db.query(AppNotification).filter(AppNotification.read_at.is_(None)).count(),
    }


@router.get("/health")
def health(admin: User = Depends(_require_admin), db: Session = Depends(get_db)):
    failed_jobs = db.query(Job).filter(Job.status == "failed").count()
    failed_archives = db.query(LinkArchive).filter(LinkArchive.status == "failed").count()
    queued_jobs = db.query(Job).filter(Job.status == "queued").count()
    return {
        "ok": failed_jobs == 0,
        "failed_jobs": failed_jobs,
        "queued_jobs": queued_jobs,
        "failed_archives": failed_archives,
        "trash": db.query(Link).filter(Link.deleted_at.isnot(None)).count(),
        "users": db.query(User).count(),
    }


@router.get("/users")
def list_users(admin: User = Depends(_require_admin), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.created_at.desc()).limit(200).all()
    return {
        "users": [
            {
                "id": user.id,
                "username": user.username,
                "created_at": user.created_at,
                "links": db.query(Link).filter(Link.user_id == user.id).count(),
                "trashed_links": db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.isnot(None)).count(),
                "tabs": db.query(Tab).filter(Tab.user_id == user.id).count(),
            }
            for user in users
        ]
    }


@router.get("/jobs")
def list_all_jobs(admin: User = Depends(_require_admin), db: Session = Depends(get_db)):
    jobs = db.query(Job).order_by(Job.created_at.desc()).limit(200).all()
    return {
        "jobs": [
            {
                "id": job.id,
                "user_id": job.user_id,
                "type": job.type,
                "status": job.status,
                "error": job.error,
                "created_at": job.created_at,
                "finished_at": job.finished_at,
            }
            for job in jobs
        ]
    }
