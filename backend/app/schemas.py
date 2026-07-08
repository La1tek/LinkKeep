from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Any
from datetime import datetime
import re


def _validate_http_url(value: Optional[str]) -> Optional[str]:
    if value is None:
        return value
    value = value.strip()
    if not value:
        raise ValueError("URL is required")
    if not (value.startswith("http://") or value.startswith("https://")):
        raise ValueError("Only http and https URLs are allowed")
    return value


def _validate_color(value: Optional[str]) -> Optional[str]:
    if value is None:
        return value
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        raise ValueError("Color must be a hex value like #6366f1")
    return value


# ── Auth ────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=4, max_length=256)


class UserOut(BaseModel):
    id: int
    username: str
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SessionOut(BaseModel):
    id: int
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime
    expires_at: datetime
    revoked_at: Optional[datetime] = None
    current: bool = False

    class Config:
        from_attributes = True


# ── Tab ──────────────────────────────────────────────

class TabBase(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    icon: Optional[str] = Field(default="FolderSimple", max_length=64)
    color: Optional[str] = "#6366f1"

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: Optional[str]) -> Optional[str]:
        return _validate_color(value)


class TabCreate(TabBase):
    parent_id: Optional[int] = None


class TabUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=128)
    icon: Optional[str] = Field(default=None, max_length=64)
    color: Optional[str] = None
    sort_order: Optional[int] = None
    parent_id: Optional[int] = None

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: Optional[str]) -> Optional[str]:
        return _validate_color(value)


class TabOut(TabBase):
    id: int
    sort_order: int
    parent_id: Optional[int] = None
    created_at: datetime
    link_count: int = 0
    child_count: int = 0
    total_link_count: int = 0
    is_locked: bool = False
    is_unlocked: bool = False

    class Config:
        from_attributes = True


# ── Link ─────────────────────────────────────────────

class LinkBase(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    url: str
    description: Optional[str] = None
    favicon: Optional[str] = None
    image: Optional[str] = None
    tab_id: Optional[int] = None
    tags: List[str] = Field(default_factory=list)
    is_favorite: bool = False
    is_pinned: bool = False
    is_read: bool = False
    priority: Optional[str] = "normal"
    reminder_at: Optional[datetime] = None
    note: Optional[str] = None

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return _validate_http_url(value)


class LinkCreate(LinkBase):
    pass


class LinkUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=256)
    url: Optional[str] = None
    description: Optional[str] = None
    favicon: Optional[str] = None
    image: Optional[str] = None
    tab_id: Optional[int] = None
    tags: Optional[List[str]] = None
    is_favorite: Optional[bool] = None
    is_pinned: Optional[bool] = None
    is_read: Optional[bool] = None
    priority: Optional[str] = None
    reminder_at: Optional[datetime] = None
    note: Optional[str] = None
    sort_order: Optional[int] = None
    content: Optional[str] = None
    content_fetched: Optional[datetime] = None

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: Optional[str]) -> Optional[str]:
        return _validate_http_url(value)


class LinkOut(LinkBase):
    id: int
    canonical_url: Optional[str] = None
    sort_order: int
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None
    http_status: Optional[int] = None
    last_checked: Optional[datetime] = None
    content: Optional[str] = None
    content_fetched: Optional[datetime] = None
    archive_status: Optional[str] = None
    archive_id: Optional[int] = None

    class Config:
        from_attributes = True


# ── Bulk ────────────────────────────────────────────

class BulkLinkAction(BaseModel):
    link_ids: List[int]
    action: str
    tab_id: Optional[int] = None
    tags: List[str] = Field(default_factory=list)
    priority: Optional[str] = None


class BulkResult(BaseModel):
    affected: int
    action: Optional[str] = None


class LinkHistoryOut(BaseModel):
    id: int
    action: str
    changes: dict = Field(default_factory=dict)
    created_at: datetime

    class Config:
        from_attributes = True


class LinkAttachmentOut(BaseModel):
    id: int
    filename: str
    content_type: Optional[str] = None
    size: int
    created_at: datetime

    class Config:
        from_attributes = True


class LinkDetailOut(BaseModel):
    link: LinkOut
    history: List[LinkHistoryOut] = Field(default_factory=list)
    archives: List[dict] = Field(default_factory=list)
    highlights: List[dict] = Field(default_factory=list)
    attachments: List[LinkAttachmentOut] = Field(default_factory=list)


class AttachmentCreate(BaseModel):
    filename: str = Field(min_length=1, max_length=256)
    content_type: Optional[str] = Field(default=None, max_length=128)
    data_url: str = Field(min_length=1, max_length=2_500_000)


class ImportPreviewOut(BaseModel):
    mode: str
    tabs_new: int = 0
    tabs_existing: int = 0
    links_new: int = 0
    links_existing: int = 0
    links_invalid: int = 0
    replace_deletes_links: int = 0
    replace_deletes_tabs: int = 0
    sample_links: List[dict] = Field(default_factory=list)


class ApiTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    scopes: List[str] = Field(default_factory=lambda: ["links:read", "links:write"])


class ApiTokenOut(BaseModel):
    id: int
    name: str
    token_prefix: str
    scopes: List[str] = Field(default_factory=list)
    created_at: datetime
    last_used_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ApiTokenCreated(ApiTokenOut):
    token: str


class NotificationOut(BaseModel):
    id: int
    type: str
    title: str
    body: Optional[str] = None
    payload: dict = Field(default_factory=dict)
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Metadata ─────────────────────────────────────────

class MetadataResponse(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    favicon: Optional[str] = None
    image: Optional[str] = None


# ── Generic ──────────────────────────────────────────

class Message(BaseModel):
    message: str


class StatsOut(BaseModel):
    total_links: int
    total_tabs: int
    total_favorites: int
    total_pinned: int
    recent_links: List[LinkOut] = Field(default_factory=list)


# ── Bot ──────────────────────────────────────────────

class BotStatus(BaseModel):
    enabled: bool
    username: Optional[str] = None
    webhook_url: Optional[str] = None
