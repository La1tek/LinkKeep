from __future__ import annotations

from datetime import datetime, timezone
from html import escape
import base64
import re
import textwrap

from bs4 import BeautifulSoup
import httpx
from sqlalchemy.orm import Session

from app.models import Link, LinkArchive
from app.services.link_service import validate_public_http_url
from app.services.search_index import upsert_link_index


def _extract_readable_text(html: str) -> str:
    soup = BeautifulSoup(html or "", "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    text = soup.get_text("\n")
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)[:200_000]


def _svg_screenshot_preview(link: Link, readable_text: str) -> str:
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
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def _minimal_pdf_data_url(title: str, text: str) -> str:
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
    encoded = base64.b64encode(bytes(pdf)).decode("ascii")
    return f"data:application/pdf;base64,{encoded}"


async def create_link_archive(db: Session, link: Link) -> LinkArchive:
    archive = LinkArchive(user_id=link.user_id, link_id=link.id, source_url=link.url, status="pending")
    db.add(archive)
    db.flush()
    try:
        validate_public_http_url(link.url)
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            response = await client.get(link.url, headers={"User-Agent": "LinkKeep Archiver/2.4"})
            response.raise_for_status()
        html = response.text[:1_500_000]
        readable = _extract_readable_text(html)
        archive.html_snapshot = html
        archive.readable_text = readable
        archive.screenshot_data_url = _svg_screenshot_preview(link, readable or link.description or link.url)
        archive.pdf_data_url = _minimal_pdf_data_url(link.title, readable or link.description or link.url)
        archive.status = "succeeded"
        archive.error = None
        link.content = readable or link.content
        link.content_fetched = datetime.now(timezone.utc)
        upsert_link_index(db, link)
    except Exception as exc:
        archive.status = "failed"
        archive.error = str(exc)[:2000]
    archive.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(archive)
    return archive
