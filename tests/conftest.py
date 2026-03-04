"""Shared fixtures for burnrate integration tests.

Key principles:
  - Every test run uses an isolated temporary SQLite database
  - The main production database is never touched
  - A real FastAPI TestClient is used for backend API tests
  - A live uvicorn server is spun up for Playwright browser tests
"""

import os
import shutil
import tempfile
import threading
import time
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

# ---------------------------------------------------------------------------
# 1. Patch DATA_DIR *before* importing any backend modules so every module
#    picks up the temporary database instead of the production one.
# ---------------------------------------------------------------------------
_tmpdir = tempfile.mkdtemp(prefix="burnrate_test_")
os.environ["BURNRATE_DATA_DIR"] = _tmpdir

FIXTURES_DIR = Path(__file__).parent / "fixtures"
PROJECT_ROOT = Path(__file__).parent.parent

from backend.models.database import Base, DATA_DIR, UPLOADS_DIR  # noqa: E402
from backend.main import app, seed_categories  # noqa: E402
from backend.models.models import Settings, Card  # noqa: E402


def _make_session_factory(db_path: Path):
    url = f"sqlite:///{db_path}"
    eng = create_engine(url, connect_args={"check_same_thread": False})

    @event.listens_for(eng, "connect")
    def _pragma(dbapi_conn, _rec):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=5000")
        cur.close()

    return sessionmaker(autocommit=False, autoflush=False, bind=eng), eng


@pytest.fixture(scope="session")
def test_data_dir():
    """Path to the temporary data directory used for this test run."""
    return Path(_tmpdir)


@pytest.fixture(scope="session")
def db_session_factory():
    """Create all tables and seed data in the test database. Returns a
    session factory that tests can use to inspect DB state directly."""
    from backend.models.database import engine, SessionLocal, init_db

    init_db()

    db = SessionLocal()
    try:
        seed_categories(db)
    finally:
        db.close()

    return SessionLocal


@pytest.fixture()
def db(db_session_factory):
    """Provide a per-test DB session."""
    session = db_session_factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="session")
def setup_profile(db_session_factory):
    """Insert a test user profile (required before statement processing)."""
    db = db_session_factory()
    existing = db.query(Settings).first()
    if not existing:
        db.add(Settings(
            name="Pratik Prakash",
            dob_day="09",
            dob_month="02",
            dob_year="1999",
        ))
        db.commit()
    db.close()


@pytest.fixture(scope="session")
def setup_cards(db_session_factory, setup_profile):
    """Register the three cards used in test fixtures."""
    db = db_session_factory()
    cards_to_add = [
        ("hdfc", "8087"),
        ("axis", "9735"),
        ("icici", "0000"),
    ]
    for bank, last4 in cards_to_add:
        existing = db.query(Card).filter(Card.bank == bank, Card.last4 == last4).first()
        if not existing:
            db.add(Card(bank=bank, last4=last4))
    db.commit()
    db.close()


@pytest.fixture(scope="session")
def api_client(db_session_factory, setup_cards):
    """FastAPI TestClient with all setup done."""
    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        yield client


@pytest.fixture(scope="session")
def live_server(db_session_factory, setup_cards):
    """Start a live uvicorn server for Playwright tests.
    Returns the base URL (e.g. http://localhost:8765)."""
    import uvicorn

    port = 8765
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    # Wait for server to be ready
    import urllib.request
    for _ in range(30):
        try:
            urllib.request.urlopen(f"http://localhost:{port}/api/settings")
            break
        except Exception:
            time.sleep(0.5)

    yield f"http://localhost:{port}"


@pytest.fixture(scope="session")
def browser_context():
    """Shared Playwright browser context."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        yield context
        context.close()
        browser.close()


@pytest.fixture()
def page(browser_context):
    """Fresh Playwright page per test."""
    p = browser_context.new_page()
    yield p
    p.close()


def pytest_sessionfinish(session, exitstatus):
    """Clean up the temporary data directory after all tests."""
    try:
        shutil.rmtree(_tmpdir, ignore_errors=True)
    except Exception:
        pass
