"""Routes LLM tool calls to existing analytics and data services."""

import json
import logging
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from backend import config
from backend.models.models import Card, CategoryDefinition, Statement, Transaction
from backend.services.analytics import (
    get_category_breakdown,
    get_monthly_trends,
    get_summary,
    get_top_merchants,
)
from backend.services.transaction_query import apply_source_account_filters, parse_bank_accounts_param

logger = logging.getLogger(__name__)


def _parse_date(val: Optional[str]) -> Optional[date]:
    if not val:
        return None
    return date.fromisoformat(val)


def _parse_comma_list(val: Optional[str]) -> Optional[List[str]]:
    if not val or not val.strip():
        return None
    return [x.strip() for x in val.split(",") if x.strip()]


def _parse_filters(args: Dict[str, Any]) -> Dict[str, Any]:
    card_ids = _parse_comma_list(args.get("cards"))
    categories = _parse_comma_list(args.get("categories"))
    tags = _parse_comma_list(args.get("tags"))
    source = args.get("source")
    if source:
        source = source.strip().upper()
        if source == "ALL":
            source = None
    bank_pairs = parse_bank_accounts_param(args.get("bank_accounts"))
    return {
        "from_date": _parse_date(args.get("from_date")),
        "to_date": _parse_date(args.get("to_date")),
        "card_ids": card_ids,
        "categories": categories,
        "direction": args.get("direction"),
        "amount_min": args.get("amount_min"),
        "amount_max": args.get("amount_max"),
        "tags": tags,
        "source": source,
        "bank_pairs": bank_pairs,
    }


def _exec_query_transactions(args: Dict[str, Any], db: Session) -> Any:
    from backend.services.analytics import _date_filter, _apply_filters

    filters = _parse_filters(args)
    limit = min(int(args.get("limit", 50)), config.LLM_MAX_TRANSACTION_RESULTS)
    search = args.get("search")

    q = db.query(Transaction)
    q = _date_filter(q, filters["from_date"], filters["to_date"])
    q = apply_source_account_filters(
        q, filters["source"], filters["card_ids"], filters["bank_pairs"] or [],
    )
    q = _apply_filters(
        q, filters["categories"], filters["direction"],
        filters["amount_min"], filters["amount_max"], filters["tags"],
    )
    if search:
        escaped_search = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        q = q.filter(Transaction.merchant.ilike(f"%{escaped_search}%", escape="\\"))
    q = q.order_by(Transaction.date.desc()).limit(limit)
    txns = q.all()
    return [
        {
            "date": t.date.isoformat(),
            "merchant": t.merchant,
            "amount": t.amount,
            "type": t.type,
            "category": t.category,
            "currency": t.currency,
            "bank": t.bank,
            "card_last4": t.card_last4,
            "source": t.source,
        }
        for t in txns
    ]


def _exec_spend_summary(args: Dict[str, Any], db: Session) -> Any:
    f = _parse_filters(args)
    return get_summary(db, **f)


def _exec_category_breakdown(args: Dict[str, Any], db: Session) -> Any:
    f = _parse_filters(args)
    return get_category_breakdown(db, **f)


def _exec_monthly_trends(args: Dict[str, Any], db: Session) -> Any:
    f = _parse_filters(args)
    months = int(args.get("months", 12))
    return get_monthly_trends(db, months=months, **f)


def _exec_top_merchants(args: Dict[str, Any], db: Session) -> Any:
    f = _parse_filters(args)
    limit = int(args.get("limit", 10))
    return get_top_merchants(db, limit=limit, **f)


def _exec_list_cards(args: Dict[str, Any], db: Session) -> Any:
    q = db.query(Card)

    # Apply optional filters
    bank_filter = args.get("bank")
    if bank_filter:
        q = q.filter(Card.bank.ilike(f"%{bank_filter.strip()}%"))

    last4_filter = args.get("last4")
    if last4_filter:
        q = q.filter(Card.last4 == last4_filter.strip())

    cards = q.all()
    return [
        {"id": c.id, "bank": c.bank, "last4": c.last4, "name": c.name}
        for c in cards
    ]


def _exec_get_categories(args: Dict[str, Any], db: Session) -> Any:
    cats = db.query(CategoryDefinition).all()
    return [
        {"slug": c.slug, "name": c.name, "color": c.color}
        for c in cats
    ]


def _exec_statement_periods(args: Dict[str, Any], db: Session) -> Any:
    stmts = db.query(Statement).order_by(Statement.period_start).all()
    return [
        {
            "bank": s.bank,
            "card_last4": s.card_last4,
            "source": s.source,
            "period_start": s.period_start.isoformat() if s.period_start else None,
            "period_end": s.period_end.isoformat() if s.period_end else None,
            "transaction_count": s.transaction_count,
        }
        for s in stmts
    ]


def _exec_get_card_by_identifier(args: Dict[str, Any], db: Session) -> Any:
    """Look up a specific card by bank and/or last4."""
    bank = args.get("bank", "").strip().lower()
    last4 = args.get("last4", "").strip()

    if not bank and not last4:
        return {"error": "Must provide either bank name or last4 digits"}

    q = db.query(Card)

    if bank:
        q = q.filter(Card.bank.ilike(f"%{bank}%"))

    if last4:
        q = q.filter(Card.last4 == last4)

    cards = q.all()

    if not cards:
        return {"error": f"No card found for bank='{bank}' last4='{last4}'"}

    if len(cards) == 1:
        c = cards[0]
        return {
            "id": c.id,
            "bank": c.bank,
            "last4": c.last4,
            "name": c.name,
            "message": "Card found"
        }

    # Multiple matches - return all
    return {
        "message": f"Found {len(cards)} matching cards",
        "cards": [
            {"id": c.id, "bank": c.bank, "last4": c.last4, "name": c.name}
            for c in cards
        ]
    }


def _exec_detect_subscriptions(args: Dict[str, Any], db: Session) -> Any:
    from backend.services.subscription_detector import detect_subscriptions

    filters = _parse_filters(args)
    min_amount = args.get("min_amount")

    return detect_subscriptions(
        db,
        from_date=filters["from_date"],
        to_date=filters["to_date"],
        card_ids=filters["card_ids"],
        source=filters["source"],
        bank_pairs=filters["bank_pairs"],
        min_amount=min_amount,
    )


_TOOL_DISPATCH = {
    "query_transactions": _exec_query_transactions,
    "get_spend_summary": _exec_spend_summary,
    "get_category_breakdown": _exec_category_breakdown,
    "get_monthly_trends": _exec_monthly_trends,
    "get_top_merchants": _exec_top_merchants,
    "list_cards": _exec_list_cards,
    "get_card_by_identifier": _exec_get_card_by_identifier,
    "get_categories": _exec_get_categories,
    "get_statement_periods": _exec_statement_periods,
    "detect_subscriptions": _exec_detect_subscriptions,
}


def execute_tool(tool_name: str, arguments: Dict[str, Any], db: Session) -> Any:
    handler = _TOOL_DISPATCH.get(tool_name)
    if not handler:
        return {"error": f"Unknown tool: {tool_name}"}
    try:
        return handler(arguments, db)
    except Exception as e:
        logger.exception("Tool execution failed: %s", tool_name)
        return {"error": str(e)}
