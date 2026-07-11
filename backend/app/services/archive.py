from __future__ import annotations

from datetime import datetime, timezone
from html import escape
import asyncio
import base64
import hashlib
import re
import textwrap
from pathlib import Path

from bs4 import BeautifulSoup
import httpx
from sqlalchemy.orm import Session

from app import config
from app.models import Link, LinkArchive
from app.services.embeddings import upsert_link_embedding
from app.services.link_service import validate_public_http_url
from app.services.search_index import upsert_link_index


def _extract_readable_text(html: str) -> str:
    soup = BeautifulSoup(html or "", "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "nav", "footer", "header", "aside"]):
        tag.decompose()
    text = soup.get_text("\n")
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)[:300_000]


def _svg_screenshot_preview(link: Link, readable_text: str) -> bytes:
    lines = textwrap.wrap(readable_text.replace("\n", " "), width=82)[:18]
    body = "".join(
        f'<text x="42" y="{178 + idx * 28}" font-size="18" fill="#475569">{escape(line)}</text>'
        for idx, line in enumerate(lines)
    )
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="780" viewBox="0 0 1200 780">
  <rect width="1200" height="780" fill="#f8fafc"/>
  <rect x="28" y="28" width="1144" height="724" rx="28" fill="#ffffff" stroke="#cbd5e1"/>
  <text x="42" y="82" font-size="34" font-family="Arial, sans-serif" font-weight="700" fill="#0f172a">{escape(link.title[:80])}</text>
  <text x="42" y="122" font-size="18" font-family="Arial, sans-serif" fill="#6366f1">{escape(link.url[:120])}</text>
  <line x1="42" y1="148" x2="1158" y2="148" stroke="#e2e8f0"/>
  <g font-family="Arial, sans-serif">{body}</g>
</svg>"""
    return svg.encode("utf-8")


def _minimal_pdf_bytes(title: str, text: str) -> bytes:
    lines = [title[:90], ""] + textwrap.wrap(re.sub(r"\s+", " ", text), width=88)[:42]
    stream_lines = ["BT", "/F1 12 Tf", "50 790 Td", "14 TL"]
    for idx, line in enumerate(lines):
        safe = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        if idx == 0:
            stream_lines.extend(["/F1 18 Tf", f"({safe}) Tj", "T*", "/F1 12 Tf"])
        else:
            stream_lines.extend([f"({safe}) Tj", "T*"])
    stream_lines.append("ET")
    stream = "\n".join(stream_lines).encode("latin-1", "replace")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for idx, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{idx} 0 obj\n".encode("ascii"))
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")
    xref_start = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("ascii"))
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(
        f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF\n".encode("ascii")
    )
    return bytes(pdf)


def _data_url(content_type: str, data: bytes) -> str:
    return f"data:{content_type};base64,{base64.b64encode(data).decode('ascii')}"


def _hash_text(value: str) -> str:
    return hashlib.sha256((value or "").encode("utf-8", "ignore")).hexdigest()


def _archive_dir(user_id: int, link_id: int, archive_id: int) -> Path:
    return Path(config.ARCHIVE_STORAGE_DIR) / str(user_id) / str(link_id) / str(archive_id)


def _store_file(user_id: int, link_id: int, archive_id: int, filename: str, data: bytes, content_type: str) -> dict:
    if config.ARCHIVE_STORAGE_DRIVER == "s3" and config.ARCHIVE_S3_BUCKET:
        key = f"{config.ARCHIVE_S3_PREFIX.strip('/')}/{user_id}/{link_id}/{archive_id}/{filename}"
        try:
            import boto3  # type: ignore

            boto3.client("s3").put_object(Bucket=config.ARCHIVE_S3_BUCKET, Key=key, Body=data, ContentType=content_type)
            return {"driver": "s3", "bucket": config.ARCHIVE_S3_BUCKET, "key": key, "content_type": content_type, "size": len(data)}
        except Exception:
            # Fall back to disk so archiving still succeeds without boto3/S3 credentials.
            pass

    target_dir = _archive_dir(user_id, link_id, archive_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    path = target_dir / filename
    path.write_bytes(data)
    return {"driver": "disk", "path": str(path), "content_type": content_type, "size": len(data)}


def _load_file(ref: dict | None) -> bytes | None:
    if not ref:
        return None
    if ref.get("driver") == "disk" and ref.get("path"):
        path = Path(ref["path"])
        if path.exists():
            return path.read_bytes()
    return None


def _diff_summary(previous_text: str | None, current_text: str | None) -> str | None:
    if not previous_text or not current_text:
        return None
    prev_words = set(re.findall(r"\w{4,}", previous_text.lower()))
    curr_words = set(re.findall(r"\w{4,}", current_text.lower()))
    added = sorted(curr_words - prev_words)[:12]
    removed = sorted(prev_words - curr_words)[:12]
    if not added and not removed:
        return None
    parts = []
    if added:
        parts.append("Added: " + ", ".join(added))
    if removed:
        parts.append("Removed: " + ", ".join(removed))
    return "; ".join(parts)


async def _capture_with_playwright(url: str) -> tuple[str, bytes, bytes, str] | None:
    if not config.ARCHIVE_USE_PLAYWRIGHT:
        return None
    try:
        from playwright.async_api import async_playwright  # type: ignore
    except Exception:
        return None

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 1100})
        response = await page.goto(url, wait_until="networkidle", timeout=30_000)
        await page.emulate_media(media="screen")
        html = await page.content()
        screenshot = await page.screenshot(full_page=True, type="png")
        pdf = await page.pdf(format="A4", print_background=True)
        final_url = page.url or (str(response.url) if response else url)
        await browser.close()
        return html[:1_500_000], screenshot, pdf, final_url


async def _fetch_html(url: str) -> tuple[str, str]:
    async with httpx.AsyncClient(timeout=15, follow_redirects=True, trust_env=False) as client:
        response = await client.get(url, headers={"User-Agent": "LinkKeep Archiver/2.8"})
        response.raise_for_status()
        return response.text[:1_500_000], str(response.url)


async def _capture_archive_payload(link: Link) -> tuple[str, str, bytes, bytes, str, str]:
    playwright_payload = await _capture_with_playwright(link.url)
    if playwright_payload:
        html, screenshot, pdf, final_url = playwright_payload
        readable = _extract_readable_text(html)
        return html, readable, screenshot, pdf, final_url, "playwright"

    html, final_url = await _fetch_html(link.url)
    readable = _extract_readable_text(html)
    preview_text = readable or link.description or link.url
    return html, readable, _svg_screenshot_preview(link, preview_text), _minimal_pdf_bytes(link.title, preview_text), final_url, "http"


def load_archive_payload(archive: LinkArchive) -> dict:
    manifest = archive.storage_manifest or {}
    payload: dict = {}
    html_bytes = _load_file(manifest.get("html"))
    text_bytes = _load_file(manifest.get("readable_text"))
    screenshot_bytes = _load_file(manifest.get("screenshot"))
    pdf_bytes = _load_file(manifest.get("pdf"))
    if html_bytes and not archive.html_snapshot:
        payload["html_snapshot"] = html_bytes.decode("utf-8", "replace")
    if text_bytes and not archive.readable_text:
        payload["readable_text"] = text_bytes.decode("utf-8", "replace")
    if screenshot_bytes and not archive.screenshot_data_url:
        payload["screenshot_data_url"] = _data_url(manifest.get("screenshot", {}).get("content_type", "image/png"), screenshot_bytes)
    if pdf_bytes and not archive.pdf_data_url:
        payload["pdf_data_url"] = _data_url("application/pdf", pdf_bytes)
    return payload


async def create_link_archive(db: Session, link: Link) -> LinkArchive:
    archive = LinkArchive(user_id=link.user_id, link_id=link.id, source_url=link.url, status="pending")
    db.add(archive)
    db.flush()

    previous = (
        db.query(LinkArchive)
        .filter(LinkArchive.link_id == link.id, LinkArchive.status == "succeeded", LinkArchive.id != archive.id)
        .order_by(LinkArchive.created_at.desc())
        .first()
    )
    last_error: Exception | None = None

    for attempt in range(config.ARCHIVE_RETRY_COUNT + 1):
        archive.retry_count = attempt
        try:
            validate_public_http_url(link.url)
            html, readable, screenshot, pdf, final_url, engine = await _capture_archive_payload(link)
            content_hash = _hash_text(readable or html)
            manifest = {
                "html": _store_file(link.user_id, link.id, archive.id, "snapshot.html", html.encode("utf-8", "replace"), "text/html; charset=utf-8"),
                "readable_text": _store_file(link.user_id, link.id, archive.id, "readable.txt", readable.encode("utf-8", "replace"), "text/plain; charset=utf-8"),
                "screenshot": _store_file(link.user_id, link.id, archive.id, "screenshot.png" if engine == "playwright" else "screenshot.svg", screenshot, "image/png" if engine == "playwright" else "image/svg+xml"),
                "pdf": _store_file(link.user_id, link.id, archive.id, "snapshot.pdf", pdf, "application/pdf"),
            }

            archive.html_snapshot = html
            archive.readable_text = readable
            archive.screenshot_data_url = _data_url(manifest["screenshot"]["content_type"], screenshot)
            archive.pdf_data_url = _data_url("application/pdf", pdf)
            archive.storage_manifest = manifest
            archive.content_hash = content_hash
            archive.source_url = final_url or link.url
            archive.engine = engine
            archive.status = "succeeded"
            archive.error = None
            if previous and previous.content_hash and previous.content_hash != content_hash:
                archive.changed_from_archive_id = previous.id
                archive.diff_summary = _diff_summary(previous.readable_text, readable)
            link.content = readable or link.content
            link.content_fetched = datetime.now(timezone.utc)
            upsert_link_index(db, link)
            upsert_link_embedding(db, link)
            break
        except Exception as exc:
            last_error = exc
            archive.status = "failed"
            archive.error = str(exc)[:2000]
            if attempt < config.ARCHIVE_RETRY_COUNT:
                await asyncio.sleep(config.ARCHIVE_RETRY_DELAY_SECONDS * (attempt + 1))

    if archive.status == "failed" and last_error:
        archive.error = str(last_error)[:2000]
    archive.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(archive)
    return archive
