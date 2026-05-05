"""Eligibility and persistence for payment due reminders (local-first)."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import desc
from sqlalchemy.orm import Session

from backend.models.models import Card, DueReminderAck, Settings, Statement

# Start showing from N calendar days before due (until user marks paid).
REMINDER_DAYS_BEFORE_DUE = 7


def latest_cc_statement_for_card(db: Session, card: Card) -> Optional[Statement]:
    """Latest successful credit-card statement for this bank + last4."""
    return (
        db.query(Statement)
        .filter(
            Statement.bank == card.bank,
            Statement.card_last4 == card.last4,
            Statement.source == "CC",
            Statement.status == "success",
        )
        .order_by(
            Statement.period_end.desc().nulls_last(),
            desc(Statement.imported_at),
            desc(Statement.id),
        )
        .first()
    )


def effective_due_date(card: Card, latest: Optional[Statement]) -> Optional[date]:
    if getattr(card, "manual_next_due_date", None):
        return card.manual_next_due_date
    if latest and latest.payment_due_date:
        return latest.payment_due_date
    return None


def effective_amount_due(card: Card, latest: Optional[Statement]) -> Optional[float]:
    if getattr(card, "manual_next_due_amount", None) is not None:
        return card.manual_next_due_amount
    if latest and latest.total_amount_due is not None:
        return latest.total_amount_due
    return None


def in_reminder_window(today: date, due: date) -> bool:
    """True from (due - REMINDER_DAYS_BEFORE_DUE) onward until acked."""
    start = due - timedelta(days=REMINDER_DAYS_BEFORE_DUE)
    return today >= start


def has_ack_for_latest(db: Session, card: Card, latest: Optional[Statement]) -> bool:
    if not latest:
        return False
    row = (
        db.query(DueReminderAck)
        .filter(
            DueReminderAck.card_id == card.id,
            DueReminderAck.statement_id == latest.id,
        )
        .first()
    )
    return row is not None


def has_manual_cycle_ack(card: Card) -> bool:
    """Manual-only reminder marked paid for the current manual due date."""
    if not getattr(card, "manual_next_due_date", None):
        return False
    ack = getattr(card, "manual_due_acknowledged_for", None)
    return bool(ack and ack == card.manual_next_due_date)


def build_reminder_item(
    db: Session, card: Card, today: date
) -> Optional[Dict[str, Any]]:
    latest = latest_cc_statement_for_card(db, card)
    due = effective_due_date(card, latest)
    if due is None:
        return None
    if not in_reminder_window(today, due):
        return None
    if latest and has_ack_for_latest(db, card, latest):
        return None
    if not latest and has_manual_cycle_ack(card):
        return None

    amt = effective_amount_due(card, latest)
    cur = (latest.currency if latest else None) or "INR"
    return {
        "cardId": card.id,
        "bank": card.bank,
        "cardLast4": card.last4,
        "statementId": latest.id if latest else None,
        "dueDate": due.isoformat(),
        "totalAmountDue": amt,
        "currency": cur[:3].upper() if isinstance(cur, str) else "INR",
        "usesManualDueDate": bool(getattr(card, "manual_next_due_date", None)),
    }


def list_eligible_reminders(db: Session, today: date) -> List[Dict[str, Any]]:
    """All registered cards with an eligible unpaid reminder for `today`."""
    cards = db.query(Card).all()
    out: List[Dict[str, Any]] = []
    for c in cards:
        item = build_reminder_item(db, c, today)
        if item:
            out.append(item)
    # Earliest due first
    out.sort(key=lambda x: x["dueDate"])
    return out


def should_auto_open_modal(db: Session, local_date_str: str) -> bool:
    """First auto-open per local calendar day when there is something to show."""
    items = list_eligible_reminders(db, date.fromisoformat(local_date_str))
    if not items:
        return False
    s = db.query(Settings).first()
    last = getattr(s, "payment_reminder_last_auto_shown", None) if s else None
    return last != local_date_str


def record_auto_shown(db: Session, local_date_str: str) -> None:
    s = db.query(Settings).first()
    if not s:
        s = Settings()
        db.add(s)
    s.payment_reminder_last_auto_shown = local_date_str
    db.commit()


def acknowledge_paid(db: Session, card_id: str) -> Tuple[bool, Optional[str]]:
    """Mark paid for the current latest CC statement, or manual-only cycle."""
    card = db.query(Card).filter(Card.id == card_id).first()
    if not card:
        return False, "Card not found"
    latest = latest_cc_statement_for_card(db, card)

    if latest:
        existing = (
            db.query(DueReminderAck)
            .filter(
                DueReminderAck.card_id == card.id,
                DueReminderAck.statement_id == latest.id,
            )
            .first()
        )
        if existing:
            db.commit()
            return True, None

        db.add(
            DueReminderAck(
                card_id=card.id,
                statement_id=latest.id,
                acknowledged_at=datetime.utcnow(),
            )
        )
        db.commit()
        return True, None

    if getattr(card, "manual_next_due_date", None):
        card.manual_due_acknowledged_for = card.manual_next_due_date
        db.commit()
        return True, None

    return False, "No credit card statement for this card"
