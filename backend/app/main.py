from contextlib import asynccontextmanager
import logging

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
import os
import threading
import asyncio

from app.database import Base, get_db, engine
from app.migrations import run_startup_migrations
from app.middleware import RateLimitMiddleware, RequestContextMiddleware, SecurityHeadersMiddleware
from app.routers import admin, archives, auth, jobs, links, metadata, recommendations, search, settings, shares, stats, tabs, tags
from app.config import CORS_ORIGINS, CORS_ORIGIN_REGEX, JOB_WORKER_ENABLED
from app.services.jobs import start_job_worker
from app.version import APP_VERSION

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    run_startup_migrations(engine)
    stop_job_worker = threading.Event()
    job_thread = None
    if JOB_WORKER_ENABLED:
        job_thread = start_job_worker(stop_job_worker)
    # Start Telegram bot if token is set
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    if bot_token:
        from app.bot import poll_telegram
        bot_thread = threading.Thread(
            target=lambda: asyncio.run(poll_telegram()),
            daemon=True,
        )
        bot_thread.start()
    yield
    stop_job_worker.set()
    if job_thread:
        job_thread.join(timeout=2)


app = FastAPI(title="LinkKeep API", version=APP_VERSION, lifespan=lifespan)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(RateLimitMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(tabs.router)
app.include_router(links.router)
app.include_router(metadata.router)
app.include_router(stats.router)
app.include_router(settings.router)
app.include_router(tags.router)
app.include_router(jobs.router)
app.include_router(archives.router)
app.include_router(search.router)
app.include_router(shares.router)
app.include_router(shares.public_router)
app.include_router(recommendations.router)
app.include_router(admin.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": APP_VERSION, "bot": bool(os.getenv("TELEGRAM_BOT_TOKEN", ""))}


@app.get("/api/ready")
def ready(db=Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database is not ready") from exc
    return {"status": "ready", "version": APP_VERSION}
