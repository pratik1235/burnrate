"""Analytics API endpoints."""

from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.models.database import get_db
from backend.models.models import Statement
from backend.services.analytics import (
    compute_net_spend,
    get_category_breakdown,
    get_monthly_trends,
    get_summary,
    get_top_merchants,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _months_in_range(from_date: Optional[date], to_date: Optional[date]) -> int:
    """Count the number of calendar months spanned by a date range."""
    if not from_date or not to_date:
        return 1
    return max(
        (to_date.year - from_date.year) * 12 + (to_date.month - from_date.month) + 1,
        1,
    )


def _parse_filter_params(
    cards: Optional[str] = None,
    categories: Optional[str] = None,
    direction: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
    tags: Optional[str] = None,
):
    card_ids = [c.strip() for c in cards.split(",") if c.strip()] if cards else None
    category_list = [c.strip() for c in categories.split(",") if c.strip()] if categories else None
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else None
    return card_ids, category_list, direction, amount_min, amount_max, tag_list


@router.get("/summary")
def analytics_summary(
    db: Session = Depends(get_db),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    cards: Optional[str] = Query(None, description="Comma-separated card UUIDs"),
    categories: Optional[str] = Query(None, description="Comma-separated category slugs"),
    direction: Optional[str] = Query(None, description="incoming or outgoing"),
    amount_min: Optional[float] = Query(None),
    amount_max: Optional[float] = Query(None),
    tags: Optional[str] = Query(None, description="Comma-separated tag names"),
) -> Dict[str, Any]:
    """Total spend, delta %, sparkline data, avg monthly spend."""
    card_ids, category_list, direction, amount_min, amount_max, tag_list = _parse_filter_params(
        cards, categories, direction, amount_min, amount_max, tags
    )
    summary = get_summary(
        db,
        from_date=from_date,
        to_date=to_date,
        card_ids=card_ids,
        categories=category_list,
        direction=direction,
        amount_min=amount_min,
        amount_max=amount_max,
        tags=tag_list,
    )
    total_spend = summary["total_spend"]

    # Compute delta % relative to filter range.
    # Compare the selected period to an equivalent prior period.
    if from_date and to_date:
        span = (to_date - from_date).days
        prev_end = from_date - timedelta(days=1)
        prev_start = prev_end - timedelta(days=span)
        current_spend = total_spend
        period_label = "vs prior period"
    else:
        today = date.today()
        this_month_start = today.replace(day=1)
        last_month_end = this_month_start - timedelta(days=1)
        last_month_start = last_month_end.replace(day=1)
        current_spend = compute_net_spend(
            db,
            this_month_start,
            today,
            card_ids=card_ids,
            categories=category_list,
            direction=direction,
            amount_min=amount_min,
            amount_max=amount_max,
            tags=tag_list,
        )
        prev_start = last_month_start
        prev_end = last_month_end
        period_label = "vs last month"

    prev_spend = compute_net_spend(
        db,
        prev_start,
        prev_end,
        card_ids=card_ids,
        categories=category_list,
        direction=direction,
        amount_min=amount_min,
        amount_max=amount_max,
        tags=tag_list,
    )

    delta = (
        int((Decimal(str(current_spend)) - Decimal(str(prev_spend))) / Decimal(str(prev_spend)) * 100)
        if prev_spend > 0
        else 0
    )

    trends = get_monthly_trends(db, months=6)
    sparkline = [{"value": t["spend"]} for t in trends]

    statements = (
        db.query(Statement.bank, Statement.card_last4, Statement.credit_limit, Statement.period_end, Statement.imported_at)
        .filter(Statement.credit_limit.isnot(None))
        .all()
    )
    by_card: Dict[tuple, tuple] = {}
    for bank, card_last4, credit_limit_val, period_end, imported_at in statements:
        key = (bank or "", card_last4 or "")
        recency = (period_end or date.min, imported_at or datetime.min)
        if key not in by_card or recency > (by_card[key][0] or date.min, by_card[key][1] or datetime.min):
            by_card[key] = (period_end or date.min, imported_at or datetime.min, credit_limit_val or 0)
    credit_limit = float(
        sum((Decimal(str(v[2])) for v in by_card.values()), Decimal(0)).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
    )

    months = _months_in_range(from_date, to_date)
    avg_monthly_spend = float((Decimal(str(total_spend)) / Decimal(months)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)) if months else 0

    return {
        "totalSpend": total_spend,
        "deltaPercent": delta,
        "deltaLabel": period_label,
        "period": "This month",
        "sparklineData": sparkline if sparkline else [{"value": 0}],
        "cardBreakdown": [
            {"bank": c["bank"], "last4": c["card_last4"], "amount": c["spend"], "count": c.get("count", 0)}
            for c in summary["card_breakdown"]
        ],
        "creditLimit": credit_limit,
        "avgMonthlySpend": avg_monthly_spend,
        "monthsInRange": months,
    }


@router.get("/categories")
def analytics_categories(
    db: Session = Depends(get_db),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    cards: Optional[str] = Query(None, description="Comma-separated card UUIDs"),
    categories: Optional[str] = Query(None, description="Comma-separated category slugs"),
    direction: Optional[str] = Query(None, description="incoming or outgoing"),
    amount_min: Optional[float] = Query(None),
    amount_max: Optional[float] = Query(None),
    tags: Optional[str] = Query(None, description="Comma-separated tag names"),
) -> Dict[str, Any]:
    """Category breakdown."""
    card_ids, category_list, direction, amount_min, amount_max, tag_list = _parse_filter_params(
        cards, categories, direction, amount_min, amount_max, tags
    )
    result = get_category_breakdown(
        db,
        from_date=from_date,
        to_date=to_date,
        card_ids=card_ids,
        categories=category_list,
        direction=direction,
        amount_min=amount_min,
        amount_max=amount_max,
        tags=tag_list,
    )
    return {
        "breakdown": [
            {
                "category": c["category"],
                "amount": c["amount"],
                "percentage": c["percentage"],
                "count": c["count"],
            }
            for c in result["categories"]
        ],
    }


@router.get("/trends")
def analytics_trends(
    db: Session = Depends(get_db),
    months: int = Query(12, ge=1, le=24),
) -> Dict[str, Any]:
    """Monthly trends."""
    data = get_monthly_trends(db, months=months)
    return {
        "trends": [{"month": t["month"], "spend": t["spend"]} for t in data],
    }


@router.get("/merchants")
def analytics_merchants(
    db: Session = Depends(get_db),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    cards: Optional[str] = Query(None, description="Comma-separated card UUIDs"),
    categories: Optional[str] = Query(None, description="Comma-separated category slugs"),
    direction: Optional[str] = Query(None, description="incoming or outgoing"),
    amount_min: Optional[float] = Query(None),
    amount_max: Optional[float] = Query(None),
    tags: Optional[str] = Query(None, description="Comma-separated tag names"),
    limit: int = Query(10, ge=1, le=50),
) -> Dict[str, Any]:
    """Top merchants by spend."""
    card_ids, category_list, direction, amount_min, amount_max, tag_list = _parse_filter_params(
        cards, categories, direction, amount_min, amount_max, tags
    )
    data = get_top_merchants(
        db,
        from_date=from_date,
        to_date=to_date,
        card_ids=card_ids,
        categories=category_list,
        direction=direction,
        amount_min=amount_min,
        amount_max=amount_max,
        tags=tag_list,
        limit=limit,
    )
    return {
        "merchants": [
            {"merchant": m["merchant"], "amount": m["spend"], "count": m["count"]}
            for m in data
        ],
    }


@router.get("/statement-periods")
def statement_periods(
    db: Session = Depends(get_db),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
) -> Dict[str, Any]:
    """Return all statement periods with net spend computed per period."""
    q = db.query(Statement).filter(
        (Statement.status == "success") | (Statement.status.is_(None))
    )

    if from_date:
        q = q.filter(Statement.period_end >= from_date)
    if to_date:
        q = q.filter(Statement.period_start <= to_date)

    statements = q.order_by(Statement.period_start.desc()).all()

    periods = []
    for s in statements:
        if s.period_start and s.period_end:
            net_spend = compute_net_spend(
                db, s.period_start, s.period_end,
                bank=s.bank, card_last4=s.card_last4,
            )
        else:
            net_spend = s.total_spend
        periods.append({
            "bank": s.bank,
            "cardLast4": s.card_last4,
            "periodStart": s.period_start.isoformat() if s.period_start else None,
            "periodEnd": s.period_end.isoformat() if s.period_end else None,
            "totalAmountDue": s.total_amount_due,
            "totalSpend": net_spend,
            "creditLimit": s.credit_limit,
        })

    return {"periods": periods}
