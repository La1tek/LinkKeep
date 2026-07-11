import sqlalchemy as sa


MIGRATIONS = [
    ("20240701_links_is_pinned", "links", "is_pinned", "ALTER TABLE links ADD COLUMN is_pinned BOOLEAN DEFAULT 0"),
    ("20240701_links_note", "links", "note", "ALTER TABLE links ADD COLUMN note TEXT"),
    ("20240701_links_image", "links", "image", "ALTER TABLE links ADD COLUMN image TEXT"),
    ("20240701_tabs_parent_id", "tabs", "parent_id", "ALTER TABLE tabs ADD COLUMN parent_id INTEGER"),
    ("20240701_links_http_status", "links", "http_status", "ALTER TABLE links ADD COLUMN http_status INTEGER"),
    ("20240701_links_last_checked", "links", "last_checked", "ALTER TABLE links ADD COLUMN last_checked TIMESTAMP"),
    ("20240701_links_content", "links", "content", "ALTER TABLE links ADD COLUMN content TEXT"),
    ("20240701_links_content_fetched", "links", "content_fetched", "ALTER TABLE links ADD COLUMN content_fetched TIMESTAMP"),
    ("20260708_links_canonical_url", "links", "canonical_url", "ALTER TABLE links ADD COLUMN canonical_url TEXT"),
    ("20260708_links_is_read", "links", "is_read", "ALTER TABLE links ADD COLUMN is_read BOOLEAN DEFAULT 0"),
    ("20260708_links_priority", "links", "priority", "ALTER TABLE links ADD COLUMN priority VARCHAR(16) DEFAULT 'normal'"),
    ("20260708_links_reminder_at", "links", "reminder_at", "ALTER TABLE links ADD COLUMN reminder_at TIMESTAMP"),
    ("20260708_links_deleted_at", "links", "deleted_at", "ALTER TABLE links ADD COLUMN deleted_at TIMESTAMP"),
    ("20260708_archives_storage_manifest", "link_archives", "storage_manifest", "ALTER TABLE link_archives ADD COLUMN storage_manifest JSON"),
    ("20260708_archives_content_hash", "link_archives", "content_hash", "ALTER TABLE link_archives ADD COLUMN content_hash VARCHAR(128)"),
    ("20260708_archives_changed_from", "link_archives", "changed_from_archive_id", "ALTER TABLE link_archives ADD COLUMN changed_from_archive_id INTEGER"),
    ("20260708_archives_diff_summary", "link_archives", "diff_summary", "ALTER TABLE link_archives ADD COLUMN diff_summary TEXT"),
    ("20260708_archives_retry_count", "link_archives", "retry_count", "ALTER TABLE link_archives ADD COLUMN retry_count INTEGER DEFAULT 0"),
    ("20260708_archives_engine", "link_archives", "engine", "ALTER TABLE link_archives ADD COLUMN engine VARCHAR(32) DEFAULT 'http'"),
]


def run_startup_migrations(engine):
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            "id VARCHAR(128) PRIMARY KEY, "
            "applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
            ")"
        )
        inspector = sa.inspect(conn)
        for migration_id, table_name, column_name, ddl in MIGRATIONS:
            columns = {column["name"] for column in inspector.get_columns(table_name)}
            if column_name not in columns:
                conn.exec_driver_sql(ddl)
            conn.exec_driver_sql(
                "INSERT INTO schema_migrations (id) VALUES (:id) ON CONFLICT(id) DO NOTHING",
                {"id": migration_id},
            )

        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS link_history ("
            "id INTEGER PRIMARY KEY, "
            "link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE, "
            "user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
            "action VARCHAR(64) NOT NULL, "
            "changes JSON, "
            "created_at TIMESTAMP NOT NULL"
            ")"
        )
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_link_history_link_id ON link_history(link_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_link_history_user_id ON link_history(user_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_link_history_action ON link_history(action)")

        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS link_attachments ("
            "id INTEGER PRIMARY KEY, "
            "link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE, "
            "user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
            "filename VARCHAR(256) NOT NULL, "
            "content_type VARCHAR(128), "
            "size INTEGER DEFAULT 0 NOT NULL, "
            "data_url TEXT NOT NULL, "
            "created_at TIMESTAMP NOT NULL"
            ")"
        )
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_link_attachments_link_id ON link_attachments(link_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_link_attachments_user_id ON link_attachments(user_id)")

        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS api_tokens ("
            "id INTEGER PRIMARY KEY, "
            "user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
            "name VARCHAR(120) NOT NULL, "
            "token_hash VARCHAR(128) NOT NULL UNIQUE, "
            "token_prefix VARCHAR(16) NOT NULL, "
            "scopes JSON, "
            "created_at TIMESTAMP NOT NULL, "
            "last_used_at TIMESTAMP, "
            "revoked_at TIMESTAMP"
            ")"
        )
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_api_tokens_user_id ON api_tokens(user_id)")
        conn.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_api_tokens_token_hash ON api_tokens(token_hash)")

        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS app_notifications ("
            "id INTEGER PRIMARY KEY, "
            "user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
            "type VARCHAR(64) NOT NULL, "
            "title VARCHAR(160) NOT NULL, "
            "body TEXT, "
            "payload JSON, "
            "read_at TIMESTAMP, "
            "created_at TIMESTAMP NOT NULL"
            ")"
        )
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_app_notifications_user_id ON app_notifications(user_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_app_notifications_type ON app_notifications(type)")

        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS automation_rules ("
            "id INTEGER PRIMARY KEY, "
            "user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
            "name VARCHAR(160) NOT NULL, "
            "trigger VARCHAR(48) DEFAULT 'link_created' NOT NULL, "
            "is_enabled BOOLEAN DEFAULT 1 NOT NULL, "
            "conditions JSON, "
            "actions JSON, "
            "run_count INTEGER DEFAULT 0 NOT NULL, "
            "last_run_at TIMESTAMP, "
            "created_at TIMESTAMP NOT NULL"
            ")"
        )
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_automation_rules_user_id ON automation_rules(user_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_automation_rules_trigger ON automation_rules(trigger)")

        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS link_health_checks ("
            "id INTEGER PRIMARY KEY, "
            "link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE, "
            "user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
            "status INTEGER NOT NULL, "
            "final_url TEXT, "
            "error TEXT, "
            "checked_at TIMESTAMP NOT NULL"
            ")"
        )
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_link_health_checks_link_id ON link_health_checks(link_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_link_health_checks_user_id ON link_health_checks(user_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_link_health_checks_checked_at ON link_health_checks(checked_at)")

        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS link_summaries ("
            "id INTEGER PRIMARY KEY, "
            "link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE, "
            "user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
            "summary TEXT NOT NULL, "
            "tldr TEXT, "
            "language VARCHAR(16), "
            "reading_time_minutes INTEGER DEFAULT 1 NOT NULL, "
            "suggested_tags JSON, "
            "created_at TIMESTAMP NOT NULL"
            ")"
        )
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_link_summaries_link_id ON link_summaries(link_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_link_summaries_user_id ON link_summaries(user_id)")

        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS workspaces ("
            "id INTEGER PRIMARY KEY, "
            "owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
            "name VARCHAR(160) NOT NULL, "
            "description TEXT, "
            "created_at TIMESTAMP NOT NULL"
            ")"
        )
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_workspaces_owner_id ON workspaces(owner_id)")

        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS workspace_members ("
            "id INTEGER PRIMARY KEY, "
            "workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, "
            "user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
            "role VARCHAR(32) DEFAULT 'member' NOT NULL, "
            "created_at TIMESTAMP NOT NULL"
            ")"
        )
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_workspace_members_workspace_id ON workspace_members(workspace_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_workspace_members_user_id ON workspace_members(user_id)")

        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS audit_logs ("
            "id INTEGER PRIMARY KEY, "
            "user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
            "workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL, "
            "action VARCHAR(80) NOT NULL, "
            "payload JSON, "
            "created_at TIMESTAMP NOT NULL"
            ")"
        )
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_audit_logs_user_id ON audit_logs(user_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_audit_logs_workspace_id ON audit_logs(workspace_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_audit_logs_action ON audit_logs(action)")

        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS webhook_endpoints ("
            "id INTEGER PRIMARY KEY, "
            "user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
            "name VARCHAR(160) NOT NULL, "
            "url TEXT NOT NULL, "
            "events JSON, "
            "secret VARCHAR(128), "
            "is_enabled BOOLEAN DEFAULT 1 NOT NULL, "
            "created_at TIMESTAMP NOT NULL"
            ")"
        )
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_webhook_endpoints_user_id ON webhook_endpoints(user_id)")

        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS webhook_deliveries ("
            "id INTEGER PRIMARY KEY, "
            "webhook_id INTEGER NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE, "
            "user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
            "event VARCHAR(80) NOT NULL, "
            "payload JSON, "
            "status VARCHAR(32) DEFAULT 'queued' NOT NULL, "
            "response_status INTEGER, "
            "error TEXT, "
            "created_at TIMESTAMP NOT NULL, "
            "delivered_at TIMESTAMP"
            ")"
        )
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_webhook_deliveries_user_id ON webhook_deliveries(user_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_webhook_deliveries_event ON webhook_deliveries(event)")

        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_link_archives_content_hash ON link_archives(content_hash)")

        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS link_embeddings ("
            "id INTEGER PRIMARY KEY, "
            "link_id INTEGER NOT NULL UNIQUE REFERENCES links(id) ON DELETE CASCADE, "
            "user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
            "provider VARCHAR(48) DEFAULT 'local-hash' NOT NULL, "
            "text_hash VARCHAR(128) NOT NULL, "
            "vector JSON, "
            "updated_at TIMESTAMP NOT NULL"
            ")"
        )
        conn.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_link_embeddings_link_id ON link_embeddings(link_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_link_embeddings_user_id ON link_embeddings(user_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_link_embeddings_text_hash ON link_embeddings(text_hash)")
