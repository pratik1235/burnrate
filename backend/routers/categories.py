"""Unified category API endpoints - prebuilt and custom."""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.models.database import get_db
from backend.models.models import CategoryDefinition, Transaction
from backend.services.categorizer import categorize

router = APIRouter(prefix="/categories", tags=["categories"])


class CreateCategoryPayload(BaseModel):
    name: str
    keywords: str
    color: str


class UpdateCategoryPayload(BaseModel):
    name: Optional[str] = None
    keywords: Optional[str] = None
    color: Optional[str] = None


def _slug_from_name(name: str) -> str:
    return name.lower().strip().replace(" ", "_")


@router.get("/all")
def get_all_categories(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """Return ALL categories (prebuilt + custom) with id, name, slug, keywords, color, icon, is_prebuilt."""
    cats = db.query(CategoryDefinition).order_by(CategoryDefinition.is_prebuilt.desc(), CategoryDefinition.name).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "slug": c.slug,
            "keywords": c.keywords,
            "color": c.color,
            "icon": c.icon,
            "is_prebuilt": bool(c.is_prebuilt),
        }
        for c in cats
    ]


@router.post("/custom")
def create_custom_category(
    payload: CreateCategoryPayload, db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Create custom category. Max 20 custom. Triggers recategorization after create."""
    custom_count = db.query(CategoryDefinition).filter(CategoryDefinition.is_prebuilt == 0).count()
    if custom_count >= 20:
        raise HTTPException(status_code=400, detail="Maximum 20 custom categories allowed")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")
    slug = _slug_from_name(name)
    existing = db.query(CategoryDefinition).filter(
        (CategoryDefinition.name == name) | (CategoryDefinition.slug == slug)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category with this name or slug already exists")
    cat = CategoryDefinition(
        name=name,
        slug=slug,
        keywords=payload.keywords.strip(),
        color=payload.color.strip() or "#9CA3AF",
        icon="MoreHorizontal",
        is_prebuilt=0,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)

    return {
        "id": cat.id,
        "name": cat.name,
        "slug": cat.slug,
        "keywords": cat.keywords,
        "color": cat.color,
        "icon": cat.icon,
        "is_prebuilt": False,
    }


@router.put("/{category_id}")
def update_category(
    category_id: str, payload: UpdateCategoryPayload, db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Update a category. Prebuilt: only color. Custom: name, keywords, color."""
    cat = db.query(CategoryDefinition).filter(CategoryDefinition.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    if cat.is_prebuilt:
        if payload.name is not None and payload.name.strip() != cat.name:
            raise HTTPException(status_code=400, detail="Cannot change name of prebuilt category")
        if payload.color is not None:
            cat.color = payload.color.strip() or cat.color
        if payload.keywords is not None:
            cat.keywords = payload.keywords.strip()
    else:
        if payload.name is not None:
            name = payload.name.strip()
            if not name:
                raise HTTPException(status_code=400, detail="Category name cannot be empty")
            cat.name = name
            cat.slug = _slug_from_name(name)
            existing = db.query(CategoryDefinition).filter(
                CategoryDefinition.slug == cat.slug,
                CategoryDefinition.id != category_id,
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail="Category with this name already exists")
        if payload.keywords is not None:
            cat.keywords = payload.keywords.strip()
        if payload.color is not None:
            cat.color = payload.color.strip() or cat.color

    db.commit()
    db.refresh(cat)

    return {
        "id": cat.id,
        "name": cat.name,
        "slug": cat.slug,
        "keywords": cat.keywords,
        "color": cat.color,
        "icon": cat.icon,
        "is_prebuilt": bool(cat.is_prebuilt),
    }


@router.delete("/custom/{category_id}")
def delete_custom_category(category_id: str, db: Session = Depends(get_db)) -> Dict[str, str]:
    """Delete only custom categories. Reject prebuilt with 400."""
    cat = db.query(CategoryDefinition).filter(CategoryDefinition.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if cat.is_prebuilt:
        raise HTTPException(status_code=400, detail="Cannot delete prebuilt categories")
    db.delete(cat)
    db.commit()
    return {"status": "ok"}


class RecategorizePayload(BaseModel):
    override_manual: bool = False


@router.post("/recategorize")
def recategorize_transactions(
    payload: Optional[RecategorizePayload] = None, db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Re-categorize all transactions based on current category definitions."""
    override = payload.override_manual if payload else False
    
    transactions = db.query(Transaction).all()
    updated = 0
    for txn in transactions:
        is_manual = getattr(txn, "is_manually_categorized", 0) == 1
        
        if not override and is_manual:
            continue
            
        new_cat = categorize(txn.merchant, db_session=db)
        
        if override and is_manual:
            txn.is_manually_categorized = 0
            
        if new_cat != txn.category:
            txn.category = new_cat
            txn.is_manually_categorized = 0
            updated += 1
    db.commit()
    return {"status": "ok", "updated": updated}
