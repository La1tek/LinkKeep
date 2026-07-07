from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import threading
import asyncio

from app.database import Base, engine
from app.migrations import run_startup_migrations
from app.routers import auth, tabs, links, metadata, stats, settings
from app.config import CORS_ORIGINS, CORS_ORIGIN_REGEX
from app.version import APP_VERSION


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    run_startup_migrations(engine)
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


app = FastAPI(title="LinkKeep API", version=APP_VERSION, lifespan=lifespan)

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


@app.get("/api/health")
def health():
    return {"status": "ok", "version": APP_VERSION, "bot": bool(os.getenv("TELEGRAM_BOT_TOKEN", ""))}
