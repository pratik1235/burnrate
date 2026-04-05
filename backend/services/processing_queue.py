"""Concurrency-limited statement processing queue.

Shared by both the bulk upload endpoint and the folder watcher so that
at most MAX_CONCURRENT files are being parsed at any given time.
"""

import logging
import time
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Callable, Dict, Optional

from backend.models.database import SessionLocal

logger = logging.getLogger(__name__)

MAX_CONCURRENT = 10
_MAX_RETRIES = 3

_executor = ThreadPoolExecutor(max_workers=MAX_CONCURRENT, thread_name_prefix="stmt")


def _process_one(
    pdf_path: str,
    bank: Optional[str],
    manual_password: Optional[str],
    db_session_factory: Optional[Callable],
    source: str = "CC",
) -> Dict:
    """Run process_statement in a worker thread with its own DB session.

    Retries up to _MAX_RETRIES times on transient SQLite lock errors.
    """
    from backend.services.statement_processor import process_statement

    factory = db_session_factory or SessionLocal
    for attempt in range(1, _MAX_RETRIES + 1):
        session = factory()
        try:
            result = process_statement(
                pdf_path=pdf_path,
                bank=bank,
                db_session=session,
                manual_password=manual_password,
                source=source,
            )
            if (
                result.get("status") == "error"
                and "database is locked" in result.get("message", "")
                and attempt < _MAX_RETRIES
            ):
                logger.warning(
                    "Database locked processing %s (attempt %d/%d), retrying...",
                    pdf_path, attempt, _MAX_RETRIES,
                )
                time.sleep(0.5 * attempt)
                continue
            return result
        finally:
            session.close()
    return {"status": "error", "message": "Exhausted retries", "count": 0}


def submit(
    pdf_path: str,
    bank: Optional[str] = None,
    manual_password: Optional[str] = None,
    db_session_factory: Optional[Callable] = None,
    source: str = "CC",
) -> Future:
    """Submit a file for processing. Returns a Future so callers can
    optionally wait for and inspect the result."""
    return _executor.submit(
        _process_one, pdf_path, bank, manual_password, db_session_factory, source,
    )


def shutdown(wait: bool = True) -> None:
    """Gracefully shut down the worker pool."""
    _executor.shutdown(wait=wait)
