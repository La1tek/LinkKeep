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
