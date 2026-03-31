"""Folder watcher for auto-importing new statement PDFs.

Uses the shared processing_queue so that at most 10 files are
parsed concurrently, regardless of how many arrive at once.
On startup, performs an initial scan of existing PDFs so that
files placed in the watch folder before the server starts are
also processed.
"""

import logging
import threading
import time
from pathlib import Path
from typing import Callable, Optional

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from backend.services import processing_queue

logger = logging.getLogger(__name__)

_watcher_observer: Optional[Observer] = None


def _log_processing_result(db_session_factory: Callable, file_name: str, result: dict) -> None:
    """Persist a processing result for frontend polling."""
    from backend.models.models import ProcessingLog

    db = db_session_factory()
    try:
        log = ProcessingLog(
            file_name=file_name,
            status=result.get("status", "error"),
            message=result.get("message", ""),
            bank=result.get("bank"),
            transaction_count=result.get("count", 0),
        )
        db.add(log)
        db.commit()
    except Exception:
        logger.exception("Failed to write processing log for %s", file_name)
        db.rollback()
    finally:
        db.close()


def _wait_for_file_stable(path: Path, timeout: float = 15.0, interval: float = 0.5) -> bool:
    """Wait until the file size stops changing, indicating the write is complete."""
    last_size = -1
    stable_start = time.monotonic()
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            size = path.stat().st_size
            if size == last_size and size > 0:
                if time.monotonic() - stable_start >= 1.5:
                    return True
            else:
                last_size = size
                stable_start = time.monotonic()
        except OSError:
            pass
        time.sleep(interval)
    return False


class StatementWatchHandler(FileSystemEventHandler):
    """Handler for new PDF/CSV statement files in watch directory."""

    ALLOWED_EXTENSIONS = {".pdf", ".csv"}

    def __init__(self, db_session_factory: Callable):
        super().__init__()
        self.db_session_factory = db_session_factory

    def _enqueue_file(self, path: Path, *, wait_for_stable: bool = True):
        """Submit a statement file to the processing queue.

        Args:
            wait_for_stable: When True (the default, used for live
                filesystem events), block until the file size stops
                changing.  Set to False for the initial scan where
                files are already fully written.
        """
        is_csv = path.suffix.lower() == ".csv"
        source = "BANK" if is_csv else "CC"
        logger.info("Detected new %s: %s", "CSV" if is_csv else "PDF", path.name)

        if wait_for_stable and not _wait_for_file_stable(path):
            logger.warning("File %s did not stabilize within timeout, processing anyway", path.name)

        future = processing_queue.submit(
            pdf_path=str(path),
            db_session_factory=self.db_session_factory,
            source=source,
        )
        future.add_done_callback(
            lambda f: self._on_done(path.name, f)
        )

    def _on_done(self, file_name: str, future):
        try:
            result = future.result()
            logger.info("Processed %s: %s", file_name, result)
            _log_processing_result(self.db_session_factory, file_name, result)
        except Exception as e:
            logger.exception("Failed to process %s: %s", file_name, e)
            _log_processing_result(
                self.db_session_factory, file_name,
                {"status": "error", "message": "Processing failed unexpectedly", "count": 0},
            )

    @staticmethod
    def _should_process(path: Path) -> bool:
        if path.suffix.lower() not in StatementWatchHandler.ALLOWED_EXTENSIONS:
            return False
        if "_unlocked" in path.stem:
            return False
        return True

    def on_created(self, event):
        if event.is_directory:
            return
        path = Path(event.src_path)
        if self._should_process(path):
            self._enqueue_file(path)

    def on_moved(self, event):
        if event.is_directory:
            return
        path = Path(event.dest_path)
        if self._should_process(path):
            self._enqueue_file(path)


def _resolve_true_case(path: Path) -> Path:
    """Resolve each path component to its true filesystem case.

    macOS APFS is case-insensitive, but FSEvents delivers events with the
    actual on-disk casing. watchdog compares paths case-sensitively, so we
    must match the real casing exactly.
    """
    parts = path.parts
    resolved = Path(parts[0])
    for component in parts[1:]:
        try:
            for entry in resolved.iterdir():
                if entry.name.lower() == component.lower():
                    resolved = entry
                    break
            else:
                resolved = resolved / component
        except OSError:
            resolved = resolved / component
    return resolved


def _initial_scan(watch_dir: Path, handler: StatementWatchHandler) -> None:
    """Scan the watch directory for existing PDFs/CSVs and enqueue any that
    haven't been imported yet.  Deduplication happens inside
    ``process_statement`` via file-hash, so it's safe to submit
    everything — already-imported files will be skipped cheaply."""
    files = sorted(
        f for ext in ("*.pdf", "*.csv") for f in watch_dir.rglob(ext)
    )
    if not files:
        return

    eligible = [p for p in files if handler._should_process(p)]
    if not eligible:
        return

    logger.info(
        "Initial scan: found %d statement file(s) in %s — submitting for processing",
        len(eligible),
        watch_dir,
    )
    for file_path in eligible:
        handler._enqueue_file(file_path, wait_for_stable=False)


def _validate_watch_path(raw_path: str) -> Optional[Path]:
    """Validate and resolve a watch folder path.

    Returns the resolved Path if valid, or None if the path is
    suspicious, non-existent, or not a directory.
    """
    if not raw_path or not raw_path.strip():
        return None

    expanded = Path(raw_path).expanduser()
    if not expanded.is_absolute():
        logger.warning("Watch path is not absolute: %s", raw_path)
        return None

    resolved = expanded.resolve(strict=False)
    home = Path.home().resolve()
    if not resolved.is_relative_to(home) and not resolved.is_relative_to(Path("/Volumes")):
        logger.warning("Watch path is outside the user's home directory: %s", raw_path)
        return None

    if not resolved.exists() or not resolved.is_dir():
        logger.warning("Watch path does not exist or is not a directory: %s", raw_path)
        return None

    return resolved


def start_watcher(watch_path: str, db_session_factory: Callable) -> Optional[Observer]:
    """Create Observer, schedule handler, start. Returns observer for cleanup."""
    path = _validate_watch_path(watch_path)
    if path is None:
        return None
    path = _resolve_true_case(path)

    handler = StatementWatchHandler(db_session_factory)
    observer = Observer()
    observer.schedule(handler, str(path), recursive=True)
    observer.start()
    logger.info("Started folder watcher on %s (recursive)", path)

    threading.Thread(
        target=_initial_scan,
        args=(path, handler),
        name="initial-scan",
        daemon=True,
    ).start()

    return observer


def stop_watcher(observer: Optional[Observer]) -> None:
    """Stop the folder watcher."""
    if observer:
        observer.stop()
        observer.join(timeout=5)
        logger.info("Stopped folder watcher")
