"""Settings API endpoints."""

from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.models.database import SessionLocal, get_db
from backend.models.models import Card, Settings
from backend.services.folder_watcher import start_watcher, stop_watcher


def _validate_watch_folder(folder: Optional[str]) -> Optional[str]:
    """Validate a user-provided watch folder path.

    Raises HTTPException if the path is invalid or suspicious.
    Returns the resolved path string, or None if folder is empty.
    """
    if not folder or not folder.strip():
        return None

    expanded = Path(folder).expanduser()
    if not expanded.is_absolute():
        raise HTTPException(status_code=400, detail="Watch folder must be an absolute path.")

    resolved = expanded.resolve(strict=False)
    home = Path.home().resolve()
    if not resolved.is_relative_to(home) and not resolved.is_relative_to(Path("/Volumes")):
        raise HTTPException(status_code=400, detail="Watch folder must be within your home directory.")

    if not resolved.exists():
        raise HTTPException(status_code=400, detail="Watch folder does not exist.")
    if not resolved.is_dir():
        raise HTTPException(status_code=400, detail="Watch folder path is not a directory.")

    return str(resolved)


router = APIRouter(prefix="/settings", tags=["settings"])

# Global observer for folder watcher - set by main.py
_watcher_observer = None


def set_watcher_observer(observer):
    """Set the global watcher observer for cleanup."""
    global _watcher_observer
    _watcher_observer = observer


def get_watcher_observer():
    """Get the global watcher observer."""
    return _watcher_observer


class CardInput(BaseModel):
    bank: str
    last4: str
    name: Optional[str] = None


class SetupInput(BaseModel):
    name: str
    dob_day: Optional[str] = None
    dob_month: Optional[str] = None
    dob_year: Optional[str] = None
    watch_folder: Optional[str] = None
    cards: List[CardInput] = []


class SettingsUpdateInput(BaseModel):
    name: Optional[str] = None
    dob_day: Optional[str] = None
    dob_month: Optional[str] = None
    dob_year: Optional[str] = None
    watch_folder: Optional[str] = None
    cards: Optional[List[CardInput]] = None


@router.get("")
def get_settings(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Return settings + cards, or {setup_complete: false}."""
    settings = db.query(Settings).first()
    if not settings:
        return {"setup_complete": False}

    cards = db.query(Card).all()
    return {
        "setup_complete": True,
        "settings": {
            "id": settings.id,
            "name": settings.name,
            "dob_day": settings.dob_day,
            "dob_month": settings.dob_month,
            "dob_year": settings.dob_year,
            "watch_folder": settings.watch_folder,
            "created_at": settings.created_at.isoformat() if settings.created_at else None,
            "updated_at": settings.updated_at.isoformat() if settings.updated_at else None,
        },
        "cards": [
            {
                "id": c.id,
                "bank": c.bank,
                "last4": c.last4,
                "name": c.name,
            }
            for c in cards
        ],
    }


@router.post("/setup")
def setup(
    body: SetupInput,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Create settings + cards, start folder watcher."""
    existing = db.query(Settings).first()
    if existing:
        raise HTTPException(status_code=400, detail="Setup already completed. Use PUT /api/settings to update.")

    validated_folder = _validate_watch_folder(body.watch_folder)

    settings = Settings(
        name=body.name,
        dob_day=body.dob_day,
        dob_month=body.dob_month,
        dob_year=body.dob_year,
        watch_folder=validated_folder,
    )
    db.add(settings)
    db.flush()

    for card_in in body.cards:
        card = Card(
            bank=card_in.bank.lower(),
            last4=card_in.last4[-4:] if len(card_in.last4) >= 4 else card_in.last4,
            name=card_in.name,
        )
        db.add(card)

    db.commit()

    # Start folder watcher if watch_folder is set
    observer = None
    if body.watch_folder:
        observer = start_watcher(body.watch_folder, db_session_factory=SessionLocal)
        if observer:
            set_watcher_observer(observer)

    return {
        "status": "success",
        "message": "Setup complete",
        "watcher_started": observer is not None,
    }


@router.put("")
def update_settings(
    body: SettingsUpdateInput,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Update settings and optionally sync cards."""
    settings = db.query(Settings).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Setup not completed. Use POST /api/settings/setup first.")

    if body.name is not None:
        settings.name = body.name
    if body.dob_day is not None:
        settings.dob_day = body.dob_day
    if body.dob_month is not None:
        settings.dob_month = body.dob_month
    if body.dob_year is not None:
        settings.dob_year = body.dob_year
    if body.watch_folder is not None:
        settings.watch_folder = _validate_watch_folder(body.watch_folder)

    cards_added = 0
    if body.cards is not None:
        existing = {
            (c.bank.lower(), c.last4)
            for c in db.query(Card).all()
        }
        for card_in in body.cards:
            bank = card_in.bank.lower()
            last4 = card_in.last4[-4:] if len(card_in.last4) >= 4 else card_in.last4
            if (bank, last4) not in existing:
                db.add(Card(bank=bank, last4=last4, name=card_in.name))
                cards_added += 1

    db.commit()

    old_observer = get_watcher_observer()
    if old_observer:
        stop_watcher(old_observer)
        set_watcher_observer(None)
    if settings.watch_folder:
        observer = start_watcher(settings.watch_folder, db_session_factory=SessionLocal)
        if observer:
            set_watcher_observer(observer)

    return {"status": "success", "message": "Settings updated", "cards_added": cards_added}


@router.post("/browse-folder")
def browse_folder() -> Dict[str, str]:
    """Open a native folder picker dialog and return the selected path."""
    import platform
    import subprocess

    path = ""
    system = platform.system()

    try:
        if system == "Darwin":
            result = subprocess.run(
                ["osascript", "-e", 'POSIX path of (choose folder with prompt "Select watch folder")'],
                capture_output=True, text=True, timeout=120,
            )
            if result.returncode == 0:
                path = result.stdout.strip().rstrip("/")
        elif system == "Linux":
            result = subprocess.run(
                ["zenity", "--file-selection", "--directory", "--title=Select watch folder"],
                capture_output=True, text=True, timeout=120,
            )
            if result.returncode == 0:
                path = result.stdout.strip()
    except Exception:
        pass

    return {"path": path}
