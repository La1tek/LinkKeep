"""
LinkKeep API — Integration Tests v2.2
Run: pytest tests/ -v
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import config as app_config
from app import middleware as app_middleware
from app.database import Base, get_db
from app.main import app


# ── Fixtures ─────────────────────────────────────────

@pytest.fixture(scope="function")
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestingSession()
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def disable_rate_limit(monkeypatch):
    monkeypatch.setattr(app_config, "RATE_LIMIT_ENABLED", False)
    monkeypatch.setattr(app_middleware, "RATE_LIMIT_ENABLED", False)


@pytest.fixture
def client(db_session):
    return TestClient(app)


@pytest.fixture
def auth_user(client):
    client.post("/api/auth/register", json={"username": "testuser", "password": "testpass123"})
    resp = client.post(
        "/api/auth/login",
        data={"username": "testuser", "password": "testpass123"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def second_user(client):
    client.post("/api/auth/register", json={"username": "user2", "password": "pass2"})
    resp = client.post("/api/auth/login", data={"username": "user2", "password": "pass2"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ── Auth Tests ───────────────────────────────────────

class TestAuth:
    def test_register_success(self, client):
        resp = client.post("/api/auth/register", json={"username": "newuser", "password": "pass"})
        assert resp.status_code == 201
        data = resp.json()
        assert data["username"] == "newuser"
        assert "id" in data
        assert "created_at" in data

    def test_register_duplicate(self, client, auth_user):
        resp = client.post("/api/auth/register", json={"username": "testuser", "password": "pass"})
        assert resp.status_code == 400
        assert "already taken" in resp.json()["detail"]

    def test_login_success(self, client, auth_user):
        resp = client.post("/api/auth/login", data={"username": "testuser", "password": "testpass123"})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_wrong_password(self, client, auth_user):
        resp = client.post("/api/auth/login", data={"username": "testuser", "password": "wrong"})
        assert resp.status_code == 400

    def test_me(self, client, auth_user):
        resp = client.get("/api/auth/me", headers=auth_user)
        assert resp.status_code == 200
        assert resp.json()["username"] == "testuser"

    def test_me_unauthorized(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401

    def test_register_can_be_disabled(self, client, monkeypatch):
        monkeypatch.setattr(app_config, "ALLOW_REGISTRATION", False)
        resp = client.post("/api/auth/register", json={"username": "blocked", "password": "pass"})
        assert resp.status_code == 403

    def test_logout_revokes_current_session(self, client, auth_user):
        sessions = client.get("/api/auth/sessions", headers=auth_user)
        assert sessions.status_code == 200
        assert len(sessions.json()) == 1
        assert sessions.json()[0]["current"] is True

        logout = client.post("/api/auth/logout", headers=auth_user)
        assert logout.status_code == 204

        me = client.get("/api/auth/me", headers=auth_user)
        assert me.status_code == 401

    def test_can_revoke_session_by_id(self, client, auth_user):
        sessions = client.get("/api/auth/sessions", headers=auth_user).json()
        session_id = sessions[0]["id"]
        resp = client.delete(f"/api/auth/sessions/{session_id}", headers=auth_user)
        assert resp.status_code == 204
        me = client.get("/api/auth/me", headers=auth_user)
        assert me.status_code == 401


# ── Tab Tests ────────────────────────────────────────

class TestTabs:
    def test_create_tab(self, client, auth_user):
        resp = client.post("/api/tabs", json={"name": "Dev", "color": "#10b981"}, headers=auth_user)
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Dev"
        assert data["color"] == "#10b981"
        assert data["link_count"] == 0

    def test_list_tabs(self, client, auth_user):
        client.post("/api/tabs", json={"name": "Tab1"}, headers=auth_user)
        client.post("/api/tabs", json={"name": "Tab2"}, headers=auth_user)
        resp = client.get("/api/tabs", headers=auth_user)
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_update_tab(self, client, auth_user):
        create = client.post("/api/tabs", json={"name": "Old"}, headers=auth_user)
        tab_id = create.json()["id"]
        resp = client.put(f"/api/tabs/{tab_id}", json={"name": "New", "color": "#ef4444", "icon": "Code"}, headers=auth_user)
        assert resp.status_code == 200
        assert resp.json()["name"] == "New"
        assert resp.json()["color"] == "#ef4444"
        assert resp.json()["icon"] == "Code"

    def test_delete_tab(self, client, auth_user):
        create = client.post("/api/tabs", json={"name": "ToDelete"}, headers=auth_user)
        tab_id = create.json()["id"]
        resp = client.delete(f"/api/tabs/{tab_id}", headers=auth_user)
        assert resp.status_code == 204
        tabs = client.get("/api/tabs", headers=auth_user)
        assert len(tabs.json()) == 0

    def test_delete_tab_cascades_links(self, client, auth_user):
        tab = client.post("/api/tabs", json={"name": "T"}, headers=auth_user).json()
        client.post("/api/links", json={"title": "L", "url": "https://x.com", "tab_id": tab["id"]}, headers=auth_user)
        client.delete(f"/api/tabs/{tab['id']}", headers=auth_user)
        links = client.get("/api/links", headers=auth_user)
        assert len(links.json()) == 0

    def test_delete_tab_keep_links(self, client, auth_user):
        """v2.1: delete tab but keep links (ungrouped)"""
        tab = client.post("/api/tabs", json={"name": "T"}, headers=auth_user).json()
        client.post("/api/links", json={"title": "L", "url": "https://x.com", "tab_id": tab["id"]}, headers=auth_user)
        client.delete(f"/api/tabs/{tab['id']}?keep_links=true", headers=auth_user)
        links = client.get("/api/links", headers=auth_user)
        assert len(links.json()) == 1
        assert links.json()[0]["tab_id"] is None

    def test_tab_isolation_between_users(self, client, auth_user, second_user):
        client.post("/api/tabs", json={"name": "User1Tab"}, headers=auth_user)
        resp = client.get("/api/tabs", headers=second_user)
        assert len(resp.json()) == 0

    def test_tab_with_parent(self, client, auth_user):
        """v2.2: subfolder support"""
        parent = client.post("/api/tabs", json={"name": "Parent"}, headers=auth_user).json()
        child = client.post("/api/tabs", json={"name": "Child", "parent_id": parent["id"]}, headers=auth_user).json()
        assert child["parent_id"] == parent["id"]

    def test_cannot_create_tab_under_other_users_parent(self, client, auth_user, second_user):
        parent = client.post("/api/tabs", json={"name": "OtherParent"}, headers=second_user).json()
        resp = client.post("/api/tabs", json={"name": "Child", "parent_id": parent["id"]}, headers=auth_user)
        assert resp.status_code == 404

    def test_cannot_create_parent_cycle(self, client, auth_user):
        parent = client.post("/api/tabs", json={"name": "Parent"}, headers=auth_user).json()
        child = client.post("/api/tabs", json={"name": "Child", "parent_id": parent["id"]}, headers=auth_user).json()
        resp = client.put(f"/api/tabs/{parent['id']}", json={"parent_id": child["id"]}, headers=auth_user)
        assert resp.status_code == 400


# ── Link Tests ───────────────────────────────────────

class TestLinks:
    @pytest.fixture(autouse=True)
    def setup_tab(self, client, auth_user):
        self.tab = client.post("/api/tabs", json={"name": "Dev"}, headers=auth_user).json()

    def test_create_link(self, client, auth_user):
        resp = client.post("/api/links", json={
            "title": "GitHub", "url": "https://github.com",
            "tab_id": self.tab["id"], "tags": ["code", "git"]
        }, headers=auth_user)
        assert resp.status_code == 201
        assert resp.json()["title"] == "GitHub"
        assert resp.json()["tags"] == ["code", "git"]

    def test_create_link_no_tab(self, client, auth_user):
        resp = client.post("/api/links", json={"title": "Standalone", "url": "https://example.com"}, headers=auth_user)
        assert resp.status_code == 201
        assert resp.json()["tab_id"] is None

    def test_create_link_with_note(self, client, auth_user):
        """v2.2: link notes"""
        resp = client.post("/api/links", json={
            "title": "Note", "url": "https://x.com", "note": "Important resource"
        }, headers=auth_user)
        assert resp.status_code == 201
        assert resp.json()["note"] == "Important resource"

    def test_list_links_by_tab(self, client, auth_user):
        client.post("/api/links", json={"title": "A", "url": "https://a.com", "tab_id": self.tab["id"]}, headers=auth_user)
        client.post("/api/links", json={"title": "B", "url": "https://b.com"}, headers=auth_user)
        resp = client.get(f"/api/links?tab_id={self.tab['id']}", headers=auth_user)
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "A"

    def test_search_links(self, client, auth_user):
        client.post("/api/links", json={"title": "GitHub", "url": "https://github.com"}, headers=auth_user)
        client.post("/api/links", json={"title": "GitLab", "url": "https://gitlab.com"}, headers=auth_user)
        client.post("/api/links", json={"title": "Reddit", "url": "https://reddit.com"}, headers=auth_user)
        resp = client.get("/api/links?q=git", headers=auth_user)
        assert len(resp.json()) == 2

    def test_search_by_url(self, client, auth_user):
        """v2.2: search matches URL too"""
        client.post("/api/links", json={"title": "My Site", "url": "https://special-domain.com"}, headers=auth_user)
        resp = client.get("/api/links?q=special-domain", headers=auth_user)
        assert len(resp.json()) == 1

    def test_toggle_favorite(self, client, auth_user):
        link = client.post("/api/links", json={"title": "Fav", "url": "https://x.com"}, headers=auth_user).json()
        assert link["is_favorite"] is False
        resp = client.post(f"/api/links/{link['id']}/toggle-favorite", headers=auth_user)
        assert resp.json()["is_favorite"] is True
        resp2 = client.post(f"/api/links/{link['id']}/toggle-favorite", headers=auth_user)
        assert resp2.json()["is_favorite"] is False

    def test_filter_favorites(self, client, auth_user):
        link = client.post("/api/links", json={"title": "Star", "url": "https://x.com"}, headers=auth_user).json()
        client.post(f"/api/links/{link['id']}/toggle-favorite", headers=auth_user)
        client.post("/api/links", json={"title": "Normal", "url": "https://y.com"}, headers=auth_user)
        resp = client.get("/api/links?favorite=true", headers=auth_user)
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "Star"

    def test_update_link(self, client, auth_user):
        link = client.post("/api/links", json={"title": "Old", "url": "https://old.com"}, headers=auth_user).json()
        resp = client.put(f"/api/links/{link['id']}", json={"title": "New", "url": "https://new.com"}, headers=auth_user)
        assert resp.json()["title"] == "New"
        assert resp.json()["url"] == "https://new.com"

    def test_update_link_note(self, client, auth_user):
        """v2.2: update note"""
        link = client.post("/api/links", json={"title": "L", "url": "https://x.com"}, headers=auth_user).json()
        resp = client.put(f"/api/links/{link['id']}", json={"note": "Updated note"}, headers=auth_user)
        assert resp.json()["note"] == "Updated note"

    def test_delete_link(self, client, auth_user):
        link = client.post("/api/links", json={"title": "Del", "url": "https://x.com"}, headers=auth_user).json()
        resp = client.delete(f"/api/links/{link['id']}", headers=auth_user)
        assert resp.status_code == 204
        links = client.get("/api/links", headers=auth_user)
        assert len(links.json()) == 0

    def test_link_isolation_between_users(self, client, auth_user, second_user):
        client.post("/api/links", json={"title": "User1", "url": "https://x.com"}, headers=auth_user)
        resp = client.get("/api/links", headers=second_user)
        assert len(resp.json()) == 0

    def test_cannot_create_link_in_other_users_tab(self, client, auth_user, second_user):
        tab = client.post("/api/tabs", json={"name": "OtherTab"}, headers=second_user).json()
        resp = client.post("/api/links", json={"title": "Bad", "url": "https://x.com", "tab_id": tab["id"]}, headers=auth_user)
        assert resp.status_code == 404

    def test_cannot_update_link_to_other_users_tab(self, client, auth_user, second_user):
        link = client.post("/api/links", json={"title": "Mine", "url": "https://x.com"}, headers=auth_user).json()
        other_tab = client.post("/api/tabs", json={"name": "OtherTab"}, headers=second_user).json()
        resp = client.put(f"/api/links/{link['id']}", json={"tab_id": other_tab["id"]}, headers=auth_user)
        assert resp.status_code == 404


# ── Pin Tests (v2.2) ────────────────────────────────

class TestPinned:
    def test_toggle_pin(self, client, auth_user):
        link = client.post("/api/links", json={"title": "P", "url": "https://x.com"}, headers=auth_user).json()
        assert link["is_pinned"] is False
        resp = client.post(f"/api/links/{link['id']}/toggle-pin", headers=auth_user)
        assert resp.json()["is_pinned"] is True
        resp2 = client.post(f"/api/links/{link['id']}/toggle-pin", headers=auth_user)
        assert resp2.json()["is_pinned"] is False

    def test_filter_pinned(self, client, auth_user):
        link = client.post("/api/links", json={"title": "Pinned", "url": "https://x.com"}, headers=auth_user).json()
        client.post(f"/api/links/{link['id']}/toggle-pin", headers=auth_user)
        client.post("/api/links", json={"title": "Normal", "url": "https://y.com"}, headers=auth_user)
        resp = client.get("/api/links?pinned=true", headers=auth_user)
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "Pinned"

    def test_pinned_shown_first(self, client, auth_user):
        """Pinned links should appear before unpinned"""
        a = client.post("/api/links", json={"title": "A", "url": "https://a.com"}, headers=auth_user).json()
        client.post("/api/links", json={"title": "B", "url": "https://b.com"}, headers=auth_user).json()
        client.post(f"/api/links/{a['id']}/toggle-pin", headers=auth_user)
        resp = client.get("/api/links", headers=auth_user)
        assert resp.json()[0]["title"] == "A"


# ── Bulk Action Tests (v2.2) ────────────────────────

class TestBulk:
    def test_bulk_delete(self, client, auth_user):
        l1 = client.post("/api/links", json={"title": "L1", "url": "https://1.com"}, headers=auth_user).json()
        l2 = client.post("/api/links", json={"title": "L2", "url": "https://2.com"}, headers=auth_user).json()
        resp = client.post("/api/links/bulk", json={"link_ids": [l1["id"], l2["id"]], "action": "delete"}, headers=auth_user)
        assert resp.json()["affected"] == 2
        links = client.get("/api/links", headers=auth_user)
        assert len(links.json()) == 0

    def test_bulk_move(self, client, auth_user):
        tab = client.post("/api/tabs", json={"name": "T"}, headers=auth_user).json()
        l1 = client.post("/api/links", json={"title": "L1", "url": "https://1.com"}, headers=auth_user).json()
        l2 = client.post("/api/links", json={"title": "L2", "url": "https://2.com"}, headers=auth_user).json()
        resp = client.post("/api/links/bulk", json={"link_ids": [l1["id"], l2["id"]], "action": "move", "tab_id": tab["id"]}, headers=auth_user)
        assert resp.json()["affected"] == 2
        links = client.get(f"/api/links?tab_id={tab['id']}", headers=auth_user)
        assert len(links.json()) == 2

    def test_bulk_move_rejects_other_users_tab(self, client, auth_user, second_user):
        other_tab = client.post("/api/tabs", json={"name": "Other"}, headers=second_user).json()
        link = client.post("/api/links", json={"title": "L", "url": "https://1.com"}, headers=auth_user).json()
        resp = client.post("/api/links/bulk", json={"link_ids": [link["id"]], "action": "move", "tab_id": other_tab["id"]}, headers=auth_user)
        assert resp.status_code == 404

    def test_bulk_pin(self, client, auth_user):
        l1 = client.post("/api/links", json={"title": "L1", "url": "https://1.com"}, headers=auth_user).json()
        l2 = client.post("/api/links", json={"title": "L2", "url": "https://2.com"}, headers=auth_user).json()
        client.post("/api/links/bulk", json={"link_ids": [l1["id"], l2["id"]], "action": "pin"}, headers=auth_user)
        pinned = client.get("/api/links?pinned=true", headers=auth_user)
        assert len(pinned.json()) == 2

    def test_bulk_tags_read_and_priority(self, client, auth_user):
        link = client.post("/api/links", json={"title": "L", "url": "https://1.com"}, headers=auth_user).json()
        tag = client.post("/api/links/bulk", json={"link_ids": [link["id"]], "action": "add_tags", "tags": ["readlater"]}, headers=auth_user)
        assert tag.status_code == 200
        read = client.post("/api/links/bulk", json={"link_ids": [link["id"]], "action": "read"}, headers=auth_user)
        assert read.json()["affected"] == 1
        priority = client.post("/api/links/bulk", json={"link_ids": [link["id"]], "action": "set_priority", "priority": "high"}, headers=auth_user)
        assert priority.status_code == 200
        links = client.get("/api/links?read=true&priority=high", headers=auth_user).json()
        assert len(links) == 1
        assert links[0]["is_read"] is True
        assert "readlater" in links[0]["tags"]
        assert links[0]["priority"] == "high"


class TestProductWorkflows:
    def test_soft_delete_restore_and_destroy(self, client, auth_user):
        link = client.post("/api/links", json={"title": "Trash me", "url": "https://trash.example.com"}, headers=auth_user).json()
        deleted = client.delete(f"/api/links/{link['id']}", headers=auth_user)
        assert deleted.status_code == 204
        assert client.get("/api/links", headers=auth_user).json() == []

        trash = client.get("/api/links/trash", headers=auth_user)
        assert trash.status_code == 200
        assert trash.json()[0]["title"] == "Trash me"
        assert trash.json()[0]["deleted_at"] is not None

        restored = client.post(f"/api/links/{link['id']}/restore", headers=auth_user)
        assert restored.status_code == 200
        assert restored.json()["deleted_at"] is None
        assert len(client.get("/api/links", headers=auth_user).json()) == 1

        client.delete(f"/api/links/{link['id']}", headers=auth_user)
        destroyed = client.delete(f"/api/links/{link['id']}/destroy", headers=auth_user)
        assert destroyed.status_code == 204
        assert client.get("/api/links/trash", headers=auth_user).json() == []

    def test_link_detail_history_and_attachment(self, client, auth_user):
        link = client.post("/api/links", json={"title": "Detail", "url": "https://detail.example.com"}, headers=auth_user).json()
        client.put(f"/api/links/{link['id']}", json={"note": "Important"}, headers=auth_user)
        attachment = client.post(
            f"/api/links/{link['id']}/attachments",
            json={"filename": "note.txt", "content_type": "text/plain", "data_url": "data:text/plain;base64,SGVsbG8="},
            headers=auth_user,
        )
        assert attachment.status_code == 201

        detail = client.get(f"/api/links/{link['id']}", headers=auth_user)
        assert detail.status_code == 200
        data = detail.json()
        assert data["link"]["note"] == "Important"
        assert [item["action"] for item in data["history"]][:2] == ["attachment_added", "updated"]
        assert data["attachments"][0]["filename"] == "note.txt"

    def test_import_preview_and_api_token_auth(self, client, auth_user):
        client.post("/api/links", json={"title": "Existing", "url": "https://example.com/?utm_source=x"}, headers=auth_user)
        payload = {
            "links": [
                {"title": "Duplicate", "url": "https://www.example.com/"},
                {"title": "New", "url": "https://new.example.com"},
                {"title": "Bad", "url": "ftp://bad.example.com"},
            ]
        }
        preview = client.post("/api/settings/import/preview?mode=merge", json=payload, headers=auth_user)
        assert preview.status_code == 200
        assert preview.json()["links_existing"] == 1
        assert preview.json()["links_new"] == 1
        assert preview.json()["links_invalid"] == 1

        token_resp = client.post("/api/settings/api-tokens", json={"name": "Extension"}, headers=auth_user)
        assert token_resp.status_code == 201
        token = token_resp.json()["token"]
        me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["username"] == "testuser"


# ── Ungrouped Filter Tests (v2.2) ───────────────────

class TestUngrouped:
    def test_ungrouped_filter(self, client, auth_user):
        tab = client.post("/api/tabs", json={"name": "T"}, headers=auth_user).json()
        client.post("/api/links", json={"title": "Grouped", "url": "https://x.com", "tab_id": tab["id"]}, headers=auth_user)
        client.post("/api/links", json={"title": "Ungrouped", "url": "https://y.com"}, headers=auth_user)
        resp = client.get("/api/links?ungrouped=true", headers=auth_user)
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "Ungrouped"


# ── Stats Tests ──────────────────────────────────────

class TestStats:
    def test_empty_stats(self, client, auth_user):
        resp = client.get("/api/stats", headers=auth_user)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_links"] == 0
        assert data["total_tabs"] == 0
        assert data["total_favorites"] == 0
        assert data["total_pinned"] == 0

    def test_stats_with_data(self, client, auth_user):
        tab = client.post("/api/tabs", json={"name": "T"}, headers=auth_user).json()
        link = client.post("/api/links", json={"title": "L", "url": "https://x.com", "tab_id": tab["id"]}, headers=auth_user).json()
        client.post(f"/api/links/{link['id']}/toggle-favorite", headers=auth_user)
        client.post(f"/api/links/{link['id']}/toggle-pin", headers=auth_user)
        resp = client.get("/api/stats", headers=auth_user)
        data = resp.json()
        assert data["total_links"] == 1
        assert data["total_tabs"] == 1
        assert data["total_favorites"] == 1
        assert data["total_pinned"] == 1
        assert len(data["recent_links"]) == 1


# ── Health Tests ─────────────────────────────────────

class TestHealth:
    def test_health(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "version" in data
        assert "bot" in data

    def test_ready(self, client):
        resp = client.get("/api/ready")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ready"

    def test_security_headers(self, client):
        resp = client.get("/api/health")
        assert resp.headers["X-Content-Type-Options"] == "nosniff"
        assert resp.headers["X-Frame-Options"] == "DENY"
        assert resp.headers["X-Request-ID"]


class TestSettings:
    def test_change_username_keeps_current_token_valid(self, client, auth_user):
        resp = client.put("/api/settings/username", json={"new_username": "renamed"}, headers=auth_user)
        assert resp.status_code == 200
        me = client.get("/api/auth/me", headers=auth_user)
        assert me.status_code == 200
        assert me.json()["username"] == "renamed"

    def test_export_html_escapes_user_content(self, client, auth_user):
        client.post("/api/tabs", json={"name": "<script>alert(1)</script>"}, headers=auth_user)
        client.post("/api/links", json={"title": "<b>x</b>", "url": "https://x.com/?a=<b>"}, headers=auth_user)
        resp = client.get("/api/settings/export-html", headers=auth_user)
        assert resp.status_code == 200
        assert "<script>alert(1)</script>" not in resp.text
        assert "&lt;script&gt;alert(1)&lt;/script&gt;" in resp.text
        assert "&lt;b&gt;x&lt;/b&gt;" in resp.text

    def test_create_bot_token_returns_start_command(self, client, auth_user):
        resp = client.post("/api/settings/bot-token", headers=auth_user)
        assert resp.status_code == 200
        data = resp.json()
        assert data["token"]
        assert data["command"] == f"/start {data['token']}"

    def test_import_merge_preserves_existing_link_data(self, client, auth_user):
        client.post(
            "/api/links",
            json={"title": "Existing", "url": "https://example.com", "tags": ["old"], "note": "old note"},
            headers=auth_user,
        )
        payload = {
            "links": [
                {
                    "title": "Imported",
                    "url": "https://www.example.com/",
                    "tags": ["new"],
                    "note": "new note",
                    "is_favorite": True,
                }
            ]
        }
        resp = client.post("/api/settings/import?mode=merge", json=payload, headers=auth_user)
        assert resp.status_code == 200
        assert resp.json()["merged"] == 1

        links = client.get("/api/links", headers=auth_user).json()
        assert len(links) == 1
        assert links[0]["title"] == "Existing"
        assert set(links[0]["tags"]) == {"old", "new"}
        assert "old note" in links[0]["note"]
        assert "new note" in links[0]["note"]
        assert links[0]["is_favorite"] is True

    def test_import_skip_and_replace_modes(self, client, auth_user):
        client.post("/api/links", json={"title": "Existing", "url": "https://example.com"}, headers=auth_user)
        payload = {"links": [{"title": "Skipped", "url": "https://www.example.com/"}]}

        skip = client.post("/api/settings/import?mode=skip", json=payload, headers=auth_user)
        assert skip.status_code == 200
        assert skip.json()["skipped"] == 1
        assert len(client.get("/api/links", headers=auth_user).json()) == 1

        replace_payload = {"links": [{"title": "Replacement", "url": "https://replacement.com"}]}
        replace = client.post("/api/settings/restore?mode=replace", json=replace_payload, headers=auth_user)
        assert replace.status_code == 200
        links = client.get("/api/links", headers=auth_user).json()
        assert len(links) == 1
        assert links[0]["title"] == "Replacement"

    def test_tag_management(self, client, auth_user):
        client.post("/api/links", json={"title": "A", "url": "https://a.com", "tags": ["docs"]}, headers=auth_user)
        client.post("/api/links", json={"title": "B", "url": "https://b.com", "tags": ["docs", "dev"]}, headers=auth_user)

        tags = client.get("/api/tags", headers=auth_user)
        assert tags.status_code == 200
        assert {"name": "docs", "count": 2} in tags.json()["tags"]

        rename = client.put("/api/tags/docs", json={"new_name": "reference"}, headers=auth_user)
        assert rename.status_code == 200
        links = client.get("/api/links", headers=auth_user).json()
        assert sum("reference" in link["tags"] for link in links) == 2

        delete = client.delete("/api/tags/reference", headers=auth_user)
        assert delete.status_code == 200
        tags = client.get("/api/tags", headers=auth_user).json()["tags"]
        assert all(tag["name"] != "reference" for tag in tags)

    def test_snapshots_restore_data(self, client, auth_user):
        link = client.post("/api/links", json={"title": "Saved", "url": "https://saved.com"}, headers=auth_user).json()
        snapshot = client.post("/api/settings/snapshots", json={"name": "Before delete"}, headers=auth_user)
        assert snapshot.status_code == 201

        client.delete(f"/api/links/{link['id']}", headers=auth_user)
        assert client.get("/api/links", headers=auth_user).json() == []

        restore = client.post(f"/api/settings/snapshots/{snapshot.json()['id']}/restore?mode=replace", headers=auth_user)
        assert restore.status_code == 200
        links = client.get("/api/links", headers=auth_user).json()
        assert len(links) == 1
        assert links[0]["title"] == "Saved"

    def test_import_file_bookmarks_html(self, client, auth_user):
        html = '<!DOCTYPE NETSCAPE-Bookmark-file-1><a href="https://docs.example.com">Docs</a>'
        resp = client.post(
            "/api/settings/import-file?source=bookmarks_html&mode=merge",
            files={"file": ("bookmarks.html", html, "text/html")},
            headers=auth_user,
        )
        assert resp.status_code == 200
        assert resp.json()["links"] == 1
        links = client.get("/api/links", headers=auth_user).json()
        assert links[0]["url"] == "https://docs.example.com"


class TestDuplicateMerge:
    def test_merge_duplicates_preserves_source_data(self, client, auth_user):
        target = client.post(
            "/api/links",
            json={"title": "Target", "url": "https://example.com", "tags": ["target"], "note": "target note"},
            headers=auth_user,
        ).json()
        source = client.post(
            "/api/links",
            json={
                "title": "Source",
                "url": "https://www.example.com/",
                "tags": ["source"],
                "note": "source note",
                "is_favorite": True,
                "is_pinned": True,
                "description": "source description",
            },
            headers=auth_user,
        ).json()

        resp = client.post(
            "/api/links/duplicates/merge",
            json={"target_id": target["id"], "source_ids": [source["id"]]},
            headers=auth_user,
        )
        assert resp.status_code == 200
        assert resp.json()["merged"] == 1

        links = client.get("/api/links", headers=auth_user).json()
        assert len(links) == 1
        merged = links[0]
        assert merged["id"] == target["id"]
        assert set(merged["tags"]) == {"target", "source"}
        assert "target note" in merged["note"]
        assert "source note" in merged["note"]
        assert merged["is_favorite"] is True
        assert merged["is_pinned"] is True
        assert merged["description"] == "source description"


class TestProductFeatures:
    def test_jobs_run_now_backup_snapshot(self, client, auth_user):
        client.post("/api/links", json={"title": "Job", "url": "https://job.com"}, headers=auth_user)
        resp = client.post("/api/jobs", json={"type": "backup_snapshot", "payload": {"name": "Job snapshot"}, "run_now": True}, headers=auth_user)
        assert resp.status_code == 201
        assert resp.json()["status"] == "succeeded"
        snapshots = client.get("/api/settings/snapshots", headers=auth_user).json()["snapshots"]
        assert len(snapshots) == 1

    def test_fulltext_search(self, client, auth_user):
        client.post(
            "/api/links",
            json={"title": "FastAPI Guide", "url": "https://fastapi.tiangolo.com", "note": "python backend docs"},
            headers=auth_user,
        )
        reindex = client.post("/api/search/reindex", headers=auth_user)
        assert reindex.status_code == 200
        resp = client.get("/api/search/fulltext?q=python docs", headers=auth_user)
        assert resp.status_code == 200
        assert resp.json()["count"] == 1

    def test_public_share(self, client, auth_user):
        client.post("/api/links", json={"title": "Shared", "url": "https://shared.com"}, headers=auth_user)
        share = client.post("/api/shares", json={"title": "Public collection"}, headers=auth_user)
        assert share.status_code == 201
        token = share.json()["token"]
        public = client.get(f"/api/public/shares/{token}")
        assert public.status_code == 200
        assert public.json()["title"] == "Public collection"
        assert public.json()["links"][0]["title"] == "Shared"

    def test_recommendations_and_apply_tags(self, client, auth_user):
        client.post("/api/links", json={"title": "GitHub Repo", "url": "https://github.com/org/repo"}, headers=auth_user)
        resp = client.get("/api/recommendations", headers=auth_user)
        assert resp.status_code == 200
        assert resp.json()["autotags"][0]["suggested_tags"] == ["code"]
        apply = client.post("/api/recommendations/apply-tags", headers=auth_user)
        assert apply.status_code == 200
        links = client.get("/api/links", headers=auth_user).json()
        assert links[0]["tags"] == ["code"]


class TestArchiveSearchCollabAndLocks:
    def test_archive_contract_and_search_operators(self, client, auth_user, monkeypatch):
        from app.models import LinkArchive
        from app.routers import archives as archive_router

        async def fake_archive(db, link):
            archive = LinkArchive(
                link_id=link.id,
                user_id=link.user_id,
                status="succeeded",
                source_url=link.url,
                html_snapshot="<html>python archive</html>",
                readable_text="python archive text",
                screenshot_data_url="data:image/svg+xml;base64,PHN2Zy8+",
                pdf_data_url="data:application/pdf;base64,JVBERi0xLjQK",
            )
            link.content = archive.readable_text
            db.add(archive)
            db.commit()
            db.refresh(archive)
            return archive

        monkeypatch.setattr(archive_router, "create_link_archive", fake_archive)
        link = client.post(
            "/api/links",
            json={"title": "Archive me", "url": "https://docs.example.com/page", "tags": ["docs"], "note": "keep"},
            headers=auth_user,
        ).json()

        archive = client.post(f"/api/links/{link['id']}/archive", headers=auth_user)
        assert archive.status_code == 201
        assert archive.json()["status"] == "succeeded"
        assert archive.json()["has_html"] is True
        assert archive.json()["has_screenshot"] is True
        assert archive.json()["has_pdf"] is True

        payload = client.get(f"/api/archives/{archive.json()['id']}", headers=auth_user)
        assert payload.status_code == 200
        assert "python archive text" in payload.json()["readable_text"]

        reindex = client.post("/api/search/reindex", headers=auth_user)
        assert reindex.status_code == 200
        results = client.get('/api/search/fulltext?q=python tag:docs site:docs.example.com has:note has:archive type:article', headers=auth_user)
        assert results.status_code == 200
        assert results.json()["count"] == 1

    def test_saved_search_and_smart_collection(self, client, auth_user):
        saved = client.post("/api/search/saved", json={"name": "Docs", "query": "tag:docs"}, headers=auth_user)
        assert saved.status_code == 201
        smart = client.post("/api/search/smart", json={"name": "Dead links", "query": "is:dead", "color": "#ef4444"}, headers=auth_user)
        assert smart.status_code == 201
        assert client.get("/api/search/saved", headers=auth_user).json()["saved_searches"][0]["name"] == "Docs"
        assert client.get("/api/search/smart", headers=auth_user).json()["smart_collections"][0]["name"] == "Dead links"

    def test_locked_folder_blocks_tree_and_content_until_unlock(self, client, auth_user):
        tab = client.post("/api/tabs", json={"name": "Private"}, headers=auth_user).json()
        child = client.post("/api/tabs", json={"name": "Child", "parent_id": tab["id"]}, headers=auth_user).json()
        client.post("/api/links", json={"title": "Secret", "url": "https://secret.com", "tab_id": child["id"]}, headers=auth_user)

        invalid_lock = client.post(f"/api/tabs/{tab['id']}/lock", json={"password": "folderpass"}, headers=auth_user)
        assert invalid_lock.status_code == 422
        lock = client.post(f"/api/tabs/{tab['id']}/lock", json={"password": "1234"}, headers=auth_user)
        assert lock.status_code == 200

        tabs = client.get("/api/tabs", headers=auth_user).json()
        assert [item["name"] for item in tabs] == ["Private"]
        assert tabs[0]["is_locked"] is True
        assert tabs[0]["child_count"] == 0

        blocked = client.get(f"/api/links?tab_id={child['id']}", headers=auth_user)
        assert blocked.status_code == 403
        assert client.get("/api/links", headers=auth_user).json() == []

        bad_unlock = client.post(f"/api/tabs/{tab['id']}/unlock", json={"password": "0000"}, headers=auth_user)
        assert bad_unlock.status_code == 403
        unlock = client.post(f"/api/tabs/{tab['id']}/unlock", json={"password": "1234"}, headers=auth_user)
        assert unlock.status_code == 200
        headers = {**auth_user, "X-LinkKeep-Folder-Unlocks": unlock.json()["unlock_token"]}
        unlocked_tabs = client.get("/api/tabs", headers=headers).json()
        assert {item["name"] for item in unlocked_tabs} == {"Private", "Child"}
        links = client.get(f"/api/links?tab_id={child['id']}", headers=headers)
        assert links.status_code == 200
        assert links.json()[0]["title"] == "Secret"

    def test_share_invites_comments_and_public_profile(self, client, auth_user):
        client.post("/api/links", json={"title": "Shared", "url": "https://shared.com"}, headers=auth_user)
        share = client.post("/api/shares", json={"title": "Public collection", "role": "commenter", "public_profile": True}, headers=auth_user).json()

        invite = client.post(f"/api/shares/{share['id']}/invites", json={"email": "friend@example.com", "role": "commenter"}, headers=auth_user)
        assert invite.status_code == 201
        assert invite.json()["role"] == "commenter"

        comment = client.post(f"/api/shares/{share['id']}/comments", json={"body": "Looks useful"}, headers=auth_user)
        assert comment.status_code == 201
        assert comment.json()["body"] == "Looks useful"

        public = client.get(f"/api/public/shares/{share['token']}")
        assert public.status_code == 200
        assert public.json()["role"] == "commenter"
        assert public.json()["comments"][0]["body"] == "Looks useful"

        profile = client.get("/api/public/profiles/testuser")
        assert profile.status_code == 200
        assert profile.json()["shares"][0]["title"] == "Public collection"

    def test_admin_overview(self, client, auth_user, monkeypatch):
        monkeypatch.setattr(app_config, "ADMIN_USERNAMES", {"testuser"})
        resp = client.get("/api/admin/overview", headers=auth_user)
        assert resp.status_code == 200
        assert resp.json()["users"] == 1


class TestMetadataSecurity:
    def test_metadata_rejects_localhost_url(self, client, auth_user):
        resp = client.post("/api/metadata", json={"url": "http://127.0.0.1:8000/private"}, headers=auth_user)
        assert resp.status_code == 400
