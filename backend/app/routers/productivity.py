from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    AuditLog,
    AutomationRule,
    AppNotification,
    Job,
    Link,
    LinkHistory,
    LinkHealthCheck,
    LinkHighlight,
    LinkSummary,
    SmartCollection,
    Tab,
    User,
    WebhookDelivery,
    WebhookEndpoint,
    Workspace,
    WorkspaceMember,
)
from app.routers.auth import _get_current_user
from app.schemas import LinkOut
from app.services.automation import apply_automation_rules, record_webhook_event
from app.services.embeddings import rebuild_user_embeddings, semantic_rank as embedding_rank, upsert_link_embedding
from app.services.link_service import validate_public_http_url
from app.services.search_query import apply_db_filters, apply_python_filters, parse_search_query
from app.services.search_index import upsert_link_index

router = APIRouter(prefix="/api", tags=["productivity"])


TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
    "fbclid", "gclid", "dclid", "yclid", "mc_cid", "mc_eid", "igshid", "ref",
}


class RuleIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    trigger: str = "link_created"
    is_enabled: bool = True
    conditions: dict = Field(default_factory=dict)
    actions: dict = Field(default_factory=dict)


class InboxAction(BaseModel):
    link_ids: list[int]
    action: str
    tab_id: int | None = None
    tags: list[str] = Field(default_factory=list)


class WorkspaceIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = None


class WorkspaceMemberIn(BaseModel):
    username: str
    role: str = "member"


class WebhookIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    url: str = Field(min_length=1, max_length=2000)
    events: list[str] = Field(default_factory=lambda: ["link.created"])
    secret: str | None = None
    is_enabled: bool = True


class ProfileIn(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    bio: str | None = Field(default=None, max_length=500)
    headline: str | None = Field(default=None, max_length=160)
    location: str | None = Field(default=None, max_length=120)
    website: str | None = Field(default=None, max_length=500)
    accent: str | None = Field(default="#7c8cff", max_length=16)
    is_public: bool = True


class AssistantQuery(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    limit: int = Field(default=8, ge=1, le=20)


class ReminderIn(BaseModel):
    link_id: int
    remind_at: datetime


class SnoozeIn(BaseModel):
    remind_at: datetime


class CommandRun(BaseModel):
    command: str = Field(min_length=1, max_length=80)
    payload: dict = Field(default_factory=dict)


def _rule_out(rule: AutomationRule) -> dict:
    return {
        "id": rule.id,
        "name": rule.name,
        "trigger": rule.trigger,
        "is_enabled": rule.is_enabled,
        "conditions": rule.conditions or {},
        "actions": rule.actions or {},
        "run_count": rule.run_count or 0,
        "last_run_at": rule.last_run_at,
        "created_at": rule.created_at,
    }


def _link_payload(link: Link) -> dict:
    return LinkOut.model_validate(link).model_dump(mode="json")


def _canonicalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return url.strip()
    hostname = (parsed.hostname or "").lower()
    if hostname.startswith("www."):
        hostname = hostname[4:]
    if hostname.startswith("m.") and hostname.count(".") >= 2:
        hostname = hostname[2:]
    port = f":{parsed.port}" if parsed.port else ""
    path = parsed.path.rstrip("/") or "/"
    query_items = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if key.lower() not in TRACKING_PARAMS and not key.lower().startswith("utm_")
    ]
    query = urlencode(query_items, doseq=True)
    return urlunparse((parsed.scheme.lower(), f"{hostname}{port}", path, "", query, "")).lower()


def _tokenize(text: str) -> set[str]:
    return {token for token in re.findall(r"[a-zA-Z0-9а-яА-ЯёЁ]{3,}", (text or "").lower())}


def _semantic_text(link: Link) -> str:
    highlights = " ".join(item.text for item in (link.highlights or [])[:10])
    return " ".join([
        link.title or "",
        link.url or "",
        link.description or "",
        link.note or "",
        link.content or "",
        " ".join(link.tags or []),
        highlights,
    ])


def _semantic_rank(query: str, links: list[Link], limit: int) -> list[dict]:
    query_terms = _tokenize(query)
    if not query_terms:
        return []
    ranked = []
    for link in links:
        terms = _tokenize(_semantic_text(link))
        if not terms:
            continue
        overlap = query_terms & terms
        soft = {term for term in query_terms for candidate in terms if term in candidate or candidate in term}
        score = len(overlap) * 3 + len(soft)
        if score:
            ranked.append({"score": score, "link": link})
    ranked.sort(key=lambda item: (item["score"], item["link"].created_at), reverse=True)
    return ranked[:limit]


def _reading_time(text: str) -> int:
    words = len(re.findall(r"\w+", text or ""))
    return max(1, round(words / 220))


def _detect_language(text: str) -> str:
    cyrillic = len(re.findall(r"[а-яА-ЯёЁ]", text or ""))
    latin = len(re.findall(r"[a-zA-Z]", text or ""))
    if cyrillic > latin:
        return "ru"
    if latin:
        return "en"
    return "unknown"


def _make_summary(link: Link) -> dict:
    text = (link.content or link.description or link.note or link.title or "").strip()
    compact = re.sub(r"\s+", " ", text)
    sentences = re.split(r"(?<=[.!?])\s+", compact)
    summary = " ".join(sentences[:3]).strip() or link.description or link.title
    tldr = sentences[0].strip() if sentences and sentences[0].strip() else summary[:220]
    terms = [term for term in _tokenize(compact) if len(term) > 4]
    stop = {"https", "http", "with", "from", "this", "that", "your", "для", "как", "что", "это"}
    suggested = []
    for term in terms:
        if term in stop or term in suggested:
            continue
        suggested.append(term[:32])
        if len(suggested) == 6:
            break
    return {
        "summary": summary[:1200],
        "tldr": tldr[:300],
        "language": _detect_language(compact),
        "reading_time_minutes": _reading_time(compact),
        "suggested_tags": suggested,
    }


def _toc_from_text(text: str) -> list[dict]:
    toc = []
    for line in (text or "").splitlines():
        value = line.strip()
        if 8 <= len(value) <= 90 and not value.endswith(".") and len(value.split()) <= 12:
            toc.append({"title": value, "anchor": f"section-{len(toc) + 1}"})
        if len(toc) >= 12:
            break
    return toc


def _answer_from_links(question: str, ranked: list[tuple[float, Link]]) -> str:
    if not ranked:
        return "I could not find saved links that match this question yet."
    focus = ", ".join(link.title for _, link in ranked[:3])
    tags = []
    for _, link in ranked:
        for tag in link.tags or []:
            if tag not in tags:
                tags.append(tag)
    tag_text = f" Common tags: {', '.join(tags[:8])}." if tags else ""
    return f"Found {len(ranked)} relevant saved links for: {question}. Start with {focus}.{tag_text}"


@router.get("/rules")
def list_rules(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    rules = db.query(AutomationRule).filter(AutomationRule.user_id == user.id).order_by(AutomationRule.id.asc()).all()
    return {"rules": [_rule_out(rule) for rule in rules]}


@router.post("/rules", status_code=201)
def create_rule(data: RuleIn, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    rule = AutomationRule(user_id=user.id, **data.model_dump())
    db.add(rule)
    db.add(AuditLog(user_id=user.id, action="rule.created", payload={"name": rule.name}))
    db.commit()
    db.refresh(rule)
    return _rule_out(rule)


@router.put("/rules/{rule_id}")
def update_rule(rule_id: int, data: RuleIn, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    rule = db.query(AutomationRule).filter(AutomationRule.id == rule_id, AutomationRule.user_id == user.id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    for key, value in data.model_dump().items():
        setattr(rule, key, value)
    db.add(AuditLog(user_id=user.id, action="rule.updated", payload={"rule_id": rule.id}))
    db.commit()
    db.refresh(rule)
    return _rule_out(rule)


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    rule = db.query(AutomationRule).filter(AutomationRule.id == rule_id, AutomationRule.user_id == user.id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()


@router.post("/rules/defaults")
def create_default_rules(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    defaults = [
        ("New links to Inbox", "link_created", {"only_ungrouped": True}, {"tab_name": "Inbox", "tab_color": "#7c8cff"}),
        ("YouTube to Video", "link_created", {"site": "youtube.com"}, {"tab_name": "Video", "tab_color": "#ef4444"}),
        ("Docs tag", "link_created", {"url_contains": "/docs/"}, {"add_tags": ["docs"]}),
        ("Archive every new link", "link_created", {}, {"archive": True}),
        ("Dead links to Review", "health_check", {"status": "dead"}, {"dead_action": "review", "add_tags": ["dead"]}),
    ]
    created = 0
    for name, trigger, conditions, actions in defaults:
        existing = db.query(AutomationRule).filter(AutomationRule.user_id == user.id, AutomationRule.name == name).first()
        if existing:
            continue
        db.add(AutomationRule(user_id=user.id, name=name, trigger=trigger, conditions=conditions, actions=actions))
        created += 1
    db.add(AuditLog(user_id=user.id, action="rules.defaults_created", payload={"created": created}))
    db.commit()
    return {"created": created}


@router.post("/rules/run")
def run_rules(trigger: str = "link_created", user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    links = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None)).order_by(Link.created_at.desc()).limit(500).all()
    applied = 0
    for link in links:
        applied += apply_automation_rules(db, link, trigger)
        upsert_link_index(db, link)
    db.commit()
    return {"links": len(links), "applied": applied}


@router.get("/inbox")
def list_inbox(limit: int = Query(100, ge=1, le=500), user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    links = (
        db.query(Link)
        .filter(Link.user_id == user.id, Link.deleted_at.is_(None), Link.is_read == False)
        .order_by(Link.created_at.desc())
        .limit(limit)
        .all()
    )
    return {"count": len(links), "links": [_link_payload(link) for link in links]}


@router.post("/inbox/review")
def review_inbox(data: InboxAction, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    links = db.query(Link).filter(Link.user_id == user.id, Link.id.in_(data.link_ids), Link.deleted_at.is_(None)).all()
    for link in links:
        if data.action == "read":
            link.is_read = True
        elif data.action == "move":
            link.tab_id = data.tab_id
        elif data.action == "tag":
            link.tags = list(dict.fromkeys([*(link.tags or []), *data.tags]))
        elif data.action == "archive":
            from app.models import Job
            db.add(Job(type="archive_links", user_id=user.id, payload={"link_ids": [link.id]}, status="queued"))
        elif data.action == "delete":
            link.deleted_at = datetime.now(timezone.utc)
        upsert_link_index(db, link)
    db.add(AuditLog(user_id=user.id, action="inbox.reviewed", payload={"action": data.action, "count": len(links)}))
    db.commit()
    return {"affected": len(links), "action": data.action}


@router.get("/highlights")
def list_all_highlights(q: str | None = None, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    query = db.query(LinkHighlight, Link).join(Link, Link.id == LinkHighlight.link_id).filter(LinkHighlight.user_id == user.id, Link.deleted_at.is_(None))
    if q:
        like = f"%{q}%"
        query = query.filter(or_(LinkHighlight.text.ilike(like), LinkHighlight.note.ilike(like), Link.title.ilike(like), Link.url.ilike(like)))
    rows = query.order_by(LinkHighlight.created_at.desc()).limit(500).all()
    return {
        "highlights": [
            {
                "id": item.id,
                "link_id": link.id,
                "link_title": link.title,
                "url": link.url,
                "text": item.text,
                "note": item.note,
                "created_at": item.created_at,
            }
            for item, link in rows
        ]
    }


@router.get("/highlights/export")
def export_highlights(format: str = "markdown", user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(LinkHighlight, Link)
        .join(Link, Link.id == LinkHighlight.link_id)
        .filter(LinkHighlight.user_id == user.id, Link.deleted_at.is_(None))
        .order_by(Link.title.asc(), LinkHighlight.created_at.asc())
        .all()
    )
    if format not in {"markdown", "obsidian", "notion"}:
        raise HTTPException(status_code=400, detail="Unsupported export format")
    lines = ["# LinkAtlas Highlights", ""]
    current = None
    for item, link in rows:
        if current != link.id:
            current = link.id
            lines.extend([f"## {link.title}", f"<{link.url}>", ""])
        lines.append(f"> {item.text}")
        if item.note:
            lines.append(f"- Note: {item.note}")
        lines.append("")
    return {"format": format, "filename": f"linkatlas-highlights.{format}.md", "content": "\n".join(lines).strip() + "\n"}


@router.get("/reader/{link_id}")
def reader_mode(link_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id, Link.deleted_at.is_(None)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    latest_archive = link.archives[0] if link.archives else None
    text = link.content or (latest_archive.readable_text if latest_archive else "") or link.description or ""
    return {
        "link": _link_payload(link),
        "content": text,
        "toc": _toc_from_text(text),
        "reading_time_minutes": _reading_time(text),
        "offline_available": bool(text or latest_archive),
        "archive_id": latest_archive.id if latest_archive else None,
        "highlights": [
            {"id": item.id, "text": item.text, "note": item.note, "created_at": item.created_at}
            for item in link.highlights[:100]
        ],
    }


@router.post("/links/{link_id}/summarize")
def summarize_link(link_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id, Link.deleted_at.is_(None)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    data = _make_summary(link)
    summary = LinkSummary(user_id=user.id, link_id=link.id, **data)
    db.add(summary)
    link.tags = list(dict.fromkeys([*(link.tags or []), *data["suggested_tags"][:3]]))
    upsert_link_index(db, link)
    upsert_link_embedding(db, link)
    db.commit()
    db.refresh(summary)
    return {
        "id": summary.id,
        "link_id": link.id,
        **data,
        "created_at": summary.created_at,
    }


@router.post("/embeddings/rebuild")
def rebuild_embeddings(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    indexed = rebuild_user_embeddings(db, user.id)
    db.commit()
    return {"indexed": indexed, "provider": "local-hash"}


@router.get("/search/semantic")
def semantic_search(q: str = Query(min_length=1), limit: int = Query(20, ge=1, le=100), user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    rebuild_user_embeddings(db, user.id)
    db.commit()
    ranked = embedding_rank(db, user.id, q, limit)
    if not ranked:
        links = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None)).limit(1000).all()
        fallback = _semantic_rank(q, links, limit)
        return {"query": q, "provider": "lexical-fallback", "links": [{"score": item["score"], "link": _link_payload(item["link"])} for item in fallback]}
    return {"query": q, "provider": "local-hash", "links": [{"score": round(score, 4), "link": _link_payload(link)} for score, link in ranked]}


@router.get("/links/{link_id}/related")
def related_links(link_id: int, limit: int = Query(8, ge=1, le=30), user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id, Link.deleted_at.is_(None)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    upsert_link_embedding(db, link)
    rebuild_user_embeddings(db, user.id)
    db.commit()
    ranked = embedding_rank(db, user.id, " ".join([link.title or "", " ".join(link.tags or []), link.description or "", link.content or ""]), limit, exclude_link_id=link.id)
    return {"link_id": link.id, "provider": "local-hash", "related": [{"score": round(score, 4), "link": _link_payload(item)} for score, item in ranked]}


@router.post("/assistant/query")
def assistant_query(data: AssistantQuery, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    rebuild_user_embeddings(db, user.id)
    db.commit()
    ranked = embedding_rank(db, user.id, data.question, data.limit)
    sources = [
        {
            "score": round(score, 4),
            "id": link.id,
            "title": link.title,
            "url": link.url,
            "description": link.description,
            "tags": link.tags or [],
            "excerpt": (link.content or link.note or link.description or "")[:500],
        }
        for score, link in ranked
    ]
    db.add(AppNotification(
        user_id=user.id,
        type="assistant",
        title="Assistant query",
        body=data.question[:160],
        payload={"source_ids": [item["id"] for item in sources]},
    ))
    db.commit()
    return {"question": data.question, "answer": _answer_from_links(data.question, ranked), "sources": sources}


@router.get("/smart/{collection_id}/links")
def smart_collection_links(collection_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    collection = db.query(SmartCollection).filter(SmartCollection.id == collection_id, SmartCollection.user_id == user.id).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Smart collection not found")
    filters = parse_search_query(collection.query)
    links = apply_python_filters(
        apply_db_filters(db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None)), filters).limit(500).all(),
        filters,
    )
    return {"collection": {"id": collection.id, "name": collection.name, "query": collection.query, "color": collection.color}, "links": [_link_payload(link) for link in links]}


@router.get("/health/history")
def health_history(limit: int = Query(100, ge=1, le=500), user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(LinkHealthCheck, Link)
        .join(Link, Link.id == LinkHealthCheck.link_id)
        .filter(LinkHealthCheck.user_id == user.id)
        .order_by(LinkHealthCheck.checked_at.desc())
        .limit(limit)
        .all()
    )
    return {"checks": [{"id": row.id, "link_id": link.id, "title": link.title, "url": link.url, "status": row.status, "final_url": row.final_url, "error": row.error, "checked_at": row.checked_at} for row, link in rows]}


@router.get("/links/{link_id}/health-history")
def link_health_history(link_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    checks = db.query(LinkHealthCheck).filter(LinkHealthCheck.link_id == link.id, LinkHealthCheck.user_id == user.id).order_by(LinkHealthCheck.checked_at.desc()).limit(100).all()
    return {"link_id": link.id, "checks": [{"id": row.id, "status": row.status, "final_url": row.final_url, "error": row.error, "checked_at": row.checked_at} for row in checks]}


@router.get("/knowledge-graph")
def knowledge_graph(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    links = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None)).order_by(Link.created_at.desc()).limit(500).all()
    nodes: list[dict] = []
    edges: list[dict] = []
    seen_nodes: set[str] = set()

    def add_node(node_id: str, label: str, type_: str, weight: int = 1, color: str | None = None) -> None:
        if node_id in seen_nodes:
            return
        seen_nodes.add(node_id)
        nodes.append({"id": node_id, "label": label, "type": type_, "weight": weight, "color": color})

    tag_counts: dict[str, int] = {}
    site_counts: dict[str, int] = {}
    for link in links:
        host = urlparse(link.url).hostname or "unknown"
        site = host.removeprefix("www.")
        site_counts[site] = site_counts.get(site, 0) + 1
        for tag in link.tags or []:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1

    for link in links:
        link_id = f"link:{link.id}"
        add_node(link_id, link.title, "link", 1, "#7c8cff")
        site = (urlparse(link.url).hostname or "unknown").removeprefix("www.")
        site_id = f"site:{site}"
        add_node(site_id, site, "site", site_counts.get(site, 1), "#2dd4bf")
        edges.append({"source": link_id, "target": site_id, "type": "site"})
        if link.tab:
            folder_id = f"folder:{link.tab.id}"
            add_node(folder_id, link.tab.name, "folder", link.tab.link_count if hasattr(link.tab, "link_count") else 1, link.tab.color)
            edges.append({"source": link_id, "target": folder_id, "type": "folder"})
        for tag in link.tags or []:
            tag_id = f"tag:{tag}"
            add_node(tag_id, tag, "tag", tag_counts.get(tag, 1), "#f59e0b")
            edges.append({"source": link_id, "target": tag_id, "type": "tag"})

    clusters = [
        {"id": f"cluster:tag:{tag}", "label": tag, "count": count}
        for tag, count in sorted(tag_counts.items(), key=lambda item: item[1], reverse=True)[:12]
    ]
    return {"nodes": nodes, "edges": edges[:2000], "clusters": clusters}


@router.get("/reminders")
def list_reminders(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None), Link.reminder_at.isnot(None)).order_by(Link.reminder_at.asc()).limit(200).all()
    return {"reminders": [_link_payload(link) for link in rows]}


@router.post("/reminders", status_code=201)
def create_reminder(data: ReminderIn, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    link = db.query(Link).filter(Link.id == data.link_id, Link.user_id == user.id, Link.deleted_at.is_(None)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    link.reminder_at = data.remind_at
    db.add(AuditLog(user_id=user.id, action="reminder.created", payload={"link_id": link.id, "reminder_at": data.remind_at.isoformat()}))
    db.commit()
    db.refresh(link)
    return _link_payload(link)


@router.post("/reminders/{link_id}/snooze")
def snooze_reminder(link_id: int, data: SnoozeIn, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id, Link.deleted_at.is_(None)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    link.reminder_at = data.remind_at
    db.add(AuditLog(user_id=user.id, action="reminder.snoozed", payload={"link_id": link.id, "reminder_at": data.remind_at.isoformat()}))
    db.commit()
    return _link_payload(link)


@router.delete("/reminders/{link_id}", status_code=204)
def clear_reminder(link_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    link = db.query(Link).filter(Link.id == link_id, Link.user_id == user.id, Link.deleted_at.is_(None)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    link.reminder_at = None
    db.commit()


@router.post("/reminders/process")
def process_due_reminders(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    job = Job(type="process_reminders", user_id=user.id, payload={}, status="queued")
    db.add(job)
    db.commit()
    return {"job_id": job.id, "status": job.status}


@router.post("/digest/{kind}")
def create_digest(kind: str, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    if kind not in {"daily", "weekly"}:
        raise HTTPException(status_code=400, detail="Digest kind must be daily or weekly")
    job = Job(type=f"{kind}_digest", user_id=user.id, payload={}, status="queued")
    db.add(job)
    db.commit()
    return {"job_id": job.id, "type": job.type, "status": job.status}


@router.get("/digest/preview/{kind}")
def digest_preview(kind: str, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    if kind not in {"daily", "weekly"}:
        raise HTTPException(status_code=400, detail="Digest kind must be daily or weekly")
    days = 7 if kind == "weekly" else 1
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    new_links = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None), Link.created_at >= cutoff).order_by(Link.created_at.desc()).limit(20).all()
    unread = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None), Link.is_read == False).order_by(Link.created_at.desc()).limit(20).all()
    stale_cutoff = datetime.now(timezone.utc) - timedelta(days=14)
    stale = db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None), Link.is_read == False, Link.created_at <= stale_cutoff).order_by(Link.created_at.asc()).limit(10).all()
    return {"kind": kind, "new_links": [_link_payload(link) for link in new_links], "unread": [_link_payload(link) for link in unread], "stale_unread": [_link_payload(link) for link in stale]}


@router.get("/commands")
def command_palette(q: str | None = None, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    query = (q or "").lower()
    base = [
        {"id": "new-link", "label": "Create link", "hint": "Save a URL", "route": "/folder/all", "type": "action"},
        {"id": "search", "label": "Search links", "hint": "Open search", "route": "/search", "type": "navigation"},
        {"id": "workflows", "label": "Open Workflow Hub", "hint": "Rules, assistant, graph", "route": "/workflows", "type": "navigation"},
        {"id": "digest-daily", "label": "Create daily digest", "hint": "Queue reading digest", "type": "action"},
        {"id": "rebuild-embeddings", "label": "Rebuild embeddings", "hint": "Refresh semantic search", "type": "action"},
    ]
    folders = [
        {"id": f"folder:{tab.id}", "label": f"Go to {tab.name}", "hint": "Folder", "route": f"/folder/{tab.id}", "type": "folder"}
        for tab in user.tabs[:50]
    ]
    tags = sorted({tag for link in db.query(Link).filter(Link.user_id == user.id, Link.deleted_at.is_(None)).limit(500).all() for tag in (link.tags or [])})
    tag_commands = [{"id": f"tag:{tag}", "label": f"Find tag {tag}", "hint": "Tag search", "route": f"/search?q=tag:{tag}", "type": "tag"} for tag in tags[:50]]
    commands = [*base, *folders, *tag_commands]
    if query:
        commands = [item for item in commands if query in item["label"].lower() or query in item.get("hint", "").lower()]
    return {"commands": commands[:80]}


@router.post("/commands/run")
def run_command(data: CommandRun, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    if data.command == "digest-daily":
        job = Job(type="daily_digest", user_id=user.id, payload={}, status="queued")
        db.add(job)
        db.commit()
        return {"status": "queued", "job_id": job.id}
    if data.command == "rebuild-embeddings":
        indexed = rebuild_user_embeddings(db, user.id)
        db.commit()
        return {"status": "ok", "indexed": indexed}
    if data.command == "new-link":
        payload = data.payload or {}
        url = payload.get("url")
        title = payload.get("title") or url
        if not url:
            raise HTTPException(status_code=400, detail="url is required")
        validate_public_http_url(url)
        tab_id = payload.get("tab_id")
        if tab_id is not None:
            try:
                tab_id = int(tab_id)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="tab_id must be numeric")
        if tab_id is not None and not db.query(Tab).filter(Tab.id == tab_id, Tab.user_id == user.id).first():
            raise HTTPException(status_code=404, detail="Tab not found")
        max_order = db.query(Link).filter(Link.user_id == user.id).count()
        link = Link(
            user_id=user.id,
            title=title[:256],
            url=url,
            canonical_url=_canonicalize_url(url),
            tags=payload.get("tags") or [],
            tab_id=tab_id,
            note=payload.get("note"),
            sort_order=max_order,
        )
        db.add(link)
        db.flush()
        db.add(LinkHistory(link_id=link.id, user_id=user.id, action="created", changes={"source": "command_palette", "url": link.url}))
        apply_automation_rules(db, link, "link_created")
        record_webhook_event(db, user.id, "link.created", {"link_id": link.id, "title": link.title, "url": link.url})
        upsert_link_index(db, link)
        upsert_link_embedding(db, link)
        db.commit()
        db.refresh(link)
        return {"status": "created", "link": _link_payload(link)}
    raise HTTPException(status_code=400, detail="Unsupported command")


@router.get("/workspaces")
def list_workspaces(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    memberships = db.query(WorkspaceMember).filter(WorkspaceMember.user_id == user.id).all()
    return {
        "workspaces": [
            {
                "id": membership.workspace.id,
                "name": membership.workspace.name,
                "description": membership.workspace.description,
                "role": membership.role,
                "members": len(membership.workspace.members),
                "created_at": membership.workspace.created_at,
            }
            for membership in memberships
        ]
    }


@router.post("/workspaces", status_code=201)
def create_workspace(data: WorkspaceIn, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    workspace = Workspace(owner_id=user.id, name=data.name, description=data.description)
    db.add(workspace)
    db.flush()
    db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role="owner"))
    db.add(AuditLog(user_id=user.id, workspace_id=workspace.id, action="workspace.created", payload={"name": workspace.name}))
    db.commit()
    db.refresh(workspace)
    return {"id": workspace.id, "name": workspace.name, "description": workspace.description, "role": "owner", "created_at": workspace.created_at}


@router.post("/workspaces/{workspace_id}/members", status_code=201)
def add_workspace_member(workspace_id: int, data: WorkspaceMemberIn, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    membership = db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user.id).first()
    if not membership or membership.role not in {"owner", "admin"}:
        raise HTTPException(status_code=404, detail="Workspace not found")
    target = db.query(User).filter(User.username == data.username).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    existing = db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == target.id).first()
    if existing:
        return {"id": existing.id, "username": target.username, "role": existing.role}
    member = WorkspaceMember(workspace_id=workspace_id, user_id=target.id, role=data.role if data.role in {"viewer", "member", "admin"} else "member")
    db.add(member)
    db.add(AuditLog(user_id=user.id, workspace_id=workspace_id, action="workspace.member_added", payload={"username": target.username, "role": member.role}))
    db.commit()
    db.refresh(member)
    return {"id": member.id, "username": target.username, "role": member.role}


@router.get("/audit")
def audit_log(limit: int = Query(100, ge=1, le=500), user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    rows = db.query(AuditLog).filter(AuditLog.user_id == user.id).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return {"events": [{"id": row.id, "workspace_id": row.workspace_id, "action": row.action, "payload": row.payload or {}, "created_at": row.created_at} for row in rows]}


@router.get("/webhooks/deliveries")
def webhook_deliveries(limit: int = Query(100, ge=1, le=500), user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    rows = db.query(WebhookDelivery).filter(WebhookDelivery.user_id == user.id).order_by(WebhookDelivery.created_at.desc()).limit(limit).all()
    return {"deliveries": [{"id": row.id, "webhook_id": row.webhook_id, "event": row.event, "status": row.status, "response_status": row.response_status, "error": row.error, "created_at": row.created_at, "delivered_at": row.delivered_at} for row in rows]}


@router.get("/webhooks")
def list_webhooks(user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    rows = db.query(WebhookEndpoint).filter(WebhookEndpoint.user_id == user.id).order_by(WebhookEndpoint.created_at.desc()).all()
    return {"webhooks": [{"id": row.id, "name": row.name, "url": row.url, "events": row.events or [], "is_enabled": row.is_enabled, "created_at": row.created_at} for row in rows]}


@router.post("/webhooks", status_code=201)
def create_webhook(data: WebhookIn, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    parsed = urlparse(data.url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Webhook URL must be http or https")
    row = WebhookEndpoint(user_id=user.id, **data.model_dump())
    db.add(row)
    db.add(AuditLog(user_id=user.id, action="webhook.created", payload={"name": row.name, "events": row.events}))
    db.commit()
    db.refresh(row)
    return {"id": row.id, "name": row.name, "url": row.url, "events": row.events or [], "is_enabled": row.is_enabled, "created_at": row.created_at}


@router.post("/webhooks/{webhook_id}/test")
def test_webhook(webhook_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    row = db.query(WebhookEndpoint).filter(WebhookEndpoint.id == webhook_id, WebhookEndpoint.user_id == user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Webhook not found")
    count = record_webhook_event(db, user.id, "webhook.test", {"webhook_id": row.id, "message": "Test event from LinkAtlas"})
    db.commit()
    return {"queued": count}


@router.delete("/webhooks/{webhook_id}", status_code=204)
def delete_webhook(webhook_id: int, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    row = db.query(WebhookEndpoint).filter(WebhookEndpoint.id == webhook_id, WebhookEndpoint.user_id == user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Webhook not found")
    db.delete(row)
    db.commit()


@router.get("/profile")
def get_profile(user: User = Depends(_get_current_user)):
    settings = user.settings or {}
    profile = settings.get("profile") or {}
    return {
        "username": user.username,
        "created_at": user.created_at,
        "profile": {
            "display_name": profile.get("display_name") or user.username,
            "bio": profile.get("bio") or "",
            "headline": profile.get("headline") or "Curated link atlas",
            "location": profile.get("location") or "",
            "website": profile.get("website") or "",
            "accent": profile.get("accent") or "#7c8cff",
            "is_public": profile.get("is_public", True),
        },
        "public_url": f"/profile/{user.username}",
    }


@router.put("/profile")
def update_profile(data: ProfileIn, user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    settings = dict(user.settings or {})
    settings["profile"] = data.model_dump()
    user.settings = settings
    db.add(AuditLog(user_id=user.id, action="profile.updated", payload={"is_public": data.is_public}))
    db.commit()
    return get_profile(user)
