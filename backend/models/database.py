"""SQLAlchemy database setup."""

import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

_env_data_dir = os.environ.get("BURNRATE_DATA_DIR")
if _env_data_dir:
    DATA_DIR = Path(_env_data_dir).expanduser()
elif getattr(sys, "frozen", False):
    # Running as a PyInstaller bundle — use platform-standard data dirs
    try:
        from platformdirs import user_data_path

        DATA_DIR = user_data_path("burnrate", ensure_exists=True)
    except ImportError:
        DATA_DIR = Path.home() / ".burnrate"
else:
    # Running from source — use the project-local data directory
    DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR = DATA_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite:///{DATA_DIR / 'tuesday.db'}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables and ensure data directory exists."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    from backend.models import models  # noqa: F401 - imports models for table creation
    Base.metadata.create_all(bind=engine)
