"""
Telegram bot integration for LinkKeep.
Set TELEGRAM_BOT_TOKEN env to enable.
Receives links via Telegram → saves to user's account.
Auth flow: user sends /start <username> <password> → bot links chat_id to user.
"""
import os
import httpx
import asyncio
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import User, Link, Tab
from app.auth import pwd_context, create_access_token

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}" if BOT_TOKEN else ""

# In-memory mapping: chat_id → user_id (resets on restart, that's fine)
# For production, store in DB
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


async def process_update(update: dict):
    """Process a single Telegram update."""
    message = update.get("message", {})
    if not message:
        return

    chat_id = message["chat"]["id"]
    text = message.get("text", "").strip()

    # Commands
    if text.startswith("/start"):
        parts = text.split(maxsplit=2)
        if len(parts) < 3:
            if chat_id in _chat_user_map:
                await send_message(chat_id, "Already linked. Send me a URL to save it.")
            else:
                await send_message(chat_id,
                    "LinkKeep Bot\n\n"
                    "Send: <code>/start &lt;username&gt; &lt;password&gt;</code>\n"
                    "to link your account.\n\n"
                    "After that, just send me URLs to save them.")
            return

        username, password = parts[1], parts[2]
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.username == username).first()
            if not user or not pwd_context.verify(password, user.hashed_password):
                await send_message(chat_id, "Invalid credentials. Try again.")
                return
            _chat_user_map[chat_id] = user.id
            await send_message(chat_id, f"Linked to <b>{user.username}</b>. Send me URLs to save!")
        finally:
            db.close()
        return

    if text.startswith("/help"):
        await send_message(chat_id,
            "LinkKeep Bot\n\n"
            "/start &lt;user&gt; &lt;pass&gt; — link account\n"
            "/tabs — list your groups\n"
            "/stats — show stats\n"
            "Send any URL — it gets saved automatically")
        return

    if text.startswith("/tabs"):
        if chat_id not in _chat_user_map:
            await send_message(chat_id, "Run /start first to link your account.")
            return
        db = SessionLocal()
        try:
            tabs = db.query(Tab).filter(Tab.user_id == _chat_user_map[chat_id]).all()
            if not tabs:
                await send_message(chat_id, "No groups yet.")
                return
            lines = [f"  {t.name} ({t.color})" for t in tabs]
            await send_message(chat_id, "Your groups:\n" + "\n".join(lines))
        finally:
            db.close()
        return

    if text.startswith("/stats"):
        if chat_id not in _chat_user_map:
            await send_message(chat_id, "Run /start first.")
            return
        db = SessionLocal()
        try:
            uid = _chat_user_map[chat_id]
            links = db.query(Link).filter(Link.user_id == uid).count()
            tabs = db.query(Tab).filter(Tab.user_id == uid).count()
            favs = db.query(Link).filter(Link.user_id == uid, Link.is_favorite == True).count()
            await send_message(chat_id, f"Links: {links}\nGroups: {tabs}\nFavorites: {favs}")
        finally:
            db.close()
        return

    # Try to parse as URL
    if text.startswith("http://") or text.startswith("https://"):
        if chat_id not in _chat_user_map:
            await send_message(chat_id, "Run /start first to link your account.")
            return

        db = SessionLocal()
        try:
            uid = _chat_user_map[chat_id]
            # Fetch metadata
            title = text
            description = None
            favicon = f"https://www.google.com/s2/favicons?domain={text.split('/')[2]}&sz=64"
            try:
                async with httpx.AsyncClient(timeout=5) as client:
                    resp = await client.get(text, follow_redirects=True)
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
            await send_message(chat_id, f"Saved: <b>{title}</b>")
        except Exception as e:
            await send_message(chat_id, f"Error: {e}")
        finally:
            db.close()
        return

    await send_message(chat_id, "Send a URL to save it, or /help for commands.")


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
