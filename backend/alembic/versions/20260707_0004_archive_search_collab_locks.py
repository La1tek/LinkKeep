"""Add archives, advanced search, collaboration, and folder locks.

Revision ID: 20260707_0004
Revises: 20260707_0003
Create Date: 2026-07-07
"""

from alembic import op
import sqlalchemy as sa


revision = "20260707_0004"
down_revision = "20260707_0003"
branch_labels = None
depends_on = None


def _has_table(bind, table_name: str) -> bool:
    return sa.inspect(bind).has_table(table_name)


def _has_column(bind, table_name: str, column_name: str) -> bool:
    if not _has_table(bind, table_name):
        return False
    return any(column["name"] == column_name for column in sa.inspect(bind).get_columns(table_name))


def _add_column_if_missing(bind, table_name: str, column: sa.Column) -> None:
    if not _has_column(bind, table_name, column.name):
        op.add_column(table_name, column)


def upgrade() -> None:
    bind = op.get_bind()

    _add_column_if_missing(bind, "tabs", sa.Column("password_hash", sa.String(length=256), nullable=True))
    _add_column_if_missing(bind, "tabs", sa.Column("locked_at", sa.DateTime(), nullable=True))
    _add_column_if_missing(bind, "shared_collections", sa.Column("role", sa.String(length=24), nullable=False, server_default="viewer"))
    _add_column_if_missing(bind, "shared_collections", sa.Column("public_profile", sa.Boolean(), nullable=False, server_default=sa.false()))

    if not _has_table(bind, "link_archives"):
        op.create_table(
            "link_archives",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("link_id", sa.Integer(), sa.ForeignKey("links.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("error", sa.Text(), nullable=True),
            sa.Column("html_snapshot", sa.Text(), nullable=True),
            sa.Column("readable_text", sa.Text(), nullable=True),
            sa.Column("screenshot_data_url", sa.Text(), nullable=True),
            sa.Column("pdf_data_url", sa.Text(), nullable=True),
            sa.Column("source_url", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_link_archives_link_id", "link_archives", ["link_id"])
        op.create_index("ix_link_archives_user_id", "link_archives", ["user_id"])
        op.create_index("ix_link_archives_status", "link_archives", ["status"])

    if not _has_table(bind, "folder_unlock_sessions"):
        op.create_table(
            "folder_unlock_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("tab_id", sa.Integer(), sa.ForeignKey("tabs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("token_hash", sa.String(length=128), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_folder_unlock_sessions_user_id", "folder_unlock_sessions", ["user_id"])
        op.create_index("ix_folder_unlock_sessions_tab_id", "folder_unlock_sessions", ["tab_id"])
        op.create_index("ix_folder_unlock_sessions_token_hash", "folder_unlock_sessions", ["token_hash"])

    if not _has_table(bind, "saved_searches"):
        op.create_table(
            "saved_searches",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("query", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_saved_searches_user_id", "saved_searches", ["user_id"])

    if not _has_table(bind, "smart_collections"):
        op.create_table(
            "smart_collections",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("query", sa.Text(), nullable=False),
            sa.Column("color", sa.String(length=16), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_smart_collections_user_id", "smart_collections", ["user_id"])

    if not _has_table(bind, "share_invites"):
        op.create_table(
            "share_invites",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("share_id", sa.Integer(), sa.ForeignKey("shared_collections.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("email", sa.String(length=256), nullable=True),
            sa.Column("role", sa.String(length=24), nullable=False),
            sa.Column("token", sa.String(length=96), nullable=False),
            sa.Column("accepted_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_share_invites_share_id", "share_invites", ["share_id"])
        op.create_index("ix_share_invites_user_id", "share_invites", ["user_id"])
        op.create_index("ix_share_invites_token", "share_invites", ["token"], unique=True)

    if not _has_table(bind, "share_comments"):
        op.create_table(
            "share_comments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("share_id", sa.Integer(), sa.ForeignKey("shared_collections.id", ondelete="CASCADE"), nullable=False),
            sa.Column("link_id", sa.Integer(), sa.ForeignKey("links.id", ondelete="SET NULL"), nullable=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("author_name", sa.String(length=120), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_share_comments_share_id", "share_comments", ["share_id"])
        op.create_index("ix_share_comments_link_id", "share_comments", ["link_id"])
        op.create_index("ix_share_comments_user_id", "share_comments", ["user_id"])

    if not _has_table(bind, "link_highlights"):
        op.create_table(
            "link_highlights",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("link_id", sa.Integer(), sa.ForeignKey("links.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("text", sa.Text(), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("source_url", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_link_highlights_link_id", "link_highlights", ["link_id"])
        op.create_index("ix_link_highlights_user_id", "link_highlights", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    for table_name in (
        "link_highlights",
        "share_comments",
        "share_invites",
        "smart_collections",
        "saved_searches",
        "folder_unlock_sessions",
        "link_archives",
    ):
        if _has_table(bind, table_name):
            op.drop_table(table_name)
