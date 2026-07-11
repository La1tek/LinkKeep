"""Add archive engine and AI suite primitives.

Revision ID: 20260708_0007
Revises: 20260708_0006
Create Date: 2026-07-08
"""

from alembic import op
import sqlalchemy as sa


revision = "20260708_0007"
down_revision = "20260708_0006"
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


def _has_index(bind, table_name: str, index_name: str) -> bool:
    if not _has_table(bind, table_name):
        return False
    return any(index["name"] == index_name for index in sa.inspect(bind).get_indexes(table_name))


def upgrade() -> None:
    bind = op.get_bind()

    _add_column_if_missing(bind, "link_archives", sa.Column("storage_manifest", sa.JSON(), nullable=True))
    _add_column_if_missing(bind, "link_archives", sa.Column("content_hash", sa.String(length=128), nullable=True))
    _add_column_if_missing(bind, "link_archives", sa.Column("changed_from_archive_id", sa.Integer(), nullable=True))
    _add_column_if_missing(bind, "link_archives", sa.Column("diff_summary", sa.Text(), nullable=True))
    _add_column_if_missing(bind, "link_archives", sa.Column("retry_count", sa.Integer(), nullable=True, server_default="0"))
    _add_column_if_missing(bind, "link_archives", sa.Column("engine", sa.String(length=32), nullable=True, server_default="http"))
    if not _has_index(bind, "link_archives", "ix_link_archives_content_hash"):
        op.create_index("ix_link_archives_content_hash", "link_archives", ["content_hash"])

    if not _has_table(bind, "link_embeddings"):
        op.create_table(
            "link_embeddings",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("link_id", sa.Integer(), sa.ForeignKey("links.id", ondelete="CASCADE"), nullable=False, unique=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("provider", sa.String(length=48), nullable=False, server_default="local-hash"),
            sa.Column("text_hash", sa.String(length=128), nullable=False),
            sa.Column("vector", sa.JSON(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_link_embeddings_link_id", "link_embeddings", ["link_id"], unique=True)
        op.create_index("ix_link_embeddings_user_id", "link_embeddings", ["user_id"])
        op.create_index("ix_link_embeddings_text_hash", "link_embeddings", ["text_hash"])


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "link_embeddings"):
        op.drop_table("link_embeddings")
