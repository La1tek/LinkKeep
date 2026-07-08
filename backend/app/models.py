from sqlalchemy import (
    Column, Integer, String, Boolean, ForeignKey, DateTime, Text, JSON
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    hashed_password = Column(String(256), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    settings = Column(JSON, default=dict)

    tabs = relationship("Tab", back_populates="owner", cascade="all, delete-orphan")
    links = relationship("Link", back_populates="owner", cascade="all, delete-orphan")
    sessions = relationship("SessionToken", back_populates="owner", cascade="all, delete-orphan")
    jobs = relationship("Job", back_populates="owner", cascade="all, delete-orphan")
    snapshots = relationship("BackupSnapshot", back_populates="owner", cascade="all, delete-orphan")
    shares = relationship("SharedCollection", back_populates="owner", cascade="all, delete-orphan")
    api_tokens = relationship("ApiToken", back_populates="owner", cascade="all, delete-orphan")
    notifications = relationship("AppNotification", back_populates="owner", cascade="all, delete-orphan")


class Tab(Base):
    __tablename__ = "tabs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    icon = Column(String(64), default="FolderSimple")
    color = Column(String(16), default="#6366f1")
    sort_order = Column(Integer, default=0)
    parent_id = Column(Integer, ForeignKey("tabs.id", ondelete="SET NULL"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    password_hash = Column(String(256), nullable=True)
    locked_at = Column(DateTime, nullable=True)

    owner = relationship("User", back_populates="tabs")
    links = relationship("Link", back_populates="tab", cascade="all, delete-orphan")
    parent = relationship("Tab", remote_side=[id], backref="children")


class Link(Base):
    __tablename__ = "links"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(256), nullable=False)
    url = Column(Text, nullable=False)
    canonical_url = Column(Text, nullable=True, index=True)
    description = Column(Text, nullable=True)
    favicon = Column(String(512), nullable=True)
    image = Column(Text, nullable=True)
    tab_id = Column(Integer, ForeignKey("tabs.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    is_favorite = Column(Boolean, default=False)
    is_pinned = Column(Boolean, default=False)
    is_read = Column(Boolean, default=False)
    priority = Column(String(16), default="normal")
    reminder_at = Column(DateTime, nullable=True)
    note = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)
    tags = Column(JSON, default=list)
    http_status = Column(Integer, nullable=True)
    last_checked = Column(DateTime, nullable=True)
    content = Column(Text, nullable=True)
    content_fetched = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="links")
    tab = relationship("Tab", back_populates="links")
    archives = relationship("LinkArchive", back_populates="link", cascade="all, delete-orphan", order_by="desc(LinkArchive.created_at)")
    highlights = relationship("LinkHighlight", back_populates="link", cascade="all, delete-orphan")
    history = relationship("LinkHistory", back_populates="link", cascade="all, delete-orphan", order_by="desc(LinkHistory.created_at)")
    attachments = relationship("LinkAttachment", back_populates="link", cascade="all, delete-orphan", order_by="desc(LinkAttachment.created_at)")

    @property
    def archive_status(self) -> str | None:
        if not self.archives:
            return None
        return self.archives[0].status

    @property
    def archive_id(self) -> int | None:
        if not self.archives:
            return None
        return self.archives[0].id


class SessionToken(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_jti = Column(String(128), unique=True, index=True, nullable=False)
    user_agent = Column(String(512), nullable=True)
    ip_address = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)

    owner = relationship("User", back_populates="sessions")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    type = Column(String(64), nullable=False, index=True)
    status = Column(String(32), default="queued", nullable=False, index=True)
    payload = Column(JSON, default=dict)
    result = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    scheduled_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    owner = relationship("User", back_populates="jobs")


class BackupSnapshot(Base):
    __tablename__ = "backup_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(160), nullable=False)
    data = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    owner = relationship("User", back_populates="snapshots")


class SharedCollection(Base):
    __tablename__ = "shared_collections"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tab_id = Column(Integer, ForeignKey("tabs.id", ondelete="SET NULL"), nullable=True)
    token = Column(String(96), unique=True, index=True, nullable=False)
    title = Column(String(160), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    role = Column(String(24), default="viewer", nullable=False)
    public_profile = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    owner = relationship("User", back_populates="shares")
    tab = relationship("Tab")
    invites = relationship("ShareInvite", back_populates="share", cascade="all, delete-orphan")
    comments = relationship("ShareComment", back_populates="share", cascade="all, delete-orphan")


class LinkSearchIndex(Base):
    __tablename__ = "link_search_index"

    id = Column(Integer, primary_key=True, index=True)
    link_id = Column(Integer, ForeignKey("links.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    text = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    link = relationship("Link")


class LinkArchive(Base):
    __tablename__ = "link_archives"

    id = Column(Integer, primary_key=True, index=True)
    link_id = Column(Integer, ForeignKey("links.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(32), default="pending", nullable=False, index=True)
    error = Column(Text, nullable=True)
    html_snapshot = Column(Text, nullable=True)
    readable_text = Column(Text, nullable=True)
    screenshot_data_url = Column(Text, nullable=True)
    pdf_data_url = Column(Text, nullable=True)
    source_url = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    link = relationship("Link", back_populates="archives")


class FolderUnlockSession(Base):
    __tablename__ = "folder_unlock_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tab_id = Column(Integer, ForeignKey("tabs.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(128), nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    tab = relationship("Tab")


class SavedSearch(Base):
    __tablename__ = "saved_searches"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    query = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class SmartCollection(Base):
    __tablename__ = "smart_collections"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    query = Column(Text, nullable=False)
    color = Column(String(16), default="#6366f1")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class ShareInvite(Base):
    __tablename__ = "share_invites"

    id = Column(Integer, primary_key=True, index=True)
    share_id = Column(Integer, ForeignKey("shared_collections.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    email = Column(String(256), nullable=True)
    role = Column(String(24), default="viewer", nullable=False)
    token = Column(String(96), unique=True, index=True, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    share = relationship("SharedCollection", back_populates="invites")
    user = relationship("User")


class ShareComment(Base):
    __tablename__ = "share_comments"

    id = Column(Integer, primary_key=True, index=True)
    share_id = Column(Integer, ForeignKey("shared_collections.id", ondelete="CASCADE"), nullable=False, index=True)
    link_id = Column(Integer, ForeignKey("links.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    author_name = Column(String(120), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    share = relationship("SharedCollection", back_populates="comments")
    link = relationship("Link")
    user = relationship("User")


class LinkHighlight(Base):
    __tablename__ = "link_highlights"

    id = Column(Integer, primary_key=True, index=True)
    link_id = Column(Integer, ForeignKey("links.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    text = Column(Text, nullable=False)
    note = Column(Text, nullable=True)
    source_url = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    link = relationship("Link", back_populates="highlights")


class LinkHistory(Base):
    __tablename__ = "link_history"

    id = Column(Integer, primary_key=True, index=True)
    link_id = Column(Integer, ForeignKey("links.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String(64), nullable=False, index=True)
    changes = Column(JSON, default=dict)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    link = relationship("Link", back_populates="history")
    user = relationship("User")


class LinkAttachment(Base):
    __tablename__ = "link_attachments"

    id = Column(Integer, primary_key=True, index=True)
    link_id = Column(Integer, ForeignKey("links.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(256), nullable=False)
    content_type = Column(String(128), nullable=True)
    size = Column(Integer, default=0, nullable=False)
    data_url = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    link = relationship("Link", back_populates="attachments")
    user = relationship("User")


class ApiToken(Base):
    __tablename__ = "api_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    token_hash = Column(String(128), unique=True, index=True, nullable=False)
    token_prefix = Column(String(16), nullable=False)
    scopes = Column(JSON, default=list)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    last_used_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)

    owner = relationship("User", back_populates="api_tokens")


class AppNotification(Base):
    __tablename__ = "app_notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(64), nullable=False, index=True)
    title = Column(String(160), nullable=False)
    body = Column(Text, nullable=True)
    payload = Column(JSON, default=dict)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    owner = relationship("User", back_populates="notifications")
