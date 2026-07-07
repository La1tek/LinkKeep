"""
Telegram bot integration for LinkKeep.
Set TELEGRAM_BOT_TOKEN env to enable.
Receives links via Telegram → saves to user's account.
Auth flow: user generates a one-time token in LinkKeep Settings, then sends /start <token>.
"""
import os
import httpx
import asyncio
from html import escape
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import User, Link, Tab
from app.services.link_service import validate_public_http_url

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}" if BOT_TOKEN else ""

# In-memory cache: chat_id → user_id. Persistent source of truth is User.settings.
_chat_user_map = {}


async def send_message(chat_id: int, text: str):
    if not API_BASE:
        return
    async with httpx.AsyncClient() as client:
        await client.post(f"{API_BASE}/sendMessage", json={
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
        })


def _settings(user: User) -> dict:
    return dict(user.settings or {})


def _resolve_user_id(db: Session, chat_id: int):
    if chat_id in _chat_user_map:
        return _chat_user_map[chat_id]
    for user in db.query(User).all():
        settings = _settings(user)
        if str(settings.get("telegram_chat_id")) == str(chat_id):
            _chat_user_map[chat_id] = user.id
            return user.id
    return None


def _link_chat_by_token(db: Session, chat_id: int, token: str):
    for user in db.query(User).all():
        settings = _settings(user)
        if settings.get("bot_link_token") == token:
            settings["telegram_chat_id"] = str(chat_id)
            settings.pop("bot_link_token", None)
            user.settings = settings
            db.commit()
            _chat_user_map[chat_id] = user.id
            return user
    return None


async def process_update(update: dict):
    """Process a single Telegram update."""
    message = update.get("message", {})
    if not message:
        return

    chat_id = message["chat"]["id"]
    text = message.get("text", "").strip()

    # Commands
    if text.startswith("/start"):
        parts = text.split(maxsplit=1)
        db = SessionLocal()
        try:
            linked_user_id = _resolve_user_id(db, chat_id)
            if len(parts) < 2:
                if linked_user_id:
                    await send_message(chat_id, "Already linked. Send me a URL to save it.")
                else:
                    await send_message(chat_id,
                        "LinkKeep Bot\n\n"
                        "Open LinkKeep Settings and generate a Telegram link token, then send:\n"
                        "<code>/start &lt;token&gt;</code>")
                return

            user = _link_chat_by_token(db, chat_id, parts[1].strip())
            if not user:
                await send_message(chat_id, "Invalid or expired token. Generate a new token in LinkKeep Settings.")
                return
            await send_message(chat_id, f"Linked to <b>{escape(user.username)}</b>. Send me URLs to save!")
        finally:
            db.close()
        return

    if text.startswith("/help"):
        await send_message(chat_id,
            "LinkKeep Bot\n\n"
            "/start &lt;token&gt; — link account\n"
            "/tabs — list your groups\n"
            "/stats — show stats\n"
            "Send any URL — it gets saved automatically")
        return

    if text.startswith("/tabs"):
        db = SessionLocal()
        try:
            uid = _resolve_user_id(db, chat_id)
            if not uid:
                await send_message(chat_id, "Run /start with a token from LinkKeep Settings first.")
                return
            tabs = db.query(Tab).filter(Tab.user_id == uid).all()
            if not tabs:
                await send_message(chat_id, "No groups yet.")
                return
            lines = [f"  {escape(t.name)} ({escape(t.color or '')})" for t in tabs]
            await send_message(chat_id, "Your groups:\n" + "\n".join(lines))
        finally:
            db.close()
        return

    if text.startswith("/stats"):
        db = SessionLocal()
        try:
            uid = _resolve_user_id(db, chat_id)
            if not uid:
                await send_message(chat_id, "Run /start first.")
                return
            links = db.query(Link).filter(Link.user_id == uid).count()
            tabs = db.query(Tab).filter(Tab.user_id == uid).count()
            favs = db.query(Link).filter(Link.user_id == uid, Link.is_favorite == True).count()
            await send_message(chat_id, f"Links: {links}\nGroups: {tabs}\nFavorites: {favs}")
        finally:
            db.close()
        return

    # Try to parse as URL
    if text.startswith("http://") or text.startswith("https://"):
        db = SessionLocal()
        try:
            uid = _resolve_user_id(db, chat_id)
            if not uid:
                await send_message(chat_id, "Run /start with a token from LinkKeep Settings first.")
                return
            try:
                validate_public_http_url(text)
            except ValueError:
                await send_message(chat_id, "That URL cannot be fetched by LinkKeep.")
                return

            # Fetch metadata
            title = text
            description = None
            favicon = f"https://www.google.com/s2/favicons?domain={text.split('/')[2]}&sz=64"
            try:
                async with httpx.AsyncClient(timeout=5, follow_redirects=True, trust_env=False) as client:
                    resp = await client.get(text)
                    if resp.status_code == 200:
                        from bs4 import BeautifulSoup
                        soup = BeautifulSoup(resp.text, "html.parser")
                        t = soup.find("title")
                        if t:
                            title = t.text.strip()[:256]
                        d = soup.find("meta", attrs={"name": "description"})
                        if d:
                            description = d.get("content", "")[:500]
            except Exception:
                pass

            link = Link(
                title=title,
                url=text,
                description=description,
                favicon=favicon,
                user_id=uid,
                sort_order=0,
            )
            db.add(link)
            db.commit()
            await send_message(chat_id, f"Saved: <b>{escape(title)}</b>")
        except Exception as e:
            await send_message(chat_id, f"Error: {escape(str(e))}")
        finally:
            db.close()
        return

    await send_message(chat_id, "Send a URL to save it, or /help for commands.")
    return


async def poll_telegram():
    """Long-poll Telegram for updates. Run as background task."""
    if not BOT_TOKEN:
        return
    offset = 0
    async with httpx.AsyncClient(timeout=60) as client:
        while True:
            try:
                resp = await client.post(f"{API_BASE}/getUpdates", json={
                    "offset": offset,
                    "timeout": 30,
                })
                data = resp.json()
                for update in data.get("result", []):
                    offset = update["update_id"] + 1
                    await process_update(update)
            except Exception:
                await asyncio.sleep(5)


def start_bot():
    """Start the Telegram bot polling loop."""
    if not BOT_TOKEN:
        return
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(poll_telegram())
