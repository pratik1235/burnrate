"""Offers router — CRUD, filtering, search, hide/unhide, sync."""

import threading
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.models.database import SessionLocal, get_db
from backend.models.models import Card, CardOffer, CardOfferCard, SyncMetadata

router = APIRouter(prefix="/offers", tags=["offers"])


def _escape_like(value: str) -> str:
    """Escape SQL LIKE wildcard characters."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _csv_tokens(value: Optional[str]) -> List[str]:
    if not value:
        return []
    return [x.strip() for x in value.split(",") if x.strip()]


def _offer_to_dict(offer: CardOffer, applicable_card_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    return {
        "id": offer.id,
        "title": offer.title,
        "description": offer.description,
        "merchant": offer.merchant,
        "discountText": offer.discount_text,
        "offerType": offer.offer_type,
        "bank": offer.bank,
        "cardTemplateId": offer.card_template_id,
        "network": offer.network,
        "minTransaction": offer.min_transaction,
        "maxDiscount": offer.max_discount,
        "validFrom": offer.valid_from.isoformat() if offer.valid_from else None,
        "validUntil": offer.valid_until.isoformat() if offer.valid_until else None,
        "isExpired": bool(offer.is_expired),
        "category": offer.category,
        "source": offer.source,
        "sourceUrl": offer.source_url,
        "isUserCreated": bool(offer.is_user_created),
        "isHidden": bool(offer.is_hidden),
        "applicableCards": applicable_card_ids or [],
        "fetchedAt": offer.fetched_at.isoformat() if offer.fetched_at else None,
        "createdAt": offer.created_at.isoformat() if offer.created_at else None,
    }


# ---------------------------------------------------------------------------
# List / Get
# ---------------------------------------------------------------------------

@router.get("")
def list_offers(
    db: Session = Depends(get_db),
    cards: Optional[str] = Query(None, description="Comma-separated card UUIDs"),
    bank: Optional[str] = Query(None),
    banks: Optional[str] = Query(None, description="Comma-separated bank slugs (OR match)"),
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    categories: Optional[str] = Query(None, description="Comma-separated categories (OR match)"),
    offer_type: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    include_expired: bool = Query(False),
    include_hidden: bool = Query(False),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    q = db.query(CardOffer)

    if not include_expired:
        q = q.filter(CardOffer.is_expired == 0)
    if not include_hidden:
        q = q.filter(CardOffer.is_hidden == 0)
    bank_slugs = _csv_tokens(banks)
    if not bank_slugs and bank:
        bank_slugs = _csv_tokens(bank)
    bank_slugs = [b.lower() for b in bank_slugs]
    if bank_slugs:
        q = q.filter(CardOffer.bank.in_(bank_slugs))
    cat_tokens = _csv_tokens(categories)
    if not cat_tokens and category:
        cat_tokens = _csv_tokens(category)
    if cat_tokens:
        q = q.filter(CardOffer.category.in_(cat_tokens))
    if offer_type:
        q = q.filter(CardOffer.offer_type == offer_type)
    if source:
        q = q.filter(CardOffer.source == source)

    if search:
        escaped = _escape_like(search)
        q = q.filter(
            CardOffer.title.ilike(f"%{escaped}%", escape="\\")
            | CardOffer.description.ilike(f"%{escaped}%", escape="\\")
            | CardOffer.merchant.ilike(f"%{escaped}%", escape="\\")
        )

    if cards:
        card_ids = [c.strip() for c in cards.split(",") if c.strip()]
        if card_ids:
            # Get banks for these cards
            user_cards = db.query(Card).filter(Card.id.in_(card_ids)).all()
            card_banks = [c.bank for c in user_cards]
            if card_banks:
                q = q.filter(
                    CardOffer.bank.in_(card_banks) | (CardOffer.bank == None)
                )

    total = q.count()
    rows = q.order_by(CardOffer.created_at.desc()).offset(offset).limit(limit).all()

    # Get last sync time
    sync = db.query(SyncMetadata).order_by(SyncMetadata.last_sync_at.desc()).first()
    last_sync = sync.last_sync_at.isoformat() if sync and sync.last_sync_at else None

    return {
        "offers": [_offer_to_dict(o) for o in rows],
        "total": total,
        "lastSyncAt": last_sync,
    }


@router.get("/sync-status")
def get_sync_status(db: Session = Depends(get_db)) -> Dict[str, Any]:
    metas = db.query(SyncMetadata).all()
    return {
        "providers": [
            {
                "provider": m.provider,
                "lastSyncAt": m.last_sync_at.isoformat() if m.last_sync_at else None,
                "lastStatus": m.last_status,
                "offersFetched": m.offers_fetched,
                "errorMessage": m.error_message,
            }
            for m in metas
            if not m.provider.startswith("milestone_")
        ]
    }


@router.get("/{offer_id}")
def get_offer(offer_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    offer = db.query(CardOffer).filter(CardOffer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    card_ids = [
        r.card_id for r in
        db.query(CardOfferCard).filter(CardOfferCard.offer_id == offer_id).all()
    ]
    return _offer_to_dict(offer, card_ids)


# ---------------------------------------------------------------------------
# Create / Update / Delete (user offers only)
# ---------------------------------------------------------------------------

class OfferCreate(BaseModel):
    title: str
    description: Optional[str] = None
    merchant: Optional[str] = None
    discount_text: Optional[str] = None
    offer_type: Optional[str] = None
    bank: Optional[str] = None
    category: Optional[str] = None
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
    min_transaction: Optional[float] = None
    max_discount: Optional[float] = None


class OfferUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    merchant: Optional[str] = None
    discount_text: Optional[str] = None
    offer_type: Optional[str] = None
    bank: Optional[str] = None
    category: Optional[str] = None
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
    min_transaction: Optional[float] = None
    max_discount: Optional[float] = None


@router.post("")
def create_offer(body: OfferCreate, db: Session = Depends(get_db)) -> Dict[str, Any]:
    offer = CardOffer(
        source="user",
        source_id=None,
        title=body.title,
        description=body.description,
        merchant=body.merchant,
        discount_text=body.discount_text,
        offer_type=body.offer_type,
        bank=body.bank.lower() if body.bank else None,
        category=body.category,
        valid_from=date.fromisoformat(body.valid_from) if body.valid_from else None,
        valid_until=date.fromisoformat(body.valid_until) if body.valid_until else None,
        min_transaction=body.min_transaction,
        max_discount=body.max_discount,
        is_user_created=1,
    )
    db.add(offer)
    db.commit()
    db.refresh(offer)
    return _offer_to_dict(offer)


@router.put("/{offer_id}")
def update_offer(offer_id: str, body: OfferUpdate, db: Session = Depends(get_db)) -> Dict[str, Any]:
    offer = db.query(CardOffer).filter(CardOffer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    if not offer.is_user_created:
        raise HTTPException(status_code=400, detail="Cannot edit fetched offers")

    for field in ("title", "description", "merchant", "discount_text", "offer_type", "category"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(offer, field, val)
    if body.bank is not None:
        offer.bank = body.bank.lower()
    if body.valid_from is not None:
        offer.valid_from = date.fromisoformat(body.valid_from)
    if body.valid_until is not None:
        offer.valid_until = date.fromisoformat(body.valid_until)
    if body.min_transaction is not None:
        offer.min_transaction = body.min_transaction
    if body.max_discount is not None:
        offer.max_discount = body.max_discount

    db.commit()
    db.refresh(offer)
    return _offer_to_dict(offer)


@router.delete("/{offer_id}")
def delete_offer(offer_id: str, db: Session = Depends(get_db)) -> Dict[str, str]:
    offer = db.query(CardOffer).filter(CardOffer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    db.delete(offer)
    db.commit()
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Hide / Unhide
# ---------------------------------------------------------------------------

@router.post("/{offer_id}/hide")
def hide_offer(offer_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    offer = db.query(CardOffer).filter(CardOffer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    offer.is_hidden = 1
    db.commit()
    return _offer_to_dict(offer)


@router.post("/{offer_id}/unhide")
def unhide_offer(offer_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    offer = db.query(CardOffer).filter(CardOffer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    offer.is_hidden = 0
    db.commit()
    return _offer_to_dict(offer)


# ---------------------------------------------------------------------------
# Manual Sync
# ---------------------------------------------------------------------------

@router.post("/sync")
def trigger_sync(db: Session = Depends(get_db)) -> Dict[str, Any]:
    from backend.services.offer_fetcher import sync_offers

    # Run sync in background to avoid blocking the request
    def _run():
        session = SessionLocal()
        try:
            sync_offers(session)
        except Exception:
            pass
        finally:
            session.close()

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return {"status": "sync_started"}
