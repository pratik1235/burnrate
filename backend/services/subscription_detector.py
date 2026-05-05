"""Subscription and recurring payment detection service."""

import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models.models import Transaction
from backend.services.transaction_query import apply_source_account_filters

logger = logging.getLogger(__name__)

# Configuration
AMOUNT_VARIANCE_THRESHOLD = 0.10  # 10% variance allowed
MIN_OCCURRENCES = 2  # Minimum transactions to consider a subscription
INTERVAL_TOLERANCE_DAYS = 3  # Allow +/- 3 days for interval matching


def _calculate_interval_days(dates: List[date]) -> Optional[int]:
    """Calculate average interval between dates in days."""
    if len(dates) < 2:
        return None

    intervals = []
    sorted_dates = sorted(dates)
    for i in range(len(sorted_dates) - 1):
        delta = (sorted_dates[i + 1] - sorted_dates[i]).days
        intervals.append(delta)

    if not intervals:
        return None

    avg_interval = sum(intervals) / len(intervals)
    return int(avg_interval)


def _classify_interval(interval_days: int) -> str:
    """Classify interval into frequency category."""
    if 7 - INTERVAL_TOLERANCE_DAYS <= interval_days <= 7 + INTERVAL_TOLERANCE_DAYS:
        return "weekly"
    elif 14 - INTERVAL_TOLERANCE_DAYS <= interval_days <= 14 + INTERVAL_TOLERANCE_DAYS:
        return "biweekly"
    elif 28 - INTERVAL_TOLERANCE_DAYS <= interval_days <= 31 + INTERVAL_TOLERANCE_DAYS:
        return "monthly"
    elif 90 - 7 <= interval_days <= 92 + 7:
        return "quarterly"
    elif 180 - 14 <= interval_days <= 182 + 14:
        return "half-yearly"
    elif 365 - 30 <= interval_days <= 366 + 30:
        return "yearly"
    else:
        return f"every-{interval_days}-days"


def _amounts_similar(amounts: List[float], threshold: float = AMOUNT_VARIANCE_THRESHOLD) -> bool:
    """Check if amounts are within variance threshold."""
    if len(amounts) < 2:
        return True

    avg = sum(amounts) / len(amounts)
    for amt in amounts:
        variance = abs(amt - avg) / avg if avg > 0 else 0
        if variance > threshold:
            return False

    return True


def detect_subscriptions(
    db: Session,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    card_ids: Optional[List[str]] = None,
    source: Optional[str] = None,
    bank_pairs: Optional[List[Tuple[str, str]]] = None,
    min_amount: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """Detect potential subscriptions from transaction patterns.

    Args:
        db: Database session
        from_date: Start date for analysis
        to_date: End date for analysis
        card_ids: Filter by card IDs
        source: Filter by source (CC, BANK)
        bank_pairs: Filter by bank account pairs
        min_amount: Minimum transaction amount to consider

    Returns:
        List of detected subscriptions with merchant, frequency, amount, etc.
    """
    # Default to last 12 months if no date range provided
    if not to_date:
        to_date = date.today()
    if not from_date:
        from_date = to_date - timedelta(days=365)

    # Query all debit transactions in period (excluding cc_payment)
    q = (
        db.query(Transaction)
        .filter(Transaction.type == "debit")
        .filter(Transaction.category != "cc_payment")
        .filter(Transaction.date >= from_date)
        .filter(Transaction.date <= to_date)
    )

    if min_amount:
        q = q.filter(Transaction.amount >= min_amount)

    q = apply_source_account_filters(q, source, card_ids, bank_pairs or [])
    q = q.order_by(Transaction.merchant, Transaction.date)

    transactions = q.all()

    # Group by merchant
    by_merchant: Dict[str, List[Transaction]] = {}
    for txn in transactions:
        merchant = txn.merchant.strip()
        if merchant:
            by_merchant.setdefault(merchant, []).append(txn)

    # Analyze each merchant for subscription patterns
    subscriptions = []

    for merchant, txns in by_merchant.items():
        if len(txns) < MIN_OCCURRENCES:
            continue

        amounts = [float(t.amount) for t in txns]
        dates = [t.date for t in txns]

        # Check if amounts are similar
        if not _amounts_similar(amounts):
            continue

        # Calculate interval
        interval_days = _calculate_interval_days(dates)
        if not interval_days:
            continue

        frequency = _classify_interval(interval_days)

        # Calculate average amount
        avg_amount = sum(amounts) / len(amounts)
        avg_amount_decimal = Decimal(str(avg_amount)).quantize(Decimal("0.01"))

        # Get most recent transaction details
        latest_txn = max(txns, key=lambda t: t.date)

        subscriptions.append({
            "merchant": merchant,
            "frequency": frequency,
            "interval_days": interval_days,
            "avg_amount": float(avg_amount_decimal),
            "min_amount": min(amounts),
            "max_amount": max(amounts),
            "occurrences": len(txns),
            "first_date": min(dates).isoformat(),
            "last_date": max(dates).isoformat(),
            "currency": latest_txn.currency or "INR",
            "category": latest_txn.category,
            "bank": latest_txn.bank,
            "card_last4": latest_txn.card_last4,
            "source": latest_txn.source,
        })

    # Sort by average amount (descending)
    subscriptions.sort(key=lambda x: x["avg_amount"], reverse=True)

    logger.info(
        "Subscription detection: found %d subscriptions from %d merchants",
        len(subscriptions), len(by_merchant)
    )

    return subscriptions
