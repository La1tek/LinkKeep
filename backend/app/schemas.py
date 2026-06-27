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
    pass


class TabUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None


class TabOut(TabBase):
    id: int
    sort_order: int
    created_at: datetime
    link_count: int = 0

    class Config:
        from_attributes = True


# ── Link ─────────────────────────────────────────────

class LinkBase(BaseModel):
    title: str
    url: str
    description: Optional[str] = None
    favicon: Optional[str] = None
    tab_id: Optional[int] = None
    tags: List[str] = []
    is_favorite: bool = False


class LinkCreate(LinkBase):
    pass


class LinkUpdate(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    favicon: Optional[str] = None
    tab_id: Optional[int] = None
    tags: Optional[List[str]] = None
    is_favorite: Optional[bool] = None
    sort_order: Optional[int] = None


class LinkOut(LinkBase):
    id: int
    sort_order: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Metadata ─────────────────────────────────────────

class MetadataResponse(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    favicon: Optional[str] = None


# ── Generic ──────────────────────────────────────────

class Message(BaseModel):
    message: str


class StatsOut(BaseModel):
    total_links: int
    total_tabs: int
    total_favorites: int
    recent_links: List[LinkOut] = []
