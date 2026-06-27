"""
LinkKeep API — Integration Tests v2.2
Run: pytest tests/ -v
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

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

    def test_bulk_pin(self, client, auth_user):
        l1 = client.post("/api/links", json={"title": "L1", "url": "https://1.com"}, headers=auth_user).json()
        l2 = client.post("/api/links", json={"title": "L2", "url": "https://2.com"}, headers=auth_user).json()
        client.post("/api/links/bulk", json={"link_ids": [l1["id"], l2["id"]], "action": "pin"}, headers=auth_user)
        pinned = client.get("/api/links?pinned=true", headers=auth_user)
        assert len(pinned.json()) == 2


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
