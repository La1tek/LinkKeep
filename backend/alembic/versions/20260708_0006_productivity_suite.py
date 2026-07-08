"""Add productivity suite tables.

Revision ID: 20260708_0006
Revises: 20260708_0005
Create Date: 2026-07-08
"""

from alembic import op
import sqlalchemy as sa


revision = "20260708_0006"
down_revision = "20260708_0005"
branch_labels = None
depends_on = None


def _has_table(bind, table_name: str) -> bool:
    return sa.inspect(bind).has_table(table_name)


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "automation_rules"):
        op.create_table(
            "automation_rules",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("trigger", sa.String(length=48), nullable=False, server_default="link_created"),
            sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("conditions", sa.JSON(), nullable=True),
            sa.Column("actions", sa.JSON(), nullable=True),
            sa.Column("run_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("last_run_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_automation_rules_user_id", "automation_rules", ["user_id"])
        op.create_index("ix_automation_rules_trigger", "automation_rules", ["trigger"])

    if not _has_table(bind, "link_health_checks"):
        op.create_table(
            "link_health_checks",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("link_id", sa.Integer(), sa.ForeignKey("links.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("status", sa.Integer(), nullable=False),
            sa.Column("final_url", sa.Text(), nullable=True),
            sa.Column("error", sa.Text(), nullable=True),
            sa.Column("checked_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_link_health_checks_link_id", "link_health_checks", ["link_id"])
        op.create_index("ix_link_health_checks_user_id", "link_health_checks", ["user_id"])
        op.create_index("ix_link_health_checks_checked_at", "link_health_checks", ["checked_at"])

    if not _has_table(bind, "link_summaries"):
        op.create_table(
            "link_summaries",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("link_id", sa.Integer(), sa.ForeignKey("links.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("summary", sa.Text(), nullable=False),
            sa.Column("tldr", sa.Text(), nullable=True),
            sa.Column("language", sa.String(length=16), nullable=True),
            sa.Column("reading_time_minutes", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("suggested_tags", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_link_summaries_link_id", "link_summaries", ["link_id"])
        op.create_index("ix_link_summaries_user_id", "link_summaries", ["user_id"])

    if not _has_table(bind, "workspaces"):
        op.create_table(
            "workspaces",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_workspaces_owner_id", "workspaces", ["owner_id"])

    if not _has_table(bind, "workspace_members"):
        op.create_table(
            "workspace_members",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("role", sa.String(length=32), nullable=False, server_default="member"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_workspace_members_workspace_id", "workspace_members", ["workspace_id"])
        op.create_index("ix_workspace_members_user_id", "workspace_members", ["user_id"])

    if not _has_table(bind, "audit_logs"):
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True),
            sa.Column("action", sa.String(length=80), nullable=False),
            sa.Column("payload", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
        op.create_index("ix_audit_logs_workspace_id", "audit_logs", ["workspace_id"])
        op.create_index("ix_audit_logs_action", "audit_logs", ["action"])

    if not _has_table(bind, "webhook_endpoints"):
        op.create_table(
            "webhook_endpoints",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("url", sa.Text(), nullable=False),
            sa.Column("events", sa.JSON(), nullable=True),
            sa.Column("secret", sa.String(length=128), nullable=True),
            sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_webhook_endpoints_user_id", "webhook_endpoints", ["user_id"])

    if not _has_table(bind, "webhook_deliveries"):
        op.create_table(
            "webhook_deliveries",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("webhook_id", sa.Integer(), sa.ForeignKey("webhook_endpoints.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("event", sa.String(length=80), nullable=False),
            sa.Column("payload", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="queued"),
            sa.Column("response_status", sa.Integer(), nullable=True),
            sa.Column("error", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("delivered_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_webhook_deliveries_webhook_id", "webhook_deliveries", ["webhook_id"])
        op.create_index("ix_webhook_deliveries_user_id", "webhook_deliveries", ["user_id"])
        op.create_index("ix_webhook_deliveries_event", "webhook_deliveries", ["event"])


def downgrade() -> None:
    bind = op.get_bind()
    for table_name in (
        "webhook_deliveries",
        "webhook_endpoints",
        "audit_logs",
        "workspace_members",
        "workspaces",
        "link_summaries",
        "link_health_checks",
        "automation_rules",
    ):
        if _has_table(bind, table_name):
            op.drop_table(table_name)
