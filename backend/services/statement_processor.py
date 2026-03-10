"""Statement processing orchestrator."""

import hashlib
import logging
import os
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Callable, Dict, Optional, Type

from sqlalchemy.orm import Session

from backend.models.database import SessionLocal
from backend.models.models import Card, Statement, Settings, Transaction
from backend.services.categorizer import categorize
from backend.services.pdf_unlock import _validate_pdf_path, generate_passwords, is_encrypted, unlock_pdf

logger = logging.getLogger(__name__)


def _get_parsers() -> Dict[str, Type]:
    """Lazy-load parsers (and thus pdfplumber) only when processing is triggered."""
    from backend.parsers.axis import AxisParser
    from backend.parsers.federal import FederalBankParser
    from backend.parsers.generic import GenericParser
    from backend.parsers.hdfc import HDFCParser
    from backend.parsers.idfc_first import IDFCFirstBankParser
    from backend.parsers.icici import ICICIParser
    from backend.parsers.indian_bank import IndianBankParser

    return {
        "hdfc": HDFCParser,
        "icici": ICICIParser,
        "axis": AxisParser,
        "federal": FederalBankParser,
        "indian_bank": IndianBankParser,
        "idfc_first": IDFCFirstBankParser,
    }


SUPPORTED_BANKS = [
    "hdfc", "icici", "axis", "sbi", "amex", "idfc_first",
    "indusind", "kotak", "sc", "yes", "au", "rbl",
    "federal", "indian_bank",
]


def _compute_hash(file_path: str) -> str:
    """Compute SHA-256 hash of file for deduplication."""
    sha = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha.update(chunk)
    return sha.hexdigest()


def _get_user_profile(db: Session) -> Optional[Settings]:
    """Load user settings from DB."""
    return db.query(Settings).first()


def _get_card_last4s(db: Session, bank: Optional[str] = None) -> list:
    """Get list of card last4 digits for password generation. Filter by bank if provided."""
    cards = db.query(Card).all()
    if bank:
        cards = [c for c in cards if c.bank.lower() == bank.lower()]
    return [c.last4 for c in cards]


def process_statement(
    pdf_path: str,
    bank: Optional[str] = None,
    db_session: Optional[Session] = None,
    db_session_factory: Optional[Callable] = None,
    manual_password: Optional[str] = None,
) -> Dict:
    """
    Process a statement PDF: unlock, parse, categorize, persist.
    Returns summary dict { status, count, period, bank }.
    """
    close_session = False
    if db_session is None and db_session_factory:
        db_session = db_session_factory()
        close_session = True
    elif db_session is None:
        db_session = SessionLocal()
        close_session = True

    working_path = pdf_path  # may be reassigned to a temp unlocked file

    try:
        if not os.path.isfile(pdf_path):
            return {"status": "error", "message": "File not found", "count": 0}
        if not _validate_pdf_path(pdf_path):
            return {"status": "error", "message": "Invalid file path", "count": 0}

        file_hash = _compute_hash(pdf_path)

        # Check for duplicate
        existing = db_session.query(Statement).filter(Statement.file_hash == file_hash).first()
        if existing:
            return {
                "status": "duplicate",
                "message": "Statement already imported",
                "count": 0,
                "period": None,
                "bank": None,
            }

        # Detect bank if not provided
        if not bank:
            from backend.parsers.detector import detect_bank

            bank = detect_bank(pdf_path)

        profile = _get_user_profile(db_session)
        card_last4s = _get_card_last4s(db_session, bank=bank) if bank else _get_card_last4s(db_session)
        working_path = pdf_path
        encrypted = is_encrypted(pdf_path)

        if encrypted and manual_password:
            unlocked = unlock_pdf(pdf_path, [manual_password])
            if unlocked:
                working_path = unlocked
                if not bank:
                    from backend.parsers.detector import detect_bank

                    detected = detect_bank(working_path)
                    if detected and detected in SUPPORTED_BANKS:
                        bank = detected
            else:
                return {
                    "status": "error",
                    "message": "Could not unlock PDF with provided password",
                    "count": 0,
                }
        elif encrypted and profile:
            if bank:
                # Detected bank — try its passwords (works for dedicated and generic banks)
                passwords = generate_passwords(
                    bank=bank,
                    name=profile.name,
                    dob_day=profile.dob_day or "",
                    dob_month=profile.dob_month or "",
                    card_last4s=card_last4s,
                    dob_year=profile.dob_year or "",
                )
                unlocked = unlock_pdf(pdf_path, passwords)
                if unlocked:
                    working_path = unlocked
                else:
                    return {
                        "status": "error",
                        "message": "Could not unlock PDF - wrong password",
                        "count": 0,
                    }
            else:
                # Bank unknown — try every supported bank's passwords until one works
                unlocked = None
                for try_bank in SUPPORTED_BANKS:
                    try_card_last4s = _get_card_last4s(db_session, bank=try_bank)
                    passwords = generate_passwords(
                        bank=try_bank,
                        name=profile.name,
                        dob_day=profile.dob_day or "",
                        dob_month=profile.dob_month or "",
                        card_last4s=try_card_last4s,
                        dob_year=profile.dob_year or "",
                    )
                    unlocked = unlock_pdf(pdf_path, passwords)
                    if unlocked:
                        bank = try_bank
                        working_path = unlocked
                        logger.info("Unlocked with bank=%s passwords", try_bank)
                        break

                if not unlocked:
                    return {
                        "status": "error",
                        "message": "Could not unlock PDF - tried all bank password formats",
                        "count": 0,
                    }

                # Confirm bank from PDF content now that it's unlocked
                from backend.parsers.detector import detect_bank

                detected = detect_bank(working_path)
                if detected and detected in SUPPORTED_BANKS:
                    bank = detected

        if not bank:
            return {
                "status": "error",
                "message": "Could not detect bank",
                "count": 0,
            }

        # Early card check: skip before parsing if no cards from this
        # bank are registered at all — avoids wasting time on PDF parsing.
        registered_cards = db_session.query(Card).filter(Card.bank == bank).all()
        if not registered_cards:
            logger.warning(
                "Skipping statement — no %s cards registered", bank,
            )
            return {
                "status": "card_not_found",
                "message": (
                    f"No {bank.upper()} cards have been added yet. "
                    f"Add your card in Settings to process these statements."
                ),
                "count": 0,
                "period": None,
                "bank": bank,
                "card_last4": None,
            }

        # Parse — use dedicated parser if available, else generic
        from backend.parsers.generic import GenericParser

        parsers = _get_parsers()
        if bank in parsers:
            parser = parsers[bank]()
        else:
            parser = GenericParser(bank=bank)
        parsed = parser.parse(working_path)

        # Resolve card_last4 from parsed data or registered cards
        card_last4 = getattr(parsed, "card_last4", None)
        card_id = None
        if card_last4:
            card = db_session.query(Card).filter(
                Card.bank == bank, Card.last4 == card_last4
            ).first()
            if card:
                card_id = card.id
            else:
                logger.warning(
                    "Skipping statement — card %s ...%s is not registered",
                    bank, card_last4,
                )
                return {
                    "status": "card_not_found",
                    "message": (
                        f"Statement belongs to {bank.upper()} card ending "
                        f"...{card_last4} which has not been added yet. "
                        f"Add this card in Settings to process these statements."
                    ),
                    "count": 0,
                    "period": None,
                    "bank": bank,
                    "card_last4": card_last4,
                }
        else:
            if len(registered_cards) == 1:
                card_last4 = registered_cards[0].last4
                card_id = registered_cards[0].id
            else:
                logger.warning(
                    "Skipping statement — parser could not determine card and "
                    "multiple %s cards are registered",
                    bank,
                )
                return {
                    "status": "card_not_found",
                    "message": (
                        f"Could not determine which {bank.upper()} card this "
                        f"statement belongs to. Multiple cards are registered "
                        f"for this bank."
                    ),
                    "count": 0,
                    "period": None,
                    "bank": bank,
                    "card_last4": None,
                }

        # Detect parse failures: if the parser returned nothing useful,
        # record the statement with status='parse_error' so the file hash
        # prevents re-processing, while keeping it visible for user action.
        is_parse_error = (
            len(parsed.transactions) == 0
            and parsed.period_start is None
            and parsed.period_end is None
        )

        if is_parse_error:
            statement = Statement(
                bank=bank,
                card_last4=card_last4,
                period_start=None,
                period_end=None,
                file_hash=file_hash,
                file_path=pdf_path,
                transaction_count=0,
                total_spend=0.0,
                total_amount_due=getattr(parsed, "total_amount_due", None),
                credit_limit=getattr(parsed, "credit_limit", None),
                status="parse_error",
            )
            db_session.add(statement)
            db_session.commit()

            logger.warning(
                "Parse error for %s (%s ...%s): no transactions or period extracted",
                pdf_path, bank, card_last4,
            )
            return {
                "status": "parse_error",
                "message": (
                    f"Could not extract transactions from this {bank.upper()} statement. "
                    f"The PDF format may not be supported yet."
                ),
                "count": 0,
                "period": None,
                "bank": bank,
            }

        # Create Statement record
        total_decimal = sum(
            (Decimal(str(t.amount)) for t in parsed.transactions if t.type == "debit"),
            Decimal(0),
        )
        total_spend = float(total_decimal.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        statement = Statement(
            bank=bank,
            card_last4=card_last4,
            period_start=parsed.period_start,
            period_end=parsed.period_end,
            file_hash=file_hash,
            file_path=pdf_path,
            transaction_count=len(parsed.transactions),
            total_spend=total_spend,
            total_amount_due=getattr(parsed, "total_amount_due", None),
            credit_limit=getattr(parsed, "credit_limit", None),
            status="success",
        )
        db_session.add(statement)
        db_session.flush()

        # Insert transactions
        for pt in parsed.transactions:
            category = categorize(pt.merchant, db_session=db_session)
            tx = Transaction(
                statement_id=statement.id,
                date=pt.date,
                merchant=pt.merchant,
                amount=pt.amount,
                type=pt.type,
                category=category,
                description=pt.description,
                bank=bank,
                card_last4=card_last4,
                card_id=card_id,
            )
            db_session.add(tx)

        db_session.commit()

        return {
            "status": "success",
            "count": len(parsed.transactions),
            "period": {
                "start": parsed.period_start.isoformat() if parsed.period_start else None,
                "end": parsed.period_end.isoformat() if parsed.period_end else None,
            },
            "bank": bank,
        }

    except Exception as e:
        logger.exception("Statement processing failed: %s", e)
        if db_session:
            db_session.rollback()
        return {
            "status": "error",
            "message": "An internal error occurred while processing the statement",
            "count": 0,
            "period": None,
            "bank": bank,
        }
    finally:
        # Always clean up temp unlocked PDF
        if working_path != pdf_path and os.path.isfile(working_path):
            try:
                os.remove(working_path)
            except OSError:
                pass
        if close_session and db_session:
            db_session.close()
