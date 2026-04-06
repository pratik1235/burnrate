"""Cards API endpoints."""

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.models.database import get_db
from backend.models.models import Card

from backend.services.card_delete import delete_card_cascade

router = APIRouter(prefix="/cards", tags=["cards"])


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
        }
        for c in cards
    ]


@router.delete("/{card_id}")
def delete_card(card_id: str, db: Session = Depends(get_db)) -> Dict[str, str]:
    """Delete a card and all associated transactions and statements."""
    if not delete_card_cascade(db, card_id):
        raise HTTPException(status_code=404, detail="Card not found")
    db.commit()

    return {"status": "success", "message": "Card and associated data deleted"}
