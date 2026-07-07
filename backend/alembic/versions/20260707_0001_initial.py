"""Initial LinkKeep schema.

Revision ID: 20260707_0001
Revises:
Create Date: 2026-07-07
"""

from alembic import op
import sqlalchemy as sa


revision = "20260707_0001"
down_revision = None
branch_labels = None
depends_on = None


def _has_table(bind, table_name: str) -> bool:
    return sa.inspect(bind).has_table(table_name)


def _has_column(bind, table_name: str, column_name: str) -> bool:
    if not _has_table(bind, table_name):
        return False
    return column_name in {column["name"] for column in sa.inspect(bind).get_columns(table_name)}


def _add_column_if_missing(bind, table_name: str, column: sa.Column) -> None:
    if not _has_column(bind, table_name, column.name):
        op.add_column(table_name, column)


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "users"):
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("username", sa.String(length=64), nullable=False),
            sa.Column("hashed_password", sa.String(length=256), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("settings", sa.JSON(), nullable=True),
        )
        op.create_index("ix_users_username", "users", ["username"], unique=True)

    if not _has_table(bind, "tabs"):
        op.create_table(
            "tabs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("icon", sa.String(length=64), nullable=True),
            sa.Column("color", sa.String(length=16), nullable=True),
            sa.Column("sort_order", sa.Integer(), nullable=True),
            sa.Column("parent_id", sa.Integer(), sa.ForeignKey("tabs.id", ondelete="SET NULL"), nullable=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
    else:
        _add_column_if_missing(bind, "tabs", sa.Column("parent_id", sa.Integer(), nullable=True))

    if not _has_table(bind, "links"):
        op.create_table(
            "links",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("title", sa.String(length=256), nullable=False),
            sa.Column("url", sa.Text(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("favicon", sa.String(length=512), nullable=True),
            sa.Column("image", sa.Text(), nullable=True),
            sa.Column("tab_id", sa.Integer(), sa.ForeignKey("tabs.id", ondelete="CASCADE"), nullable=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
            sa.Column("is_favorite", sa.Boolean(), nullable=True),
            sa.Column("is_pinned", sa.Boolean(), nullable=True, server_default=sa.false()),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("sort_order", sa.Integer(), nullable=True),
            sa.Column("tags", sa.JSON(), nullable=True),
            sa.Column("http_status", sa.Integer(), nullable=True),
            sa.Column("last_checked", sa.DateTime(), nullable=True),
            sa.Column("content", sa.Text(), nullable=True),
            sa.Column("content_fetched", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
    else:
        _add_column_if_missing(bind, "links", sa.Column("is_pinned", sa.Boolean(), nullable=True, server_default=sa.false()))
        _add_column_if_missing(bind, "links", sa.Column("note", sa.Text(), nullable=True))
        _add_column_if_missing(bind, "links", sa.Column("image", sa.Text(), nullable=True))
        _add_column_if_missing(bind, "links", sa.Column("http_status", sa.Integer(), nullable=True))
        _add_column_if_missing(bind, "links", sa.Column("last_checked", sa.DateTime(), nullable=True))
        _add_column_if_missing(bind, "links", sa.Column("content", sa.Text(), nullable=True))
        _add_column_if_missing(bind, "links", sa.Column("content_fetched", sa.DateTime(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    for table_name in ("links", "tabs", "users"):
        if _has_table(bind, table_name):
            op.drop_table(table_name)
