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
    # Allow other threads (background sync, API) to wait on writers longer than default.
    cursor.execute("PRAGMA busy_timeout=30000")
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


def _run_migrations(engine_ref) -> None:
    """Add columns that were introduced after the initial schema.

    SQLAlchemy's ``create_all`` only creates missing *tables*; it won't
    ALTER existing tables to add new columns.  This function inspects
    the live schema and issues ALTER TABLE statements for any columns
    that are defined in the models but absent from the database.
    """
    from sqlalchemy import inspect as sa_inspect, text

    inspector = sa_inspect(engine_ref)

    migrations: list[tuple[str, str, str]] = [
        ("statements", "source", "VARCHAR(4) NOT NULL DEFAULT 'CC'"),
        ("statements", "status", "VARCHAR(20) NOT NULL DEFAULT 'success'"),
        ("transactions", "source", "VARCHAR(4) NOT NULL DEFAULT 'CC'"),
        ("settings", "last_gmail_sync", "DATETIME"),
        ("transactions", "currency", "VARCHAR(3) NOT NULL DEFAULT 'INR'"),
        ("statements", "currency", "VARCHAR(3) NOT NULL DEFAULT 'INR'"),
        ("settings", "display_currency", "VARCHAR(3)"),
        ("cards", "template_id", "VARCHAR(100)"),
        ("statements", "status_message", "TEXT"),
        ("statements", "original_upload_path", "VARCHAR(2048)"),
        ("settings", "llm_provider", "VARCHAR(20)"),
        ("settings", "llm_model", "VARCHAR(100)"),
        ("statements", "payment_due_date", "DATE"),
        ("cards", "manual_next_due_date", "DATE"),
        ("cards", "manual_next_due_amount", "FLOAT"),
        ("cards", "manual_due_acknowledged_for", "DATE"),
        ("settings", "payment_reminder_last_auto_shown", "VARCHAR(10)"),
        ("statements", "parse_failed", "INTEGER NOT NULL DEFAULT 0"),
        ("transactions", "is_manually_categorized", "INTEGER NOT NULL DEFAULT 0"),
        ("statements", "note", "TEXT"),
    ]

    with engine_ref.connect() as conn:
        for table, column, col_def in migrations:
            # Re-inspect to avoid stale cache when adding multiple columns to the same table
            inspector = sa_inspect(engine_ref)
            if table not in inspector.get_table_names():
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column not in existing:
                conn.execute(text(
                    f"ALTER TABLE {table} ADD COLUMN {column} {col_def}"
                ))
                conn.commit()
                
                # Backfill parse_failed if we just added it
                if table == "statements" and column == "parse_failed":
                    conn.execute(text(
                        "UPDATE statements SET parse_failed = CASE WHEN status = 'parse_error' "
                        "THEN 1 ELSE 0 END"
                    ))
                    conn.commit()

        if "statements" in inspector.get_table_names():
            existing_indexes = {idx["name"] for idx in inspector.get_indexes("statements")}
            if "uq_statement_hash_card" not in existing_indexes:
                try:
                    # SQLite treats NULL values as distinct, so this works even if card_last4 is NULL
                    conn.execute(text(
                        "CREATE UNIQUE INDEX uq_statement_hash_card ON statements(file_hash, card_last4)"
                    ))
                    conn.commit()
                except Exception as e:
                    print(f"Warning: Could not create unique index uq_statement_hash_card: {e}")

        if "cards" in inspector.get_table_names():
            existing_indexes = {idx["name"] for idx in inspector.get_indexes("cards")}
            if "uq_card_bank_last4" not in existing_indexes:
                try:
                    conn.execute(text(
                        "CREATE UNIQUE INDEX uq_card_bank_last4 ON cards(bank, last4)"
                    ))
                    conn.commit()
                except Exception as e:
                    print(f"Warning: Could not create unique index uq_card_bank_last4: {e}")

        if "transaction_tags" in inspector.get_table_names():
            existing_cols = {c["name"] for c in inspector.get_columns("transaction_tags")}
            if "tag" in existing_cols:
                try:
                    conn.execute(text('''
                        INSERT OR IGNORE INTO tag_definitions (id, name, created_at)
                        SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))), tag, CURRENT_TIMESTAMP 
                        FROM transaction_tags 
                        GROUP BY tag
                    '''))
                    
                    conn.execute(text('''
                        CREATE TABLE transaction_tags_new (
                            id VARCHAR(36) NOT NULL,
                            transaction_id VARCHAR(36) NOT NULL,
                            tag_id VARCHAR(36) NOT NULL,
                            created_at DATETIME,
                            PRIMARY KEY (id),
                            FOREIGN KEY(transaction_id) REFERENCES transactions (id) ON DELETE CASCADE,
                            FOREIGN KEY(tag_id) REFERENCES tag_definitions (id) ON DELETE CASCADE
                        )
                    '''))
                    
                    conn.execute(text('''
                        INSERT INTO transaction_tags_new (id, transaction_id, tag_id, created_at)
                        SELECT tt.id, tt.transaction_id, td.id, tt.created_at
                        FROM transaction_tags tt
                        JOIN tag_definitions td ON tt.tag = td.name
                    '''))
                    
                    conn.execute(text("DROP TABLE transaction_tags"))
                    conn.execute(text("ALTER TABLE transaction_tags_new RENAME TO transaction_tags"))
                    conn.commit()
                except Exception as e:
                    print(f"Warning: Could not migrate transaction_tags to use tag_id: {e}")


def init_db() -> None:
    """Create all tables and ensure data directory exists."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    from backend.models import models  # noqa: F401 - imports models for table creation
    Base.metadata.create_all(bind=engine)
    _run_migrations(engine)
