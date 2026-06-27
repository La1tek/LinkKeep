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


class Tab(Base):
    __tablename__ = "tabs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    icon = Column(String(64), default="FolderSimple")
    color = Column(String(16), default("#6366f1")
    sort_order = Column(Integer, default=0)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="tabs")
    links = relationship("Link", back_populates="tab", cascade="all, delete-orphan")


class Link(Base):
    __tablename__ = "links"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(256), nullable=False)
    url = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    favicon = Column(String(512), nullable=True)
    tab_id = Column(Integer, ForeignKey("tabs.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    is_favorite = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    tags = Column(JSON, default=list)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="links")
    tab = relationship("Tab", back_populates="links")
