"""Tag definition API endpoints."""

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.models.database import get_db
from backend.models.models import TagDefinition, TransactionTag

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tags", tags=["tags"])


class CreateTagPayload(BaseModel):
    name: str


@router.get("")
def list_tag_definitions(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    tags = db.query(TagDefinition).order_by(TagDefinition.name).all()
    return [{"id": t.id, "name": t.name} for t in tags]


@router.post("")
def create_tag_definition(payload: CreateTagPayload, db: Session = Depends(get_db)) -> Dict[str, Any]:
    count = db.query(TagDefinition).count()
    if count >= 20:
        raise HTTPException(status_code=400, detail="Maximum 20 tags allowed")
    name = payload.name.strip()[:12]
    if not name:
        raise HTTPException(status_code=400, detail="Tag name is required")
    existing = db.query(TagDefinition).filter(TagDefinition.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tag with this name already exists")
    tag = TagDefinition(name=name)
    db.add(tag)
    db.commit()
    return {"id": tag.id, "name": tag.name}


@router.delete("/{tag_id}")
def delete_tag_definition(tag_id: str, db: Session = Depends(get_db)) -> Dict[str, str]:
    tag = db.query(TagDefinition).filter(TagDefinition.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    # First delete all transaction tags using this name (cascade)
    db.query(TransactionTag).filter(TransactionTag.tag_id == tag.id).delete(synchronize_session=False)

    db.delete(tag)
    db.commit()
    logger.info("Tag definition deleted: id=%s", tag_id)
    return {"status": "ok"}
