from pydantic import BaseModel, HttpUrl
from typing import Optional, List, Any
from datetime import datetime


# ── Auth ────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    password: str


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
    name: str
    icon: Optional[str] = "FolderSimple"
    color: Optional[str] = "#6366f1"


class TabCreate(TabBase):
    parent_id: Optional[int] = None


class TabUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
    parent_id: Optional[int] = None


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
    title: str
    url: str
    description: Optional[str] = None
    favicon: Optional[str] = None
    image: Optional[str] = None
    tab_id: Optional[int] = None
    tags: List[str] = []
    is_favorite: bool = False
    is_pinned: bool = False
    note: Optional[str] = None


class LinkCreate(LinkBase):
    pass


class LinkUpdate(BaseModel):
    title: Optional[str] = None
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


class LinkOut(LinkBase):
    id: int
    sort_order: int
    created_at: datetime
    updated_at: datetime

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
    recent_links: List[LinkOut] = []


# ── Bot ──────────────────────────────────────────────

class BotStatus(BaseModel):
    enabled: bool
    username: Optional[str] = None
    webhook_url: Optional[str] = None
