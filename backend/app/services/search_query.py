from dataclasses import dataclass, field
from datetime import datetime, timezone
import shlex
from urllib.parse import urlparse

from sqlalchemy import or_
from sqlalchemy.orm import Query

from app.models import Link


@dataclass
class SearchFilters:
    text: str = ""
    tags: list[str] = field(default_factory=list)
    site: str | None = None
    link_type: str | None = None
    is_dead: bool | None = None
    is_archived: bool | None = None
    has_note: bool | None = None
    has_archive: bool | None = None
    before: datetime | None = None
    after: datetime | None = None


def parse_search_query(raw: str) -> SearchFilters:
    filters = SearchFilters()
    terms: list[str] = []
    for token in shlex.split(raw or ""):
        if ":" not in token:
            terms.append(token)
            continue
        key, value = token.split(":", 1)
        key = key.lower().strip()
        value = value.strip()
        if not value:
            continue
        if key == "tag":
            filters.tags.append(value)
        elif key == "site":
            filters.site = value.lower().removeprefix("www.")
        elif key == "type":
            filters.link_type = value.lower()
        elif key == "is":
            if value.lower() in {"dead", "broken"}:
                filters.is_dead = True
            elif value.lower() in {"alive", "ok"}:
                filters.is_dead = False
            elif value.lower() == "archived":
                filters.is_archived = True
        elif key == "has":
            if value.lower() == "note":
                filters.has_note = True
            elif value.lower() == "archive":
                filters.has_archive = True
        elif key in {"before", "after"}:
            try:
                parsed = datetime.fromisoformat(value)
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                if key == "before":
                    filters.before = parsed
                else:
                    filters.after = parsed
            except ValueError:
                terms.append(token)
        else:
            terms.append(token)
    filters.text = " ".join(terms).strip()
    return filters


def _site_matches(url: str, site: str) -> bool:
    try:
        hostname = (urlparse(url).hostname or "").lower().removeprefix("www.")
    except Exception:
        hostname = ""
    return hostname == site or hostname.endswith(f".{site}")


def _type_matches(url: str, link_type: str) -> bool:
    parsed = urlparse(url)
    path = parsed.path.lower()
    host = (parsed.hostname or "").lower()
    if link_type in {"video", "youtube"}:
        return "youtube.com" in host or "youtu.be" in host or "vimeo.com" in host
    if link_type in {"pdf", "document"}:
        return path.endswith(".pdf")
    if link_type in {"image", "img"}:
        return path.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"))
    if link_type in {"article", "page"}:
        return not _type_matches(url, "pdf") and not _type_matches(url, "image")
    return True


def apply_db_filters(query: Query, filters: SearchFilters) -> Query:
    if filters.text:
        like = f"%{filters.text}%"
        query = query.filter(
            or_(Link.title.ilike(like), Link.url.ilike(like), Link.description.ilike(like), Link.note.ilike(like), Link.content.ilike(like))
        )
    if filters.has_note is True:
        query = query.filter(Link.note.isnot(None), Link.note != "")
    if filters.is_dead is True:
        query = query.filter((Link.http_status == 0) | (Link.http_status >= 400))
    if filters.is_dead is False:
        query = query.filter((Link.http_status.is_(None)) | ((Link.http_status > 0) & (Link.http_status < 400)))
    if filters.after is not None:
        query = query.filter(Link.created_at >= filters.after)
    if filters.before is not None:
        query = query.filter(Link.created_at <= filters.before)
    return query


def apply_python_filters(links: list[Link], filters: SearchFilters) -> list[Link]:
    result = links
    if filters.has_note is True:
        result = [link for link in result if bool(link.note)]
    if filters.is_dead is True:
        result = [link for link in result if link.http_status == 0 or (link.http_status or 0) >= 400]
    if filters.is_dead is False:
        result = [link for link in result if link.http_status is None or (0 < link.http_status < 400)]
    if filters.after is not None:
        result = [link for link in result if link.created_at >= filters.after]
    if filters.before is not None:
        result = [link for link in result if link.created_at <= filters.before]
    for tag in filters.tags:
        result = [link for link in result if tag in (link.tags or [])]
    if filters.site:
        result = [link for link in result if _site_matches(link.url, filters.site)]
    if filters.link_type:
        result = [link for link in result if _type_matches(link.url, filters.link_type)]
    if filters.has_archive is True or filters.is_archived is True:
        result = [link for link in result if bool(link.archives and link.archives[0].status == "succeeded")]
    return result
