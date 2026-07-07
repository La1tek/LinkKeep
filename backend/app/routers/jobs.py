from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Job, User
from app.routers.auth import _get_current_user
from app.services.jobs import JOB_TYPES, enqueue_job, run_job

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class JobCreate(BaseModel):
    type: str = Field(max_length=64)
    payload: dict = Field(default_factory=dict)
    run_now: bool = False


def _job_out(job: Job) -> dict:
    return {
        "id": job.id,
        "type": job.type,
        "status": job.status,
        "payload": job.payload or {},
        "result": job.result,
        "error": job.error,
        "scheduled_at": job.scheduled_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }


@router.get("")
def list_jobs(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    jobs = db.query(Job).filter(Job.user_id == user.id).order_by(Job.created_at.desc()).limit(100).all()
    return {"jobs": [_job_out(job) for job in jobs]}


@router.post("", status_code=201)
def create_job(data: JobCreate, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    if data.type not in JOB_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported job type")
    job = enqueue_job(db, data.type, user.id, data.payload)
    if data.run_now:
        job.status = "running"
        db.commit()
        try:
            job.result = run_job(db, job)
            job.status = "succeeded"
            job.error = None
        except Exception as exc:
            job.status = "failed"
            job.error = str(exc)
        db.commit()
        db.refresh(job)
    return _job_out(job)


@router.get("/{job_id}")
def get_job(job_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_out(job)


@router.post("/{job_id}/retry", status_code=202)
def retry_job(job_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.status = "queued"
    job.error = None
    job.result = None
    db.commit()
    db.refresh(job)
    return _job_out(job)
