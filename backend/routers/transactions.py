"""Transaction API endpoints."""

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload

from backend.models.database import get_db
from backend.models.models import MAX_TAG_LENGTH, CategoryDefinition, TagDefinition, Transaction, TransactionTag
from backend.services.transaction_query import apply_source_account_filters, parse_bank_accounts_param


def _escape_like(value: str) -> str:
    """Escape SQL LIKE wildcard characters so user input is matched literally."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

router = APIRouter(prefix="/transactions", tags=["transactions"])


class UpdateTagsPayload(BaseModel):
    tags: List[str]


class UpdateCategoryPayload(BaseModel):
    category: str


@router.get("/bank-accounts")
def list_bank_account_keys(
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Distinct BANK-source (bank, last4) pairs for filter UI."""
    rows = (
        db.query(Transaction.bank, Transaction.card_last4)
        .filter(Transaction.source == "BANK")
        .filter(Transaction.bank.isnot(None))
        .filter(Transaction.card_last4.isnot(None))
        .distinct()
        .all()
    )
    accounts = []
    for bank, last4 in rows:
        if not bank or not last4:
            continue
        b = bank.lower()
        accounts.append({"bank": b, "last4": last4, "id": f"{b}:{last4}"})
    accounts.sort(key=lambda x: (x["bank"], x["last4"]))
    return {"accounts": accounts}


@router.get("")
def list_transactions(
    db: Session = Depends(get_db),
    card: Optional[str] = Query(None, description="Filter by card UUID"),
    cards: Optional[str] = Query(None, description="Comma-separated card UUIDs"),
    bank_accounts: Optional[str] = Query(
        None,
        description="Comma-separated bank:last4 keys for BANK transactions (e.g. hdfc:1234)",
    ),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    tags: Optional[str] = Query(None, description="Comma-separated tag names to filter by"),
    direction: Optional[str] = Query(None, description="incoming or outgoing"),
    source: Optional[str] = Query(
        None,
        description="Filter by source: CC, BANK, or omit / all for both (combined with card/bank filters)",
    ),
    amount_min: Optional[float] = Query(None),
    amount_max: Optional[float] = Query(None),
    sort_by: Optional[str] = Query(None, description="amount, date, or category"),
    sort_order: Optional[str] = Query("desc", description="asc or desc"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    statement_ids: Optional[str] = Query(None, description="Comma-separated statement IDs"),
) -> Dict[str, Any]:
    """Query transactions with filters. Returns {transactions: [...], total: N, totalAmount: F}."""
    q = db.query(Transaction)

    card_ids: Optional[List[str]] = None
    if cards:
        card_ids = [c.strip() for c in cards.split(",") if c.strip()] or None
    elif card:
        card_ids = [card]

    bank_pairs = parse_bank_accounts_param(bank_accounts)
    src = source.strip().upper() if source and source.strip() else None
    if src == "ALL":
        src = None

    if statement_ids:
        s_ids = [s.strip() for s in statement_ids.split(",") if s.strip()]
        if s_ids:
            q = q.filter(Transaction.statement_id.in_(s_ids))

    q = apply_source_account_filters(q, src, card_ids, bank_pairs)
    if from_date:
        q = q.filter(Transaction.date >= from_date)
    if to_date:
        q = q.filter(Transaction.date <= to_date)
    if category:
        q = q.filter(Transaction.category == category)
    if direction == "incoming":
        q = q.filter(Transaction.type == "credit")
    elif direction == "outgoing":
        q = q.filter(Transaction.type == "debit")
    if search:
        escaped = _escape_like(search)
        q = q.filter(
            Transaction.merchant.ilike(f"%{escaped}%", escape="\\")
            | Transaction.description.ilike(f"%{escaped}%", escape="\\")
        )
    if tags:
        tag_names = [t.strip() for t in tags.split(",") if t.strip()]
        if tag_names:
            tag_subquery = (
                db.query(TransactionTag.transaction_id)
                .join(TagDefinition, TransactionTag.tag_id == TagDefinition.id)
                .filter(TagDefinition.name.in_(tag_names))
                .distinct()
            )
            q = q.filter(Transaction.id.in_(tag_subquery))
    if amount_min is not None:
        q = q.filter(Transaction.amount >= amount_min)
    if amount_max is not None:
        q = q.filter(Transaction.amount <= amount_max)

    # Exclude cc_payment from aggregate metrics but keep them in the list.
    # Net spend = sum(debits) − sum(credits) where category != cc_payment.
    filtered_ids = q.with_entities(Transaction.id)
    metrics_q = q.filter(Transaction.category != "cc_payment")
    total_count = q.count()

    by_cur = (
        db.query(
            Transaction.currency,
            func.sum(
                case(
                    (Transaction.type == "debit", Transaction.amount),
                    else_=-Transaction.amount,
                )
            ).label("net_amt"),
        )
        .filter(
            Transaction.category != "cc_payment",
            Transaction.id.in_(filtered_ids),
        )
        .group_by(Transaction.currency)
        .all()
    )
    totals_by_currency = [
        {
            "currency": (r.currency or "INR").upper()[:3],
            "amount": float(
                Decimal(str(r.net_amt or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            ),
        }
        for r in by_cur
    ]
    totals_by_currency.sort(key=lambda x: x["currency"])
    if len(totals_by_currency) == 0:
        total_amount: Optional[float] = 0.0
    elif len(totals_by_currency) == 1:
        total_amount = totals_by_currency[0]["amount"]
    else:
        total_amount = None

    # Apply sorting
    if sort_by == "amount":
        if sort_order == "asc":
            q = q.order_by(Transaction.amount.asc(), Transaction.date.desc())
        else:
            q = q.order_by(Transaction.amount.desc(), Transaction.date.desc())
    elif sort_by == "category":
        if sort_order == "asc":
            q = q.order_by(Transaction.category.asc(), Transaction.date.desc())
        else:
            q = q.order_by(Transaction.category.desc(), Transaction.date.desc())
    else:  # default to date
        if sort_order == "asc":
            q = q.order_by(Transaction.date.asc(), Transaction.id.asc())
        else:
            q = q.order_by(Transaction.date.desc(), Transaction.id.desc())

    rows = (
        q.options(joinedload(Transaction.tags).joinedload(TransactionTag.tag_def))
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "transactions": [
            {
                "id": r.id,
                "statementId": r.statement_id,
                "date": r.date.isoformat() if r.date else None,
                "merchant": r.merchant,
                "amount": r.amount,
                "type": r.type,
                "category": r.category,
                "description": r.description,
                "bank": r.bank,
                "cardLast4": r.card_last4,
                "cardId": r.card_id,
                "source": getattr(r, "source", None) or "CC",
                "currency": (getattr(r, "currency", None) or "INR").upper()[:3],
                "tags": [t.tag_def.name for t in r.tags if t.tag_def],
                "isManuallyCategorized": getattr(r, "is_manually_categorized", 0),
            }
            for r in rows
        ],
        "total": total_count,
        "totalAmount": total_amount,
        "totalsByCurrency": totals_by_currency,
        "mixedCurrency": len(totals_by_currency) > 1,
    }


@router.get("/{transaction_id}/tags")
def get_transaction_tags(
    transaction_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, List[str]]:
    """Return tags for a transaction."""
    tags = (
        db.query(TagDefinition.name)
        .join(TransactionTag, TransactionTag.tag_id == TagDefinition.id)
        .filter(TransactionTag.transaction_id == transaction_id)
        .all()
    )
    return {"tags": [t[0] for t in tags]}


@router.put("/{transaction_id}/tags")
def update_transaction_tags(
    transaction_id: str,
    payload: UpdateTagsPayload,
    db: Session = Depends(get_db),
) -> Dict[str, List[str]]:
    """Replace tags for a transaction. Max 3 tags, bounded by max length."""
    if len(payload.tags) > 3:
        raise HTTPException(status_code=400, detail="Maximum 3 tags allowed")
    validated = []
    for t in payload.tags:
        tag = str(t).strip()[:MAX_TAG_LENGTH]
        if tag and len(tag) <= MAX_TAG_LENGTH:
            validated.append(tag)
    if len(validated) > 3:
        validated = validated[:3]
    txn = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.query(TransactionTag).filter(TransactionTag.transaction_id == transaction_id).delete()
    for tag_name in validated:
        tag_def = db.query(TagDefinition).filter(TagDefinition.name == tag_name).first()
        if not tag_def:
            tag_def = TagDefinition(name=tag_name)
            db.add(tag_def)
            db.flush()
        db.add(TransactionTag(transaction_id=transaction_id, tag_id=tag_def.id))
    db.commit()
    return {"tags": validated}


@router.put("/{transaction_id}/category")
def update_transaction_category(
    transaction_id: str,
    payload: UpdateCategoryPayload,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Update transaction category manually."""
    txn = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    slug = payload.category.strip()
    if not slug:
        raise HTTPException(status_code=400, detail="Category cannot be empty")
        
    cat_exists = db.query(CategoryDefinition).filter(CategoryDefinition.slug == slug).first()
    if not cat_exists and slug != "other":
        raise HTTPException(status_code=400, detail=f"Category '{slug}' is invalid")
        
    txn.category = slug
    txn.is_manually_categorized = 1
    db.commit()
    
    return {
        "id": txn.id,
        "category": txn.category,
        "isManuallyCategorized": txn.is_manually_categorized
    }
