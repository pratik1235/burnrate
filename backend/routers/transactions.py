"""Transaction API endpoints."""

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload

from backend.models.database import get_db
from backend.models.models import Transaction, TransactionTag
from backend.services.transaction_query import apply_source_account_filters, parse_bank_accounts_param


def _escape_like(value: str) -> str:
    """Escape SQL LIKE wildcard characters so user input is matched literally."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

router = APIRouter(prefix="/transactions", tags=["transactions"])


class UpdateTagsPayload(BaseModel):
    tags: List[str]


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
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
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
                .filter(TransactionTag.tag.in_(tag_names))
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
    total_count = metrics_q.count()

    total_amount_raw = (
        db.query(
            func.sum(
                case(
                    (Transaction.type == "debit", Transaction.amount),
                    else_=-Transaction.amount,
                )
            )
        )
        .filter(
            Transaction.category != "cc_payment",
            Transaction.id.in_(filtered_ids),
        )
        .scalar() or 0.0
    )
    total_amount = float(Decimal(str(total_amount_raw)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

    rows = (
        q.options(joinedload(Transaction.tags))
        .order_by(Transaction.date.desc())
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
                "tags": [t.tag for t in r.tags],
            }
            for r in rows
        ],
        "total": total_count,
        "totalAmount": total_amount,
    }


@router.get("/{transaction_id}/tags")
def get_transaction_tags(
    transaction_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, List[str]]:
    """Return tags for a transaction."""
    tags = (
        db.query(TransactionTag.tag)
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
    """Replace tags for a transaction. Max 3 tags, each max 10 chars."""
    if len(payload.tags) > 3:
        raise HTTPException(status_code=400, detail="Maximum 3 tags allowed")
    validated = []
    for t in payload.tags:
        tag = str(t).strip()[:10]
        if tag and len(tag) <= 10:
            validated.append(tag)
    if len(validated) > 3:
        validated = validated[:3]
    txn = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.query(TransactionTag).filter(TransactionTag.transaction_id == transaction_id).delete()
    for tag in validated:
        db.add(TransactionTag(transaction_id=transaction_id, tag=tag))
    db.commit()
    return {"tags": validated}
