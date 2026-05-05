"""Payment due date reminders — local-only, no telemetry."""

from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.models.database import get_db
from backend.services import payment_reminders as pr

router = APIRouter(prefix="/due-reminders", tags=["due-reminders"])


class AutoShownPayload(BaseModel):
    local_date: str = Field(..., min_length=10, max_length=10, description="YYYY-MM-DD in the user's local calendar")


class AckPayload(BaseModel):
    card_id: str


@router.get("")
def get_due_reminders(
    local_date: str = Query(..., description="Today's date in the user's local timezone as YYYY-MM-DD"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Eligible unpaid reminders for all registered cards."""
    try:
        today = date.fromisoformat(local_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid local_date")
    items = pr.list_eligible_reminders(db, today)
    return {"items": items}


@router.get("/auto-prompt")
def get_auto_prompt(
    local_date: str = Query(..., description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Whether the app should auto-open the reminder modal today."""
    try:
        date.fromisoformat(local_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid local_date")
    show = pr.should_auto_open_modal(db, local_date)
    return {"show": show}


@router.post("/record-auto-shown")
def post_record_auto_shown(
    payload: AutoShownPayload,
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    """Record that the auto reminder was shown for this local calendar day."""
    try:
        date.fromisoformat(payload.local_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid local_date")
    pr.record_auto_shown(db, payload.local_date)
    return {"status": "ok"}


@router.post("/ack")
def post_ack(
    payload: AckPayload,
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    """User marks the current bill as paid (latest CC statement for the card)."""
    ok, err = pr.acknowledge_paid(db, payload.card_id)
    if not ok:
        raise HTTPException(status_code=400, detail=err or "Could not acknowledge")
    return {"status": "ok"}
