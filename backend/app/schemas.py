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
    sort_order: int
    created_at: datetime
    updated_at: datetime
    http_status: Optional[int] = None
    last_checked: Optional[datetime] = None
    content: Optional[str] = None
    content_fetched: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Bulk ────────────────────────────────────────────

class BulkLinkAction(BaseModel):
    link_ids: List[int]
    action: str  # "delete", "move", "pin", "unpin", "favorite", "unfavorite"
    tab_id: Optional[int] = None


class BulkResult(BaseModel):
    affected: int


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
