from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import threading
import asyncio

from app.database import Base, engine, SessionLocal
from app.routers import auth, tabs, links, metadata, stats, settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    # Auto-migrate: add new columns if missing
    with engine.connect() as conn:
        import sqlalchemy as sa
        insp = sa.inspect(engine)
        link_cols = {c['name'] for c in insp.get_columns('links')}
        tab_cols = {c['name'] for c in insp.get_columns('tabs')}
        if 'is_pinned' not in link_cols:
            conn.exec_driver_sql('ALTER TABLE links ADD COLUMN is_pinned BOOLEAN DEFAULT 0')
        if 'note' not in link_cols:
            conn.exec_driver_sql('ALTER TABLE links ADD COLUMN note TEXT')
        if 'image' not in link_cols:
            conn.exec_driver_sql('ALTER TABLE links ADD COLUMN image TEXT')
        if 'parent_id' not in tab_cols:
            conn.exec_driver_sql('ALTER TABLE tabs ADD COLUMN parent_id INTEGER')
        if 'http_status' not in link_cols:
            conn.exec_driver_sql('ALTER TABLE links ADD COLUMN http_status INTEGER')
        if 'last_checked' not in link_cols:
            conn.exec_driver_sql('ALTER TABLE links ADD COLUMN last_checked TIMESTAMP')
        if 'content' not in link_cols:
            conn.exec_driver_sql('ALTER TABLE links ADD COLUMN content TEXT')
        if 'content_fetched' not in link_cols:
            conn.exec_driver_sql('ALTER TABLE links ADD COLUMN content_fetched TIMESTAMP')
        conn.commit()
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


app = FastAPI(title="LinkKeep API", version="2.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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
    return {"status": "ok", "version": "2.1.0", "bot": bool(os.getenv("TELEGRAM_BOT_TOKEN", ""))}
