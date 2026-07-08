from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from app.models import AppNotification, AutomationRule, Job, Link, LinkHistory, Tab, WebhookDelivery, WebhookEndpoint


def _hostname(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower().removeprefix("www.")
    except Exception:
        return ""


def _matches_site(url: str, site: str) -> bool:
    host = _hostname(url)
    value = (site or "").lower().removeprefix("www.")
    return bool(value and (host == value or host.endswith(f".{value}")))


def _merge_tags(existing: list[str] | None, incoming: list[str] | None) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for tag in [*(existing or []), *(incoming or [])]:
        value = str(tag).strip()
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value[:64])
    return result


def _find_or_create_tab(db: Session, user_id: int, name: str, color: str = "#6366f1") -> Tab:
    tab = db.query(Tab).filter(Tab.user_id == user_id, Tab.name == name).first()
    if tab:
        return tab
    tab = Tab(user_id=user_id, name=name[:128], color=color)
    db.add(tab)
    db.flush()
    return tab


def _is_dead(link: Link) -> bool:
    return link.http_status == 0 or (link.http_status or 0) >= 400


def rule_matches_link(rule: AutomationRule, link: Link, trigger: str) -> bool:
    if not rule.is_enabled or rule.trigger != trigger:
        return False
    conditions = rule.conditions or {}
    if conditions.get("only_ungrouped") and link.tab_id is not None:
        return False
    if conditions.get("site") and not _matches_site(link.url, str(conditions["site"])):
        return False
    if conditions.get("url_contains") and str(conditions["url_contains"]).lower() not in (link.url or "").lower():
        return False
    if conditions.get("tag") and str(conditions["tag"]) not in (link.tags or []):
        return False
    if conditions.get("status") == "dead" and not _is_dead(link):
        return False
    if conditions.get("status") == "alive" and _is_dead(link):
        return False
    return True


def record_webhook_event(db: Session, user_id: int, event: str, payload: dict) -> int:
    endpoints = (
        db.query(WebhookEndpoint)
        .filter(WebhookEndpoint.user_id == user_id, WebhookEndpoint.is_enabled == True)
        .all()
    )
    created = 0
    for endpoint in endpoints:
        events = endpoint.events or []
        if events and event not in events and "*" not in events:
            continue
        db.add(WebhookDelivery(webhook_id=endpoint.id, user_id=user_id, event=event, payload=payload, status="queued"))
        created += 1
    return created


def apply_automation_rules(db: Session, link: Link, trigger: str) -> int:
    rules = (
        db.query(AutomationRule)
        .filter(AutomationRule.user_id == link.user_id, AutomationRule.is_enabled == True, AutomationRule.trigger == trigger)
        .order_by(AutomationRule.id.asc())
        .all()
    )
    applied = 0
    for rule in rules:
        if not rule_matches_link(rule, link, trigger):
            continue
        actions = rule.actions or {}

        tab_name = actions.get("tab_name") or actions.get("move_to_tab_name")
        if tab_name:
            tab = _find_or_create_tab(db, link.user_id, str(tab_name), actions.get("tab_color") or "#6366f1")
            link.tab_id = tab.id

        if actions.get("add_tags"):
            link.tags = _merge_tags(link.tags, actions.get("add_tags"))

        if "mark_read" in actions:
            link.is_read = bool(actions["mark_read"])

        if actions.get("priority"):
            link.priority = str(actions["priority"])[:16]

        if actions.get("dead_action") == "review" and _is_dead(link):
            tab = _find_or_create_tab(db, link.user_id, "Review", "#f59e0b")
            link.tab_id = tab.id
            link.tags = _merge_tags(link.tags, ["dead", "review"])

        if actions.get("dead_action") == "trash" and _is_dead(link):
            link.deleted_at = datetime.now(timezone.utc)

        if actions.get("archive"):
            db.add(Job(type="archive_links", user_id=link.user_id, payload={"link_ids": [link.id]}, status="queued"))

        rule.run_count = (rule.run_count or 0) + 1
        rule.last_run_at = datetime.now(timezone.utc)
        db.add(LinkHistory(link_id=link.id, user_id=link.user_id, action="automation_applied", changes={"rule_id": rule.id, "rule": rule.name}))
        applied += 1

    if applied:
        db.add(AppNotification(
            user_id=link.user_id,
            type="automation",
            title="Automation rules applied",
            body=f"{applied} rules ran for {link.title}",
            payload={"link_id": link.id, "applied": applied},
        ))
    return applied
