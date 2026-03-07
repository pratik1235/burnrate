#!/usr/bin/env python3
"""Burnrate launcher — starts the backend server and opens the browser.

Used by native macOS/Windows builds (PyInstaller) to provide a
double-click-to-run experience. When run as a bundled app, static
assets live alongside the executable; when run from source, the
standard development layout is used.
"""

import os
import sys
import threading
import time
import webbrowser
from pathlib import Path


def _find_static_dir() -> str:
    """Locate the pre-built React frontend."""
    if getattr(sys, "frozen", False):
        bundle_dir = Path(sys._MEIPASS)  # type: ignore[attr-defined]
        candidate = bundle_dir / "static"
        if candidate.is_dir():
            return str(candidate)
    project_root = Path(__file__).resolve().parent.parent
    for sub in ("frontend-neopop/dist", "frontend/dist"):
        p = project_root / sub
        if p.is_dir():
            return str(p)
    return ""


def _open_browser(port: int, delay: float = 2.0) -> None:
    """Wait for the server to start, then open the default browser."""
    time.sleep(delay)
    webbrowser.open(f"http://localhost:{port}")


def main() -> None:
    port = int(os.environ.get("BURNRATE_PORT", "8000"))

    static_dir = _find_static_dir()
    if static_dir:
        os.environ.setdefault("BURNRATE_STATIC_DIR", static_dir)

    # Ensure project root is importable
    project_root = str(Path(__file__).resolve().parent.parent)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    import uvicorn
    from backend.main import app

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
