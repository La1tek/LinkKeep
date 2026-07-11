from __future__ import annotations

import asyncio
import logging
import threading
import time
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.orm import Session

from app import config
from app.database import SessionLocal
from app.models import AppNotification, BackupSnapshot, Job, Link, LinkHealthCheck, User
from app.routers.settings import _export_user_data
from app.services.archive import create_link_archive
from app.services.automation import apply_automation_rules
from app.services.embeddings import rebuild_user_embeddings, upsert_link_embedding
from app.services.link_service import fetch_metadata, validate_public_http_url
from app.services.search_index import rebuild_user_index, upsert_link_index

logger = logging.getLogger("linkkeep.jobs")


JOB_TYPES = {
    "backup_snapshot",
    "rebuild_search_index",
    "rebuild_embeddings",
    "refresh_metadata",
    "check_link_health",
    "archive_links",
    "process_reminders",
    "daily_digest",
    "weekly_digest",
}


def enqueue_job(db: Session, job_type: str, user_id: int | None, payload: dict | None = None) -> Job:
    if job_type not in JOB_TYPES:
        raise ValueError("Unsupported job type")
    job = Job(type=job_type, user_id=user_id, payload=payload or {}, status="queued")
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def create_backup_snapshot(db: Session, user: User, name: str | None = None) -> BackupSnapshot:
    snapshot = BackupSnapshot(
        user_id=user.id,
        name=name or f"Snapshot {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
        data=_export_user_data(user, db),
    )
    db.add(snapshot)
    db.flush()
    return snapshot


def trim_backup_snapshots(db: Session, user_id: int) -> int:
    snapshots = (
        db.query(BackupSnapshot)
        .filter(BackupSnapshot.user_id == user_id)
        .order_by(BackupSnapshot.created_at.desc(), BackupSnapshot.id.desc())
        .all()
    )
    removed = 0
    for snapshot in snapshots[config.BACKUP_SNAPSHOT_RETENTION:]:
        db.delete(snapshot)
        removed += 1
    return removed


def maybe_create_scheduled_snapshots(db: Session) -> int:
    if not config.BACKUP_SNAPSHOTS_ENABLED:
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(hours=config.BACKUP_SNAPSHOT_INTERVAL_HOURS)
    created = 0
    for user in db.query(User).all():
        latest = (
            db.query(BackupSnapshot)
            .filter(BackupSnapshot.user_id == user.id)
            .order_by(BackupSnapshot.created_at.desc())
            .first()
        )
        if latest and latest.created_at and latest.created_at.replace(tzinfo=timezone.utc) > cutoff:
            continue
        create_backup_snapshot(db, user, "Automatic snapshot")
        trim_backup_snapshots(db, user.id)
        created += 1
    if created:
        db.commit()
    return created


def run_job(db: Session, job: Job) -> dict:
    if job.user_id is None:
        raise ValueError("Job requires user_id")
    user = db.query(User).filter(User.id == job.user_id).first()
    if not user:
        raise ValueError("Job user not found")

    if job.type == "backup_snapshot":
        snapshot = create_backup_snapshot(db, user, job.payload.get("name"))
        trim_backup_snapshots(db, user.id)
        return {"snapshot_id": snapshot.id}

    if job.type == "rebuild_search_index":
        indexed = rebuild_user_index(db, user.id)
        return {"indexed": indexed}

    if job.type == "rebuild_embeddings":
        indexed = rebuild_user_embeddings(db, user.id, int(job.payload.get("limit", 1000)))
        return {"indexed": indexed}

    if job.type == "refresh_metadata":
        limit = int(job.payload.get("limit", 25))
        links = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None)).order_by(Link.updated_at.desc()).limit(limit).all()
        refreshed = 0
        for link in links:
            metadata = asyncio.run(fetch_metadata(link.url))
            for field in ("title", "description", "favicon", "image"):
                value = metadata.get(field)
                if value:
                    setattr(link, field, value)
            upsert_link_index(db, link)
            upsert_link_embedding(db, link)
            refreshed += 1
        return {"refreshed": refreshed}

    if job.type == "check_link_health":
        limit = int(job.payload.get("limit", 50))
        links = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None)).order_by(Link.id).limit(limit).all()
        checked = dead = alive = 0
        with httpx.Client(timeout=10, follow_redirects=True, trust_env=False) as client:
            for link in links:
                error = None
                final_url = None
                try:
                    validate_public_http_url(link.url)
                    response = client.head(link.url)
                    status = response.status_code
                    final_url = str(response.url)
                except Exception as exc:
                    status = 0
                    error = str(exc)[:2000]
                link.http_status = status
                link.last_checked = datetime.now(timezone.utc)
                db.add(LinkHealthCheck(link_id=link.id, user_id=user.id, status=status, final_url=final_url, error=error))
                apply_automation_rules(db, link, "health_check")
                checked += 1
                if status and status < 400:
                    alive += 1
                else:
                    dead += 1
        return {"checked": checked, "alive": alive, "dead": dead}

    if job.type == "archive_links":
        ids = [int(item) for item in job.payload.get("link_ids", []) if str(item).isdigit()]
        query = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None))
        if ids:
            query = query.filter(Link.id.in_(ids))
        links = query.order_by(Link.created_at.desc()).limit(int(job.payload.get("limit", 10))).all()
        archived = 0
        for link in links:
            asyncio.run(create_link_archive(db, link))
            archived += 1
        return {"archived": archived}

    if job.type == "process_reminders":
        now = datetime.now(timezone.utc)
        links = (
            db.query(Link)
            .filter(Link.user_id == user.id, Link.deleted_at.is_(None), Link.reminder_at.isnot(None), Link.reminder_at <= now)
            .order_by(Link.reminder_at.asc())
            .limit(int(job.payload.get("limit", 50)))
            .all()
        )
        for link in links:
            db.add(AppNotification(
                user_id=user.id,
                type="reminder",
                title="Reading reminder",
                body=link.title,
                payload={"link_id": link.id, "url": link.url},
            ))
            link.reminder_at = None
        return {"reminders": len(links)}

    if job.type in {"daily_digest", "weekly_digest"}:
        days = 7 if job.type == "weekly_digest" else 1
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        new_links = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None), Link.created_at >= cutoff).order_by(Link.created_at.desc()).limit(20).all()
        unread = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None), Link.is_read == False).order_by(Link.created_at.desc()).limit(20).all()
        stale_cutoff = datetime.now(timezone.utc) - timedelta(days=14)
        stale = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None), Link.is_read == False, Link.created_at <= stale_cutoff).order_by(Link.created_at.asc()).limit(10).all()
        payload = {
            "new_links": [{"id": link.id, "title": link.title, "url": link.url} for link in new_links],
            "unread": [{"id": link.id, "title": link.title, "url": link.url} for link in unread],
            "stale_unread": [{"id": link.id, "title": link.title, "url": link.url} for link in stale],
        }
        db.add(AppNotification(
            user_id=user.id,
            type=job.type,
            title="Weekly reading digest" if job.type == "weekly_digest" else "Daily reading digest",
            body=f"{len(new_links)} new, {len(unread)} unread, {len(stale)} stale unread",
            payload=payload,
        ))
        return {"new": len(new_links), "unread": len(unread), "stale_unread": len(stale)}

    raise ValueError("Unsupported job type")


def claim_and_run_next_job() -> bool:
    with SessionLocal() as db:
        maybe_create_scheduled_snapshots(db)
        job = (
            db.query(Job)
            .filter(Job.status == "queued", Job.scheduled_at <= datetime.now(timezone.utc))
            .order_by(Job.scheduled_at, Job.id)
            .first()
        )
        if not job:
            return False
        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        db.commit()

        try:
            job.result = run_job(db, job)
            job.status = "succeeded"
            job.error = None
        except Exception as exc:
            logger.exception("Job %s failed", job.id)
            job.status = "failed"
            job.error = str(exc)
        finally:
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
        return True


def start_job_worker(stop_event: threading.Event) -> threading.Thread:
    def loop() -> None:
        while not stop_event.is_set():
            try:
                ran = claim_and_run_next_job()
            except Exception:
                logger.exception("Job worker tick failed")
                ran = False
            stop_event.wait(0.1 if ran else config.JOB_WORKER_INTERVAL_SECONDS)

    thread = threading.Thread(target=loop, daemon=True, name="linkkeep-job-worker")
    thread.start()
    return thread
