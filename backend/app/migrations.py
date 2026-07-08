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
