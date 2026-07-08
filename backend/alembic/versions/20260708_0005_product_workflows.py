"""Add product workflow primitives.

Revision ID: 20260708_0005
Revises: 20260707_0004
Create Date: 2026-07-08
"""

from alembic import op
import sqlalchemy as sa


revision = "20260708_0005"
down_revision = "20260707_0004"
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

    _add_column_if_missing(bind, "links", sa.Column("canonical_url", sa.Text(), nullable=True))
    _add_column_if_missing(bind, "links", sa.Column("is_read", sa.Boolean(), nullable=True, server_default=sa.false()))
    _add_column_if_missing(bind, "links", sa.Column("priority", sa.String(length=16), nullable=True, server_default="normal"))
    _add_column_if_missing(bind, "links", sa.Column("reminder_at", sa.DateTime(), nullable=True))
    _add_column_if_missing(bind, "links", sa.Column("deleted_at", sa.DateTime(), nullable=True))

    if not _has_table(bind, "link_history"):
        op.create_table(
            "link_history",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("link_id", sa.Integer(), sa.ForeignKey("links.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("action", sa.String(length=64), nullable=False),
            sa.Column("changes", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_link_history_link_id", "link_history", ["link_id"])
        op.create_index("ix_link_history_user_id", "link_history", ["user_id"])
        op.create_index("ix_link_history_action", "link_history", ["action"])

    if not _has_table(bind, "link_attachments"):
        op.create_table(
            "link_attachments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("link_id", sa.Integer(), sa.ForeignKey("links.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("filename", sa.String(length=256), nullable=False),
            sa.Column("content_type", sa.String(length=128), nullable=True),
            sa.Column("size", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("data_url", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_link_attachments_link_id", "link_attachments", ["link_id"])
        op.create_index("ix_link_attachments_user_id", "link_attachments", ["user_id"])

    if not _has_table(bind, "api_tokens"):
        op.create_table(
            "api_tokens",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("token_hash", sa.String(length=128), nullable=False),
            sa.Column("token_prefix", sa.String(length=16), nullable=False),
            sa.Column("scopes", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("last_used_at", sa.DateTime(), nullable=True),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_api_tokens_user_id", "api_tokens", ["user_id"])
        op.create_index("ix_api_tokens_token_hash", "api_tokens", ["token_hash"], unique=True)

    if not _has_table(bind, "app_notifications"):
        op.create_table(
            "app_notifications",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("type", sa.String(length=64), nullable=False),
            sa.Column("title", sa.String(length=160), nullable=False),
            sa.Column("body", sa.Text(), nullable=True),
            sa.Column("payload", sa.JSON(), nullable=True),
            sa.Column("read_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_app_notifications_user_id", "app_notifications", ["user_id"])
        op.create_index("ix_app_notifications_type", "app_notifications", ["type"])


def downgrade() -> None:
    bind = op.get_bind()
    for table_name in ("app_notifications", "api_tokens", "link_attachments", "link_history"):
        if _has_table(bind, table_name):
            op.drop_table(table_name)
