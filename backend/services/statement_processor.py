"""Statement processing orchestrator."""

import hashlib
import logging
import os
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Callable, Dict, List, Optional, Type

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models.database import SessionLocal
from backend.models.models import Card, Statement, Settings, Transaction
from backend.services.categorizer import categorize
from backend.services.pdf_unlock import (
    _validate_pdf_path,
    allowed_roots_for_statements,
    generate_passwords,
    is_encrypted,
    unlock_pdf,
)

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".pdf", ".csv"}


def _parsed_currency(parsed) -> str:
    c = getattr(parsed, "currency", None) or "INR"
    if isinstance(c, str) and len(c) >= 3:
        return c[:3].upper()
    return "INR"


def _get_parsers() -> Dict[str, Type]:
    """Lazy-load PDF parsers (and thus pdfplumber) only when processing is triggered."""
    from backend.parsers.axis import AxisParser
    from backend.parsers.federal import FederalBankParser
    from backend.parsers.federal_scapia import ScapiaFederalParser
    from backend.parsers.generic import GenericParser
    from backend.parsers.hdfc import HDFCParser
    from backend.parsers.icici import ICICIParser
    from backend.parsers.idfc_first import IDFCFirstBankParser
    from backend.parsers.indian_bank import IndianBankParser

    return {
        "hdfc": HDFCParser,
        "icici": ICICIParser,
        "axis": AxisParser,
        "federal": FederalBankParser,
        "federal_scapia": ScapiaFederalParser,
        "indian_bank": IndianBankParser,
        "idfc_first": IDFCFirstBankParser,
    }


def _get_bank_csv_parsers() -> Dict[str, Type]:
    """Lazy-load bank account CSV parsers."""
    from backend.parsers.axis_bank_csv import AxisBankCSVParser
    from backend.parsers.hdfc_bank_csv import HDFCBankCSVParser
    from backend.parsers.icici_bank_csv import ICICIBankCSVParser
    from backend.parsers.sbi_bank_csv import SBIBankCSVParser

    return {
        "hdfc": HDFCBankCSVParser,
        "icici": ICICIBankCSVParser,
        "sbi": SBIBankCSVParser,
        "axis": AxisBankCSVParser,
    }


SUPPORTED_BANKS = [
    "hdfc", "icici", "axis", "sbi", "amex", "idfc_first",
    "indusind", "kotak", "sc", "yes", "au", "rbl",
    "federal", "federal_scapia", "indian_bank",
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


def _split_transactions_by_card(
    transactions: list,
    visa_last4: Optional[str],
    rupay_last4: Optional[str],
) -> Dict[str, list]:
    """Partition parsed transactions from a combined dual-card statement.

    Routing rules:
      - card_network='visa'  → VISA card's list
      - card_network='rupay' → RuPay card's list
      - card_network=None    → shared transactions (e.g. bill payment credits,
                               cashbacks with no logo).  Split proportionally
                               by each card's share of current-cycle debit spend.

    Shared transactions (card_network=None) are duplicated as two separate
    transactions (one per card) with amounts proportional to their debit share.
    Any rounding residual (≤ ₹0.01) is assigned to the primary card
    (whichever has the larger debit total).

    Returns {card_last4: [ParsedTransaction, ...]}.
    """
    import copy as _copy

    result: Dict[str, list] = {}
    if visa_last4:
        result[visa_last4] = []
    if rupay_last4:
        result[rupay_last4] = []

    # Compute each card's current-cycle debit total (for proportional split)
    visa_debits = Decimal("0")
    rupay_debits = Decimal("0")
    for tx in transactions:
        if tx.type == "debit":
            amt = Decimal(str(tx.amount))
            if getattr(tx, "card_network", None) == "visa":
                visa_debits += amt
            elif getattr(tx, "card_network", None) == "rupay":
                rupay_debits += amt

    total_debits = visa_debits + rupay_debits
    visa_ratio = visa_debits / total_debits if total_debits else Decimal("0")
    rupay_ratio = rupay_debits / total_debits if total_debits else Decimal("0")
    # Primary = card with more debits (receives rounding residual)
    primary_is_rupay = rupay_debits >= visa_debits

    for tx in transactions:
        network = getattr(tx, "card_network", None)
        if network == "visa" and visa_last4:
            result[visa_last4].append(tx)
        elif network == "rupay" and rupay_last4:
            result[rupay_last4].append(tx)
        else:
            # Shared transaction — split proportionally
            amt = Decimal(str(tx.amount))
            visa_share = (amt * visa_ratio).quantize(Decimal("0.01"), ROUND_HALF_UP)
            rupay_share = (amt * rupay_ratio).quantize(Decimal("0.01"), ROUND_HALF_UP)

            # Correct rounding so shares sum exactly to original
            remainder = amt - visa_share - rupay_share
            if remainder != Decimal("0"):
                if primary_is_rupay:
                    rupay_share += remainder
                else:
                    visa_share += remainder

            if visa_last4 and visa_share > Decimal("0"):
                visa_tx = _copy.copy(tx)
                visa_tx.amount = float(visa_share)
                result[visa_last4].append(visa_tx)

            if rupay_last4 and rupay_share > Decimal("0"):
                rupay_tx = _copy.copy(tx)
                rupay_tx.amount = float(rupay_share)
                result[rupay_last4].append(rupay_tx)

    return result


def _is_csv(file_path: str) -> bool:
    return file_path.lower().endswith(".csv")


def _create_password_needed_statement(
    db_session: Session,
    file_hash: str,
    file_path: str,
    bank: Optional[str],
    source: str,
    original_upload_path: Optional[str] = None,
) -> None:
    """Persist a minimal Statement record so that password-protected files
    appear in the Reparse/Remove UI for the user to supply a password."""
    stmt = Statement(
        bank=bank or "unknown",
        card_last4=None,
        period_start=None,
        period_end=None,
        file_hash=file_hash,
        file_path=file_path,
        original_upload_path=original_upload_path,
        transaction_count=0,
        total_spend=0.0,
        source=source,
        status="password_needed",
        parse_failed=0,
    )
    db_session.add(stmt)
    db_session.commit()


def process_statement(
    pdf_path: str,
    bank: Optional[str] = None,
    db_session: Optional[Session] = None,
    db_session_factory: Optional[Callable] = None,
    manual_password: Optional[str] = None,
    source: str = "CC",
    original_upload_path: Optional[str] = None,
    reparse_mode: bool = False,
    preserved_manual_categories: Optional[Dict[str, List[str]]] = None,
) -> Dict:
    """
    Process a statement file (PDF or CSV): unlock, parse, categorize, persist.
    Returns summary dict { status, count, period, bank }.

    Source is auto-determined from file type: CSV files are always treated as
    bank account statements (source=BANK), PDF files as credit card statements
    (source=CC).
    """
    close_session = False
    if db_session is None and db_session_factory:
        db_session = db_session_factory()
        close_session = True
    elif db_session is None:
        db_session = SessionLocal()
        close_session = True

    is_csv = _is_csv(pdf_path)
    if is_csv:
        source = "BANK"
    elif source == "BANK" and not is_csv:
        source = "CC"
    working_path = pdf_path

    try:
        if not os.path.isfile(pdf_path):
            return {"status": "error", "message": "File not found", "count": 0}
        roots = allowed_roots_for_statements(db_session)
        if not _validate_pdf_path(pdf_path, roots):
            return {"status": "error", "message": "Invalid file path", "count": 0}

        if not bank and not is_csv:
            from backend.parsers.detector import detect_bank
            bank = detect_bank(pdf_path)

        file_hash = _compute_hash(pdf_path)

        # For combined dual-card statements (e.g. Scapia), one PDF produces
        # two Statement rows with the same file_hash but different card_last4.
        # We defer the per-card dedup check to after parsing for them.
        # For single-card statements, we do a fast pre-check here to avoid re-parsing.
        _pre_existing_hash = None
        if bank == "federal_scapia":
            _pre_existing_hash = db_session.query(Statement).filter(
                Statement.file_hash == file_hash
            ).first()
        elif not reparse_mode:
            existing = db_session.query(Statement).filter(
                Statement.file_hash == file_hash
            ).first()
            if existing:
                return {
                    "status": "duplicate",
                    "message": "Statement already imported",
                    "count": 0,
                    "period": None,
                    "bank": bank,
                }

        if is_csv:
            return _process_csv_statement(
                csv_path=pdf_path,
                file_hash=file_hash,
                bank=bank,
                source=source,
                db_session=db_session,
                original_upload_path=original_upload_path,
                reparse_mode=reparse_mode,
                preserved_manual_categories=preserved_manual_categories,
            )

        # ---------- PDF processing (existing logic) ----------

        profile = _get_user_profile(db_session)
        card_last4s = _get_card_last4s(db_session, bank=bank) if bank else _get_card_last4s(db_session)
        working_path = pdf_path
        encrypted = is_encrypted(pdf_path, allowed_roots=roots)

        if encrypted and manual_password:
            unlocked = unlock_pdf(pdf_path, [manual_password], allowed_roots=roots)
            if unlocked:
                working_path = unlocked
                from backend.services.keychain import (
                    save_bank_statement_password,
                    save_statement_password,
                )
                save_statement_password(file_hash, manual_password)
                if not bank:
                    from backend.parsers.detector import detect_bank
                    detected = detect_bank(working_path)
                    if detected and detected in SUPPORTED_BANKS:
                        bank = detected
                save_bank_statement_password(bank or "", manual_password)
            else:
                if reparse_mode:
                    db_session.rollback()
                else:
                    _create_password_needed_statement(
                        db_session, file_hash, pdf_path, bank, source, original_upload_path,
                    )
                return {
                    "status": "password_needed",
                    "message": "Could not unlock PDF with provided password",
                    "count": 0,
                }
        elif encrypted:
            from backend.services.keychain import get_statement_password
            keychain_pwd = get_statement_password(file_hash)
            
            unlocked = None
            if keychain_pwd:
                unlocked = unlock_pdf(pdf_path, [keychain_pwd], allowed_roots=roots)
                if unlocked:
                    working_path = unlocked
                    if not bank:
                        from backend.parsers.detector import detect_bank
                        detected = detect_bank(working_path)
                        if detected and detected in SUPPORTED_BANKS:
                            bank = detected
            
            if not unlocked and profile:
                from backend.services.pdf_unlock import unlock_pdf_with_password
                if bank:
                    passwords = generate_passwords(
                        bank=bank,
                        name=profile.name,
                        dob_day=profile.dob_day or "",
                        dob_month=profile.dob_month or "",
                        card_last4s=card_last4s,
                        dob_year=profile.dob_year or "",
                    )
                    unlocked_path, successful_pwd = unlock_pdf_with_password(pdf_path, passwords, allowed_roots=roots)
                    if unlocked_path and successful_pwd:
                        working_path = unlocked_path
                        unlocked = unlocked_path
                        from backend.services.keychain import save_bank_statement_password, save_statement_password
                        save_statement_password(file_hash, successful_pwd)
                        save_bank_statement_password(bank, successful_pwd)
                    else:
                        if reparse_mode:
                            db_session.rollback()
                        else:
                            _create_password_needed_statement(
                                db_session, file_hash, pdf_path, bank, source, original_upload_path,
                            )
                        return {
                            "status": "password_needed",
                            "message": "Could not unlock PDF - enter password for this statement to be processed",
                            "count": 0,
                        }
                else:
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
                        unlocked_path, successful_pwd = unlock_pdf_with_password(pdf_path, passwords, allowed_roots=roots)
                        if unlocked_path and successful_pwd:
                            bank = try_bank
                            working_path = unlocked_path
                            unlocked = unlocked_path
                            logger.info("Unlocked with bank=%s passwords", try_bank)
                            from backend.services.keychain import save_bank_statement_password, save_statement_password
                            save_statement_password(file_hash, successful_pwd)
                            save_bank_statement_password(bank, successful_pwd)
                            break

                    if not unlocked:
                        if reparse_mode:
                            db_session.rollback()
                        else:
                            _create_password_needed_statement(
                                db_session, file_hash, pdf_path, bank, source, original_upload_path,
                            )
                        return {
                            "status": "password_needed",
                            "message": "Could not unlock PDF - enter password for this statement to be processed",
                            "count": 0,
                        }

                    from backend.parsers.detector import detect_bank
                    detected = detect_bank(working_path)
                    if detected and detected in SUPPORTED_BANKS:
                        bank = detected
                        
            if not unlocked and not profile:
                if reparse_mode:
                    db_session.rollback()
                else:
                    _create_password_needed_statement(
                        db_session, file_hash, pdf_path, bank, source, original_upload_path,
                    )
                return {
                    "status": "password_needed",
                    "message": "PDF is password-protected - enter password for this statement to be processed",
                    "count": 0,
                }

        if not bank:
            return {
                "status": "error",
                "message": "Could not detect bank",
                "count": 0,
            }

        parser_key = bank
        if bank == "federal_scapia":
            bank = "federal"
            parser_key = "federal_scapia"
        elif bank == "federal":
            from backend.parsers.detector import detect_bank
            detected = detect_bank(working_path)
            if detected == "federal_scapia":
                parser_key = "federal_scapia"

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

        from backend.parsers.generic import GenericParser

        parsers = _get_parsers()
        if parser_key in parsers:
            parser = parsers[parser_key]()
        else:
            parser = GenericParser(bank=bank)
        parsed = parser.parse(working_path)

        card_last4 = getattr(parsed, "card_last4", None)
        card_last4_secondary = getattr(parsed, "card_last4_secondary", None)
        card_id = None  # only used for single-card fallback below

        if card_last4:
            # Single-card or combined-card (primary is known)
            # For combined statements card_last4_secondary is also set —
            # the per-card loop below handles both cards; no early return here.
            card = db_session.query(Card).filter(
                Card.bank == bank, Card.last4 == card_last4
            ).first()
            if card:
                card_id = card.id
            elif not card_last4_secondary:
                # Single-card statement but the card is not registered
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
            # If card_last4_secondary is set but primary card isn't registered,
            # fall through — the per-card loop will try both and skip unregistered ones.
        else:
            if card_last4_secondary:
                # Parser set secondary but not primary — unusual; let loop handle it.
                pass
            elif len(registered_cards) == 1:
                card_last4 = registered_cards[0].last4
                card_id = registered_cards[0].id
            else:
                logger.warning(
                    "Skipping statement — parser could not determine card and "
                    "multiple %s cards are registered",
                    bank,
                )
                card_msg = (
                    f"Could not determine which {bank.upper()} card this "
                    f"statement belongs to. Multiple cards are registered "
                    f"for this bank."
                )
                statement = Statement(
                    bank=bank,
                    card_last4=None,
                    period_start=None,
                    period_end=None,
                    file_hash=file_hash,
                    file_path=pdf_path,
                    original_upload_path=original_upload_path,
                    transaction_count=0,
                    total_spend=0.0,
                    source=source,
                    status="card_last4_not_parsed",
                    parse_failed=1,
                    status_message=card_msg,
                    currency=_parsed_currency(parsed),
                )
                db_session.add(statement)
                db_session.commit()
                return {
                    "status": "card_last4_not_parsed",
                    "message": card_msg,
                    "count": 0,
                    "period": None,
                    "bank": bank,
                    "card_last4": None,
                }

        is_parse_error = (
            len(parsed.transactions) == 0
            and parsed.period_start is None
            and parsed.period_end is None
        )

        if is_parse_error:
            parse_msg = (
                f"Could not extract transactions from this {bank.upper()} statement. "
                f"The PDF format may not be supported yet."
            )
            logger.warning(
                "Parse error for %s (%s ...%s): no transactions or period extracted",
                pdf_path, bank, card_last4,
            )
            if reparse_mode:
                db_session.rollback()
            else:
                statement = Statement(
                    bank=bank,
                    card_last4=card_last4,
                    period_start=None,
                    period_end=None,
                    file_hash=file_hash,
                    file_path=pdf_path,
                    original_upload_path=original_upload_path,
                    transaction_count=0,
                    total_spend=0.0,
                    total_amount_due=getattr(parsed, "total_amount_due", None),
                    credit_limit=getattr(parsed, "credit_limit", None),
                    source=source,
                    status="parse_error",
                    parse_failed=1,
                    status_message=parse_msg,
                    currency=_parsed_currency(parsed),
                    payment_due_date=getattr(parsed, "payment_due_date", None),
                )
                db_session.add(statement)
                db_session.commit()

            return {
                "status": "parse_error",
                "message": parse_msg,
                "count": 0,
                "period": None,
                "bank": bank,
            }

        cur = _parsed_currency(parsed)

        # ---------------------------------------------------------------
        # Determine if this is a combined dual-card statement (Scapia)
        # ---------------------------------------------------------------
        visa_last4 = getattr(parsed, "card_last4", None)
        rupay_last4 = getattr(parsed, "card_last4_secondary", None)
        is_combined = bool(visa_last4 and rupay_last4)

        if is_combined:
            card_partition = _split_transactions_by_card(
                parsed.transactions, visa_last4, rupay_last4
            )
        else:
            # Single-card statement — existing behaviour preserved exactly
            card_partition = {card_last4: parsed.transactions}

        total_created = 0
        period_start = parsed.period_start
        period_end = parsed.period_end

        for c_last4, c_txns in card_partition.items():
            if not c_last4:
                continue

            # Resolve card_id for this card
            card_obj = db_session.query(Card).filter(
                Card.bank == bank, Card.last4 == c_last4
            ).first()
            if not card_obj:
                logger.warning(
                    "Card %s not registered for bank %s — skipping this card's rows",
                    c_last4, bank,
                )
                continue

            # Auto-populate Card.name from the detected card variant if it is
            # not yet set (write-once). Do this even if the statement itself
            # is a duplicate, so users can re-upload to backfill the name.
            card_variant = getattr(parsed, "card_variant", None)
            if card_variant and not card_obj.name:
                card_obj.name = card_variant
                logger.info(
                    "Auto-named card %s ...%s → %r", bank, c_last4, card_variant
                )
                db_session.commit()

            # Per-card dedup: same file_hash + same card_last4 = already imported
            existing = db_session.query(Statement).filter(
                Statement.file_hash == file_hash,
                Statement.card_last4 == c_last4,
            ).first()
            if existing:
                logger.info(
                    "Duplicate statement (file_hash, card=%s) — skipping", c_last4
                )
                continue

            # Calculate debit total (always needed for total_spend)
            card_debit_total = sum(
                (Decimal(str(t.amount)) for t in c_txns if t.type == "debit"),
                Decimal("0")
            )

            # Per-card total_amount_due: use parsed value from PDF as authoritative source.
            # The bank's statement calculation accounts for opening balance, interest,
            # fees, and previous payments — computation from transactions alone is incorrect.
            # For combined statements (multiple cards in one PDF), parsed value is the total
            # for all cards, so we must compute per-card dues instead.
            parsed_due = getattr(parsed, "total_amount_due", None) if not is_combined else None
            logger.debug(
                "total_amount_due logic: is_combined=%s, parsed.total_amount_due=%s, parsed_due=%s",
                is_combined, getattr(parsed, "total_amount_due", None), parsed_due
            )
            if parsed_due is not None:
                # Use the authoritative value from the PDF
                card_due = float(Decimal(str(parsed_due)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
            else:
                # Fallback: compute from transactions (legacy behavior for parsers that don't extract this field)
                # Bill payment credits (cc_payment) repay the PREVIOUS month's balance
                # and must NOT reduce the current cycle's amount due.
                card_credit_total = sum(
                    (Decimal(str(t.amount))
                    for t in c_txns
                    if t.type == "credit" and getattr(t, "category", None) != "cc_payment"),
                    Decimal("0")
                )
                # category may not yet be resolved (categorizer runs below), so also
                # exclude credits on transactions that the *parser* already flagged
                # as cc_payment via pt.category:
                card_due = max(Decimal("0"), card_debit_total - card_credit_total)
                card_due = float(card_due.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

            # Sanity-check log: per-card dues should sum ≈ combined parsed due
            if is_combined:
                if parsed_due is not None:
                    logger.debug(
                        "Card %s: card_due=%.2f (from parsed PDF, combined_pdf_due=%s)",
                        c_last4, card_due, parsed.total_amount_due,
                    )
                else:
                    logger.debug(
                        "Card %s: debits=%.2f credits=%.2f card_due=%.2f (computed)",
                        c_last4, float(card_debit_total), float(card_credit_total),
                        card_due,
                    )

            stmt = Statement(
                bank=bank,
                card_last4=c_last4,
                period_start=period_start,
                period_end=period_end,
                file_hash=file_hash,
                file_path=pdf_path,
                original_upload_path=original_upload_path,
                transaction_count=len(c_txns),
                total_spend=float(
                    card_debit_total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                ),
                total_amount_due=card_due,
                credit_limit=getattr(parsed, "credit_limit", None),
                source=source,
                status="success",
                parse_failed=0,
                currency=cur,
                payment_due_date=getattr(parsed, "payment_due_date", None),
            )
            db_session.add(stmt)
            db_session.flush()

            for pt in c_txns:
                # Use parser-provided category hint; fall back to keyword matching
                category = pt.category if pt.category else categorize(
                    pt.merchant, db_session=db_session
                )
                is_manual = 0
                if preserved_manual_categories:
                    key = f"{pt.date.isoformat()}_{pt.merchant}_{float(pt.amount):.2f}_{pt.type}"
                    if key in preserved_manual_categories and preserved_manual_categories[key]:
                        category = preserved_manual_categories[key].pop(0)
                        is_manual = 1

                tx = Transaction(
                    statement_id=stmt.id,
                    date=pt.date,
                    merchant=pt.merchant,
                    amount=pt.amount,
                    type=pt.type,
                    category=category,
                    description=pt.description,
                    bank=bank,
                    card_last4=c_last4,
                    card_id=card_obj.id,
                    source=source,
                    currency=cur,
                    is_manually_categorized=is_manual,
                )
                db_session.add(tx)

            total_created += len(c_txns)

        # If every card was a duplicate, report as duplicate
        if total_created == 0:
            if _pre_existing_hash:
                return {
                    "status": "duplicate",
                    "message": "Statement already imported",
                    "count": 0,
                    "period": None,
                    "bank": bank,
                }
            else:
                return {
                    "status": "card_not_found",
                    "message": "No matching registered cards found for this statement.",
                    "count": 0,
                    "period": None,
                    "bank": bank,
                }

        db_session.commit()

        return {
            "status": "success",
            "count": total_created,
            "period": {
                "start": period_start.isoformat() if period_start else None,
                "end": period_end.isoformat() if period_end else None,
            },
            "bank": bank,
        }

    except IntegrityError:
        logger.warning(
            "IntegrityError while processing %s — statement already inserted by a concurrent worker (duplicate)",
            pdf_path,
        )
        if db_session:
            db_session.rollback()
        return {
            "status": "duplicate",
            "message": "Statement already imported",
            "count": 0,
            "period": None,
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
        if working_path != pdf_path and os.path.isfile(working_path):
            try:
                os.remove(working_path)
            except OSError:
                pass
        if close_session and db_session:
            db_session.close()


def _process_csv_statement(
    csv_path: str,
    file_hash: str,
    bank: Optional[str],
    source: str,
    db_session: Session,
    original_upload_path: Optional[str] = None,
    reparse_mode: bool = False,
    preserved_manual_categories: Optional[dict] = None,
) -> Dict:
    """Process a CSV bank statement: detect bank, parse, categorize, persist."""
    if not bank:
        from backend.parsers.detector import detect_bank_csv
        bank = detect_bank_csv(csv_path)

    if not bank:
        bank_msg = "Could not detect bank from CSV filename or content."
        if reparse_mode:
            db_session.rollback()
        else:
            statement = Statement(
                bank="unknown",
                card_last4=None,
                period_start=None,
                period_end=None,
                file_hash=file_hash,
                file_path=csv_path,
                original_upload_path=original_upload_path,
                transaction_count=0,
                total_spend=0.0,
                source=source,
                status="bank_not_parsed",
                parse_failed=1,
                status_message=bank_msg,
            )
            db_session.add(statement)
            db_session.commit()
        return {
            "status": "bank_not_parsed",
            "message": bank_msg,
            "count": 0,
        }

    from backend.parsers.generic_bank_csv import GenericBankCSVParser

    csv_parsers = _get_bank_csv_parsers()
    if bank in csv_parsers:
        parser = csv_parsers[bank]()
    else:
        parser = GenericBankCSVParser(bank=bank)

    parsed = parser.parse(csv_path)

    card_last4 = getattr(parsed, "card_last4", None)

    is_parse_error = (
        len(parsed.transactions) == 0
        and parsed.period_start is None
        and parsed.period_end is None
    )

    if is_parse_error:
        parse_msg = (
            f"Could not extract transactions from this {bank.upper()} CSV. "
            f"The format may not be supported yet."
        )
        logger.warning(
            "CSV parse error for %s (%s): no transactions extracted",
            csv_path, bank,
        )
        if reparse_mode:
            db_session.rollback()
        else:
            statement = Statement(
                bank=bank,
                card_last4=card_last4,
                period_start=None,
                period_end=None,
                file_hash=file_hash,
                file_path=csv_path,
                original_upload_path=original_upload_path,
                transaction_count=0,
                total_spend=0.0,
                source=source,
                status="parse_error",
                parse_failed=1,
                status_message=parse_msg,
                currency=_parsed_currency(parsed),
            )
            db_session.add(statement)
            db_session.commit()

        return {
            "status": "parse_error",
            "message": parse_msg,
            "count": 0,
            "period": None,
            "bank": bank,
        }

    total_decimal = sum(
        (Decimal(str(t.amount)) for t in parsed.transactions if t.type == "debit"),
        Decimal(0),
    )
    total_spend = float(total_decimal.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

    cur = _parsed_currency(parsed)
    statement = Statement(
        bank=bank,
        card_last4=card_last4,
        period_start=parsed.period_start,
        period_end=parsed.period_end,
        file_hash=file_hash,
        file_path=csv_path,
        original_upload_path=original_upload_path,
        transaction_count=len(parsed.transactions),
        total_spend=total_spend,
        source=source,
        status="success",
        parse_failed=0,
        currency=cur,
    )
    db_session.add(statement)
    db_session.flush()

    for pt in parsed.transactions:
        # Use parser-provided category hint when available; fall back to keyword matching.
        category = pt.category if pt.category else categorize(pt.merchant, db_session=db_session)
        is_manual = 0
        if preserved_manual_categories:
            key = f"{pt.date.isoformat()}_{pt.merchant}_{float(pt.amount):.2f}_{pt.type}"
            if key in preserved_manual_categories and preserved_manual_categories[key]:
                category = preserved_manual_categories[key].pop(0)
                is_manual = 1

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
            card_id=None,
            source=source,
            currency=cur,
            is_manually_categorized=is_manual,
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
