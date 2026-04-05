"""Milestones router — CRUD, progress, archive, sync."""

import json
import threading
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.models.database import SessionLocal, get_db
from backend.models.models import Card, MilestoneDefinition, SyncMetadata, UserMilestone
from backend.services.milestone_progress import get_milestone_progress

router = APIRouter(prefix="/milestones", tags=["milestones"])


def _milestone_to_dict(m: UserMilestone, progress: Dict[str, Any], card: Optional[Card] = None) -> Dict[str, Any]:
    return {
        "id": m.id,
        "cardId": m.card_id,
        "definitionId": m.definition_id,
        "title": m.title,
        "milestoneType": m.milestone_type,
        "targetAmount": m.target_amount,
        "periodKind": m.period_kind,
        "periodConfig": m.period_config,
        "rewardDescription": m.reward_description,
        "categoryFilter": m.category_filter,
        "excludeCategories": m.exclude_categories,
        "isAutoCreated": bool(m.is_auto_created),
        "isArchived": bool(m.is_archived),
        "isCustom": bool(m.is_custom),
        "bank": card.bank if card else None,
        "cardLast4": card.last4 if card else None,
        # Progress fields
        **progress,
    }


# ---------------------------------------------------------------------------
# List / Get
# ---------------------------------------------------------------------------

@router.get("")
def list_milestones(
    db: Session = Depends(get_db),
    card_id: Optional[str] = Query(None),
    include_archived: bool = Query(False),
) -> Dict[str, Any]:
    q = db.query(UserMilestone)

    if not include_archived:
        q = q.filter(UserMilestone.is_archived == 0)
    if card_id:
        q = q.filter(UserMilestone.card_id == card_id)

    milestones = q.all()

    # Pre-fetch cards for display
    card_ids = list({m.card_id for m in milestones})
    cards_map = {}
    if card_ids:
        cards = db.query(Card).filter(Card.id.in_(card_ids)).all()
        cards_map = {c.id: c for c in cards}

    result = []
    for m in milestones:
        try:
            progress = get_milestone_progress(db, m)
        except Exception:
            progress = {
                "currentAmount": 0,
                "targetAmount": m.target_amount,
                "percent": 0,
                "remaining": m.target_amount,
                "periodStart": None,
                "periodEnd": None,
                "daysLeft": 0,
            }
        result.append(_milestone_to_dict(m, progress, cards_map.get(m.card_id)))

    return {"milestones": result, "total": len(result)}


@router.get("/definitions")
def list_definitions(db: Session = Depends(get_db)) -> Dict[str, Any]:
    defs = db.query(MilestoneDefinition).filter(MilestoneDefinition.is_active == 1).all()
    return {
        "definitions": [
            {
                "id": d.id,
                "source": d.source,
                "cardTemplateId": d.card_template_id,
                "bank": d.bank,
                "title": d.title,
                "description": d.description,
                "milestoneType": d.milestone_type,
                "targetAmount": d.target_amount,
                "periodKind": d.period_kind,
                "rewardDescription": d.reward_description,
                "rewardValue": d.reward_value,
            }
            for d in defs
        ],
        "total": len(defs),
    }


@router.get("/{milestone_id}")
def get_milestone(milestone_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    m = db.query(UserMilestone).filter(UserMilestone.id == milestone_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")

    card = db.query(Card).filter(Card.id == m.card_id).first()
    progress = get_milestone_progress(db, m)
    return _milestone_to_dict(m, progress, card)


# ---------------------------------------------------------------------------
# Create / Update / Delete
# ---------------------------------------------------------------------------

class MilestoneCreate(BaseModel):
    card_id: str
    title: str
    target_amount: float
    period_kind: str = "calendar_quarter"
    period_config: Optional[str] = None
    milestone_type: str = "fee_waiver"
    reward_description: Optional[str] = None
    category_filter: Optional[str] = None
    exclude_categories: Optional[str] = None


class MilestoneUpdate(BaseModel):
    title: Optional[str] = None
    target_amount: Optional[float] = None
    period_kind: Optional[str] = None
    period_config: Optional[str] = None
    milestone_type: Optional[str] = None
    reward_description: Optional[str] = None
    category_filter: Optional[str] = None
    exclude_categories: Optional[str] = None


@router.post("")
def create_milestone(body: MilestoneCreate, db: Session = Depends(get_db)) -> Dict[str, Any]:
    # Validate card exists
    card = db.query(Card).filter(Card.id == body.card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    m = UserMilestone(
        card_id=body.card_id,
        title=body.title,
        target_amount=body.target_amount,
        period_kind=body.period_kind,
        period_config=body.period_config,
        milestone_type=body.milestone_type,
        reward_description=body.reward_description,
        category_filter=body.category_filter,
        exclude_categories=body.exclude_categories,
        is_custom=1,
    )
    db.add(m)
    db.commit()
    db.refresh(m)

    progress = get_milestone_progress(db, m)
    return _milestone_to_dict(m, progress, card)


@router.put("/{milestone_id}")
def update_milestone(milestone_id: str, body: MilestoneUpdate, db: Session = Depends(get_db)) -> Dict[str, Any]:
    m = db.query(UserMilestone).filter(UserMilestone.id == milestone_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")

    for field in ("title", "target_amount", "period_kind", "period_config",
                  "milestone_type", "reward_description", "category_filter", "exclude_categories"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(m, field, val)

    db.commit()
    db.refresh(m)

    card = db.query(Card).filter(Card.id == m.card_id).first()
    progress = get_milestone_progress(db, m)
    return _milestone_to_dict(m, progress, card)


@router.delete("/{milestone_id}")
def delete_milestone(milestone_id: str, db: Session = Depends(get_db)) -> Dict[str, str]:
    m = db.query(UserMilestone).filter(UserMilestone.id == milestone_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")
    db.delete(m)
    db.commit()
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Archive / Unarchive
# ---------------------------------------------------------------------------

@router.post("/{milestone_id}/archive")
def archive_milestone(milestone_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    m = db.query(UserMilestone).filter(UserMilestone.id == milestone_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")
    m.is_archived = 1
    db.commit()

    card = db.query(Card).filter(Card.id == m.card_id).first()
    progress = get_milestone_progress(db, m)
    return _milestone_to_dict(m, progress, card)


@router.post("/{milestone_id}/unarchive")
def unarchive_milestone(milestone_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    m = db.query(UserMilestone).filter(UserMilestone.id == milestone_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")
    m.is_archived = 0
    db.commit()

    card = db.query(Card).filter(Card.id == m.card_id).first()
    progress = get_milestone_progress(db, m)
    return _milestone_to_dict(m, progress, card)


# ---------------------------------------------------------------------------
# Manual Sync
# ---------------------------------------------------------------------------

@router.post("/sync")
def trigger_sync(db: Session = Depends(get_db)) -> Dict[str, Any]:
    from backend.services.milestone_fetcher import sync_milestone_definitions

    def _run():
        session = SessionLocal()
        try:
            sync_milestone_definitions(session)
        except Exception:
            pass
        finally:
            session.close()

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return {"status": "sync_started"}
