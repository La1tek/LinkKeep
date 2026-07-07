"""Add jobs, snapshots, shares, and search index.

Revision ID: 20260707_0003
Revises: 20260707_0002
Create Date: 2026-07-07
"""

from alembic import op
import sqlalchemy as sa


revision = "20260707_0003"
down_revision = "20260707_0002"
branch_labels = None
depends_on = None


def _has_table(bind, table_name: str) -> bool:
    return sa.inspect(bind).has_table(table_name)


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "jobs"):
        op.create_table(
            "jobs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
            sa.Column("type", sa.String(length=64), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("payload", sa.JSON(), nullable=True),
            sa.Column("result", sa.JSON(), nullable=True),
            sa.Column("error", sa.Text(), nullable=True),
            sa.Column("scheduled_at", sa.DateTime(), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_jobs_user_id", "jobs", ["user_id"])
        op.create_index("ix_jobs_type", "jobs", ["type"])
        op.create_index("ix_jobs_status", "jobs", ["status"])

    if not _has_table(bind, "backup_snapshots"):
        op.create_table(
            "backup_snapshots",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("data", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_backup_snapshots_user_id", "backup_snapshots", ["user_id"])

    if not _has_table(bind, "shared_collections"):
        op.create_table(
            "shared_collections",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("tab_id", sa.Integer(), sa.ForeignKey("tabs.id", ondelete="SET NULL"), nullable=True),
            sa.Column("token", sa.String(length=96), nullable=False),
            sa.Column("title", sa.String(length=160), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_shared_collections_user_id", "shared_collections", ["user_id"])
        op.create_index("ix_shared_collections_token", "shared_collections", ["token"], unique=True)

    if not _has_table(bind, "link_search_index"):
        op.create_table(
            "link_search_index",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("link_id", sa.Integer(), sa.ForeignKey("links.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("text", sa.Text(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_link_search_index_link_id", "link_search_index", ["link_id"], unique=True)
        op.create_index("ix_link_search_index_user_id", "link_search_index", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    for table_name in ("link_search_index", "shared_collections", "backup_snapshots", "jobs"):
        if _has_table(bind, table_name):
            op.drop_table(table_name)
