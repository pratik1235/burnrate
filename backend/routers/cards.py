"""Cards API endpoints."""

from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.models.database import get_db
from backend.models.models import Card

from backend.services.card_delete import delete_card_cascade

router = APIRouter(prefix="/cards", tags=["cards"])


class CardPatchPayload(BaseModel):
    manual_next_due_date: Optional[str] = Field(None, description="YYYY-MM-DD or null to clear")
    manual_next_due_amount: Optional[float] = None


@router.get("")
def list_cards(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """List all registered cards."""
    cards = db.query(Card).all()
    return [
        {
            "id": c.id,
            "bank": c.bank,
            "last4": c.last4,
            "name": c.name,
            "manualNextDueDate": c.manual_next_due_date.isoformat() if c.manual_next_due_date else None,
            "manualNextDueAmount": c.manual_next_due_amount,
        }
        for c in cards
    ]


@router.patch("/{card_id}")
def patch_card(
    card_id: str,
    payload: CardPatchPayload,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Update optional manual due date overrides for reminders."""
    card = db.query(Card).filter(Card.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    raw = payload.model_dump(exclude_unset=True)
    if "manual_next_due_date" in raw:
        v = raw["manual_next_due_date"]
        if v is None or v == "":
            card.manual_next_due_date = None
        else:
            try:
                card.manual_next_due_date = date.fromisoformat(str(v))
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid manual_next_due_date")
    if "manual_next_due_amount" in raw:
        card.manual_next_due_amount = raw["manual_next_due_amount"]

    md = card.manual_next_due_date
    maf = getattr(card, "manual_due_acknowledged_for", None)
    if md is None:
        card.manual_due_acknowledged_for = None
    elif maf is not None and md != maf:
        card.manual_due_acknowledged_for = None

    db.commit()
    db.refresh(card)
    return {
        "id": card.id,
        "bank": card.bank,
        "last4": card.last4,
        "name": card.name,
        "manualNextDueDate": card.manual_next_due_date.isoformat() if card.manual_next_due_date else None,
        "manualNextDueAmount": card.manual_next_due_amount,
    }


@router.delete("/{card_id}")
def delete_card(card_id: str, db: Session = Depends(get_db)) -> Dict[str, str]:
    """Delete a card and all associated transactions and statements."""
    if not delete_card_cascade(db, card_id):
        raise HTTPException(status_code=404, detail="Card not found")
    db.commit()

    return {"status": "success", "message": "Card and associated data deleted"}
