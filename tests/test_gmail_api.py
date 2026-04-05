"""Gmail API smoke tests (no live Google calls)."""

from backend.routers import gmail as gmail_router
from urllib.parse import urlparse


def test_validated_browser_redirect_localhost_only():
    default = "http://localhost:5173/customize?gmail=connected"
    assert gmail_router._validated_browser_redirect(
        "http://127.0.0.1:9999/callback", default,
    ).startswith("http://127.0.0.1:9999")
    assert gmail_router._validated_browser_redirect(
        "https://evil.example/phish", default,
    ) == default
    assert gmail_router._validated_browser_redirect(
        "javascript:alert(1)", default,
    ) == default


def test_gmail_status_without_client_id(api_client, monkeypatch):
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_ID", raising=False)
    r = api_client.get("/api/gmail/status")
    assert r.status_code == 200
    j = r.json()
    assert j["configured"] is False
    assert j["connected"] is False


def test_gmail_status_disconnected(api_client, monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "test.apps.googleusercontent.com")
    r = api_client.get("/api/gmail/status")
    assert r.status_code == 200
    j = r.json()
    assert j["configured"] is True
    assert j["connected"] is False
    assert j.get("last_sync") is None


def test_gmail_auth_start_requires_client(api_client, monkeypatch):
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_ID", raising=False)
    r = api_client.post("/api/gmail/auth/start")
    assert r.status_code == 503


def test_gmail_auth_start_returns_url(api_client, monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "cid.apps.googleusercontent.com")
    r = api_client.post("/api/gmail/auth/start")
    assert r.status_code == 200
    j = r.json()
    assert "auth_url" in j
    parsed = urlparse(j["auth_url"])
    assert parsed.scheme == "https"
    assert parsed.hostname == "accounts.google.com"
    assert "code_challenge=" in j["auth_url"]
