"""Shared transaction list / analytics scoping by source, cards, and bank accounts."""

from typing import List, Optional, Tuple

from sqlalchemy import and_, or_
from sqlalchemy.orm import Query

from backend.models.models import Transaction


def parse_bank_accounts_param(bank_accounts: Optional[str]) -> List[Tuple[str, str]]:
    """Parse `bank_accounts=hdfc:1234,icici:5678` into (bank_lower, last4) tuples."""
    if not bank_accounts or not bank_accounts.strip():
        return []
    out: List[Tuple[str, str]] = []
    for part in bank_accounts.split(","):
        part = part.strip()
        if ":" not in part:
            continue
        bank, last4 = part.split(":", 1)
        bank, last4 = bank.strip().lower(), last4.strip()
        if bank and last4:
            out.append((bank, last4))
    return out


def apply_source_account_filters(
    q: Query,
    source: Optional[str],
    card_ids: Optional[List[str]],
    bank_pairs: List[Tuple[str, str]],
) -> Query:
    """AND-filter query by global source + cards / bank accounts (union when source is ALL)."""
    src = (source or "all").upper()
    if src not in ("ALL", "CC", "BANK"):
        src = "ALL"

    if src == "CC":
        q = q.filter(Transaction.source == "CC")
        if card_ids:
            q = q.filter(Transaction.card_id.in_(card_ids))
        return q

    if src == "BANK":
        q = q.filter(Transaction.source == "BANK")
        if bank_pairs:
            conds = [
                and_(Transaction.bank == b, Transaction.card_last4 == l4) for b, l4 in bank_pairs
            ]
            q = q.filter(or_(*conds))
        return q

    # ALL — union semantics when both dimensions are used
    has_cards = bool(card_ids)
    has_banks = bool(bank_pairs)
    if has_cards and has_banks:
        card_cond = and_(Transaction.source == "CC", Transaction.card_id.in_(card_ids))
        bank_conds = [
            and_(Transaction.source == "BANK", Transaction.bank == b, Transaction.card_last4 == l4)
            for b, l4 in bank_pairs
        ]
        q = q.filter(or_(card_cond, or_(*bank_conds)))
    elif has_cards:
        q = q.filter(and_(Transaction.source == "CC", Transaction.card_id.in_(card_ids)))
    elif has_banks:
        bank_conds = [
            and_(Transaction.source == "BANK", Transaction.bank == b, Transaction.card_last4 == l4)
            for b, l4 in bank_pairs
        ]
        q = q.filter(or_(*bank_conds))
    return q
