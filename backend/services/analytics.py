"""Analytics queries for spend data.

Net spend formula (single source of truth):
    net = sum(debits, category != cc_payment) − sum(credits, category != cc_payment)
CC payment transactions are excluded entirely; legitimate refunds/reversals
(credits with any other category) reduce the net spend.
"""

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from backend.models.models import Transaction, TransactionTag
from backend.services.transaction_query import apply_source_account_filters


def _date_filter(q, from_date: Optional[date], to_date: Optional[date]):
    if from_date:
        q = q.filter(Transaction.date >= from_date)
    if to_date:
        q = q.filter(Transaction.date <= to_date)
    return q


def _apply_filters(
    q,
    categories: Optional[List[str]] = None,
    direction: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
    tags: Optional[List[str]] = None,
):
    """Apply common filters (card/source scoping is apply_source_account_filters)."""
    if categories:
        q = q.filter(Transaction.category.in_(categories))
    if direction == "incoming":
        q = q.filter(Transaction.type == "credit")
    elif direction == "outgoing":
        q = q.filter(Transaction.type == "debit")
    if amount_min is not None:
        q = q.filter(Transaction.amount >= amount_min)
    if amount_max is not None:
        q = q.filter(Transaction.amount <= amount_max)
    if tags:
        tag_subq = select(TransactionTag.transaction_id).where(TransactionTag.tag.in_(tags)).distinct()
        q = q.filter(Transaction.id.in_(tag_subq))
    return q


def compute_net_spend_by_currency(
    db: Session,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    card_ids: Optional[List[str]] = None,
    categories: Optional[List[str]] = None,
    direction: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
    tags: Optional[List[str]] = None,
    source: Optional[str] = None,
    bank_pairs: Optional[List[Tuple[str, str]]] = None,
) -> List[Dict[str, Any]]:
    """Net spend grouped by transaction currency (cc_payment excluded)."""
    q = (
        db.query(
            Transaction.currency,
            func.sum(
                case(
                    (Transaction.type == "debit", Transaction.amount),
                    else_=-Transaction.amount,
                )
            ).label("net_spend"),
        )
        .filter(Transaction.category != "cc_payment")
    )
    q = _date_filter(q, from_date, to_date)
    q = apply_source_account_filters(q, source, card_ids, bank_pairs or [])
    q = _apply_filters(q, categories, direction, amount_min, amount_max, tags)
    rows = q.group_by(Transaction.currency).all()
    out: List[Dict[str, Any]] = []
    for r in rows:
        cur = (r.currency or "INR").upper()[:3]
        amt = float(Decimal(str(r.net_spend or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        out.append({"currency": cur, "amount": amt})
    out.sort(key=lambda x: x["currency"])
    return out


def compute_net_spend(
    db: Session,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    bank: Optional[str] = None,
    card_last4: Optional[str] = None,
    card_ids: Optional[List[str]] = None,
    categories: Optional[List[str]] = None,
    direction: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
    tags: Optional[List[str]] = None,
    source: Optional[str] = None,
    bank_pairs: Optional[List[Tuple[str, str]]] = None,
    currency: Optional[str] = None,
) -> float:
    """Single source of truth for net spend calculation.

    Excludes all cc_payment transactions. Also excludes cc_payment-category
    transactions from BANK source to avoid double-counting credit card bill
    payments that appear in both bank and card statements.
    """
    q = (
        db.query(
            func.sum(
                case(
                    (Transaction.type == "debit", Transaction.amount),
                    else_=-Transaction.amount,
                )
            )
        )
        .filter(Transaction.category != "cc_payment")
    )
    q = _date_filter(q, from_date, to_date)
    if bank:
        q = q.filter(Transaction.bank == bank)
    if card_last4:
        q = q.filter(Transaction.card_last4 == card_last4)
    q = apply_source_account_filters(q, source, card_ids, bank_pairs or [])
    q = _apply_filters(q, categories, direction, amount_min, amount_max, tags)
    if currency:
        q = q.filter(Transaction.currency == currency.upper()[:3])
    raw = q.scalar() or 0.0
    d = Decimal(str(raw)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return float(d)


def get_summary(
    db: Session,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    card_ids: Optional[List[str]] = None,
    categories: Optional[List[str]] = None,
    direction: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
    tags: Optional[List[str]] = None,
    source: Optional[str] = None,
    bank_pairs: Optional[List[Tuple[str, str]]] = None,
) -> Dict[str, Any]:
    """Total spend and card-wise breakdown (split by currency when needed)."""
    by_cur = compute_net_spend_by_currency(
        db,
        from_date=from_date,
        to_date=to_date,
        card_ids=card_ids,
        categories=categories,
        direction=direction,
        amount_min=amount_min,
        amount_max=amount_max,
        tags=tags,
        source=source,
        bank_pairs=bank_pairs,
    )
    n = len(by_cur)
    if n == 0:
        total_spend: Optional[float] = 0.0
    elif n == 1:
        total_spend = by_cur[0]["amount"]
    else:
        total_spend = None

    card_q = (
        db.query(
            Transaction.bank,
            Transaction.card_last4,
            Transaction.currency,
            func.sum(
                case(
                    (Transaction.type == "debit", Transaction.amount),
                    else_=-Transaction.amount,
                )
            ).label("net_spend"),
            func.count(Transaction.id).label("count"),
        )
        .filter(Transaction.category != "cc_payment")
    )
    card_q = _date_filter(card_q, from_date, to_date)
    card_q = apply_source_account_filters(card_q, source, card_ids, bank_pairs or [])
    card_q = _apply_filters(card_q, categories, direction, amount_min, amount_max, tags)
    card_rows = card_q.group_by(Transaction.bank, Transaction.card_last4, Transaction.currency).all()

    return {
        "total_spend": total_spend,
        "total_spend_by_currency": by_cur,
        "mixed_currency": n > 1,
        "card_breakdown": [
            {
                "bank": r.bank,
                "card_last4": r.card_last4,
                "currency": (r.currency or "INR").upper()[:3],
                "spend": float(Decimal(str(r.net_spend or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
                "count": r.count,
            }
            for r in card_rows
        ],
    }


def get_category_breakdown(
    db: Session,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    card_ids: Optional[List[str]] = None,
    categories: Optional[List[str]] = None,
    direction: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
    tags: Optional[List[str]] = None,
    source: Optional[str] = None,
    bank_pairs: Optional[List[Tuple[str, str]]] = None,
) -> Dict[str, Any]:
    """Category amounts and percentages (per currency when multiple)."""
    q = (
        db.query(
            Transaction.currency,
            Transaction.category,
            func.sum(Transaction.amount).label("amount"),
            func.count(Transaction.id).label("count"),
        )
        .filter(Transaction.category != "cc_payment")
    )
    if direction == "incoming":
        q = q.filter(Transaction.type == "credit")
    else:
        q = q.filter(Transaction.type == "debit")
    q = _date_filter(q, from_date, to_date)
    q = apply_source_account_filters(q, source, card_ids, bank_pairs or [])
    q = _apply_filters(q, categories, direction, amount_min, amount_max, tags)
    rows = q.group_by(Transaction.currency, Transaction.category).all()

    distinct_cur = {(r.currency or "INR").upper()[:3] for r in rows}
    if len(distinct_cur) <= 1:
        cur = "INR"
        if len(distinct_cur) == 1:
            cur = next(iter(distinct_cur))
        total_decimal = sum((Decimal(str(r.amount or 0)) for r in rows), Decimal(0))
        total_float = float(total_decimal.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        categories = [
            {
                "category": r.category,
                "amount": float(Decimal(str(r.amount or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
                "percentage": float((Decimal(str(r.amount or 0)) / total_decimal * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)) if total_decimal else 0,
                "count": r.count,
            }
            for r in rows
        ]
        return {
            "mixed_currency": False,
            "currency": cur,
            "total": total_float,
            "categories": categories,
        }

    by_currency: Dict[str, List[Any]] = {}
    for r in rows:
        c = (r.currency or "INR").upper()[:3]
        by_currency.setdefault(c, []).append(r)

    parts: List[Dict[str, Any]] = []
    for cur in sorted(by_currency):
        sub = by_currency[cur]
        total_decimal = sum((Decimal(str(r.amount or 0)) for r in sub), Decimal(0))
        total_float = float(total_decimal.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        parts.append({
            "currency": cur,
            "total": total_float,
            "categories": [
                {
                    "category": r.category,
                    "amount": float(Decimal(str(r.amount or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
                    "percentage": float((Decimal(str(r.amount or 0)) / total_decimal * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)) if total_decimal else 0,
                    "count": r.count,
                }
                for r in sub
            ],
        })
    return {"mixed_currency": True, "by_currency": parts}


def get_monthly_trends(
    db: Session,
    months: int = 12,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    card_ids: Optional[List[str]] = None,
    categories: Optional[List[str]] = None,
    direction: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
    tags: Optional[List[str]] = None,
    source: Optional[str] = None,
    bank_pairs: Optional[List[Tuple[str, str]]] = None,
) -> Dict[str, Any]:
    """Monthly net spend aggregation (debits − non-cc credits), split by currency when mixed."""
    end = to_date or date.today()
    start = from_date or (end - timedelta(days=months * 31))

    month_expr = func.strftime("%Y-%m", Transaction.date)
    q = (
        db.query(
            month_expr.label("month"),
            Transaction.currency,
            func.sum(
                case(
                    (Transaction.type == "debit", Transaction.amount),
                    else_=-Transaction.amount,
                )
            ).label("spend"),
        )
        .filter(Transaction.category != "cc_payment")
        .filter(Transaction.date >= start)
        .filter(Transaction.date <= end)
    )
    q = apply_source_account_filters(q, source, card_ids, bank_pairs or [])
    q = _apply_filters(q, categories, direction, amount_min, amount_max, tags)
    rows = q.group_by(month_expr, Transaction.currency).order_by("month").all()

    distinct_cur = {(r.currency or "INR").upper()[:3] for r in rows}
    if len(distinct_cur) <= 1:
        cur = "INR"
        if len(distinct_cur) == 1:
            cur = next(iter(distinct_cur))
        return {
            "mixed_currency": False,
            "currency": cur,
            "trends": [
                {
                    "month": r.month,
                    "spend": float(Decimal(str(r.spend or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
                }
                for r in rows
            ],
        }

    by_cur: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        c = (r.currency or "INR").upper()[:3]
        by_cur.setdefault(c, []).append({
            "month": r.month,
            "spend": float(Decimal(str(r.spend or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        })
    for c in by_cur:
        by_cur[c].sort(key=lambda x: x["month"])
    return {
        "mixed_currency": True,
        "trends_by_currency": [
            {"currency": c, "trends": by_cur[c]} for c in sorted(by_cur)
        ],
    }


def get_top_merchants(
    db: Session,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    card_ids: Optional[List[str]] = None,
    categories: Optional[List[str]] = None,
    direction: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
    tags: Optional[List[str]] = None,
    limit: int = 10,
    source: Optional[str] = None,
    bank_pairs: Optional[List[Tuple[str, str]]] = None,
) -> Dict[str, Any]:
    """Top merchants by spend (per currency when multiple)."""
    q = (
        db.query(
            Transaction.currency,
            Transaction.merchant,
            func.sum(Transaction.amount).label("spend"),
            func.count(Transaction.id).label("count"),
        )
        .filter(Transaction.category != "cc_payment")
    )
    if direction == "incoming":
        q = q.filter(Transaction.type == "credit")
    else:
        q = q.filter(Transaction.type == "debit")
    q = _date_filter(q, from_date, to_date)
    q = apply_source_account_filters(q, source, card_ids, bank_pairs or [])
    q = _apply_filters(q, categories, direction, amount_min, amount_max, tags)
    rows = q.group_by(Transaction.currency, Transaction.merchant).all()

    distinct_cur = {(r.currency or "INR").upper()[:3] for r in rows}
    if len(distinct_cur) <= 1:
        cur = "INR"
        if len(distinct_cur) == 1:
            cur = next(iter(distinct_cur))
        sub = sorted(
            rows,
            key=lambda r: float(r.spend or 0),
            reverse=True,
        )[:limit]
        return {
            "mixed_currency": False,
            "currency": cur,
            "merchants": [
                {
                    "merchant": r.merchant,
                    "amount": float(Decimal(str(r.spend or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
                    "count": r.count,
                }
                for r in sub
            ],
        }

    by_cur: Dict[str, List[Any]] = {}
    for r in rows:
        c = (r.currency or "INR").upper()[:3]
        by_cur.setdefault(c, []).append(r)

    merchants_by_currency: List[Dict[str, Any]] = []
    for cur in sorted(by_cur):
        sub = sorted(by_cur[cur], key=lambda r: float(r.spend or 0), reverse=True)[:limit]
        merchants_by_currency.append({
            "currency": cur,
            "merchants": [
                {
                    "merchant": r.merchant,
                    "amount": float(Decimal(str(r.spend or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
                    "count": r.count,
                }
                for r in sub
            ],
        })
    return {"mixed_currency": True, "merchants_by_currency": merchants_by_currency}
