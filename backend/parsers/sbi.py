"""SBI Card credit card statement parser.

SBI Card statements (PRIME, ELITE, SimplySAVE, SimplyCLICK, Cashback, etc.)
share a common monthly statement layout:

  - Header box: card number (masked XXXX XXXX XXXX NNNN), Total Amount Due,
    Minimum Amount Due, Credit Limit, Cash Limit, Statement Date, Payment Due Date.
  - Account Summary table: previous balance, payments/credits, debits, fees,
    total outstanding.
  - Transaction table:
      Date  |  Transaction Details  |  Amount (₹)
            |  for Statement Period: DD MMM YY to DD MMM YY  |
      05 Jan 26  PAYMENT RECEIVED 000DP...  3,539.00 C

Date format: DD MMM YY (2-digit year) or DD MMM YYYY.
Credit transactions carry a trailing 'C' or 'Cr'; debit transactions have no
suffix (or 'D' / 'Dr').
Amounts use Indian comma notation: 2,12,000.00 (lakhs with commas).

Partial card number (SBI-specific):
  SBI Card statements frequently display only the last 2 digits of the card
  number, masking the rest as 'XXXX XXXX XXXX XX20'. In these cases
  _extract_card_last4() returns the visible digits as-is (e.g. '20', not the
  full 4-digit last4). The statement_processor handles this by doing a suffix
  match against registered cards (last4.endswith('20')), so the correct card
  is still resolved without fabricating unknown digits.
"""

import logging
import re
from datetime import date, datetime
from typing import List, Optional, Tuple

import pdfplumber

from backend.parsers.base import BaseParser, ParsedStatement, ParsedTransaction
from backend.parsers.payment_due_date import extract_payment_due_date_from_text

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level compiled patterns (performance: compiled once at import time)
# ---------------------------------------------------------------------------

# Transaction line: "05 Jan 26  PAYMENT RECEIVED 000DP...  3,539.00 C"
# Also handles: "05 Jan 2026  DESCRIPTION  3,539.00" (no suffix = debit)
_TX_LINE_RE = re.compile(
    r"^(\d{1,2}\s+\w{3}\s+\d{2,4})\s+"  # Date: DD MMM YY or DD MMM YYYY
    r"(.+?)\s+"                            # Transaction description (non-greedy)
    r"([\d,]+\.\d{2})\s*"                 # Amount (Indian comma notation)
    r"(C(?:r|R)?|D(?:r|R)?|CR|DR)?\s*$",  # Optional credit/debit suffix
    re.IGNORECASE,
)

# Statement period inside the transaction table sub-header:
# "for Statement Period: 18 Dec 25 to 17 Jan 26"
_PERIOD_RE = re.compile(
    r"(?:for\s+)?[Ss]tatement\s+[Pp]eriod\s*[:\s]+"
    r"(\d{1,2}\s+\w{3,9}\s+\d{2,4})"   # Start date
    r"\s+to\s+"
    r"(\d{1,2}\s+\w{3,9}\s+\d{2,4})",   # End date
    re.IGNORECASE,
)

# Numeric statement period fallback: "18/12/2025 to 17/01/2026"
_PERIOD_NUM_RE = re.compile(
    r"(\d{2}[/-]\d{2}[/-]\d{4})\s+to\s+(\d{2}[/-]\d{2}[/-]\d{4})",
    re.IGNORECASE,
)

# Card number — SBI masks as "XXXX XXXX XXXX 1234" (4 visible) OR
# "XXXX XXXX XXXX XX20" (only last 2 visible, a common SBI redaction).
# We capture whatever trailing digits are present (2–4) and return them raw.
# The statement_processor resolves partial digits via suffix matching.
_CARD_NUM_RE = re.compile(
    r"(?:Credit\s+Card\s+Number[:\s]*)?"
    r"(?:[Xx\d]{4}\s+){2,3}(?:[Xx]+\s*)?([0-9]{2,4})\b",
    re.IGNORECASE,
)

# Fallback: loose "XXXX XXXX XXXX [XX]NNNN" pattern anywhere in scanning window
_CARD_LAST4_RE = re.compile(
    r"[Xx*]{4}\s+[Xx*]{4}\s+[Xx*]{4}\s+[Xx*]{0,2}(\d{2,4})",
    re.IGNORECASE,
)

# Total Amount Due — appears in the top header box
# Handles: "*Total Amount Due (₹)" label then value on next token/line
_TOTAL_DUE_RE = re.compile(
    r"\*?Total\s+Amount\s+Due\s*(?:\([₹Rs.]+\))?\s*[:\n\r ]*"
    r"(-?[\d,]+\.\d{2})",
    re.IGNORECASE | re.DOTALL,
)

# Credit Limit (₹) (Including cash) — first occurrence is the total credit limit
# Distinguish from "Available Credit Limit" which comes after
_CREDIT_LIMIT_RE = re.compile(
    r"Credit\s+Limit\s*(?:\([₹Rs.]+\)\s*)?(?:\(Including\s+cash\)\s*)?"
    r"[:\n\r ]*"
    r"([\d,]+\.\d{2})",
    re.IGNORECASE,
)

# Card product variant: "SBI CARD PRIME", "SBI CARD ELITE", "SBI SimplySAVE", etc.
_CARD_VARIANT_RE = re.compile(
    r"SBI\s+(?:CARD\s+)?(PRIME|ELITE|PULSE|AURUM|CASHBACK|SIMPLYSAVE|SIMPLYCLICK"
    r"|MILES|UNNATI|CORPORATE|ADVANTAGE|ADVANTAGE\s+PLUS|DOCTOR'S|PLATINUM)",
    re.IGNORECASE,
)

# Skip-lines: known non-transaction labels that might superficially match the TX regex
_SKIP_LINE_RE = re.compile(
    r"^(?:Date|Transaction\s+Details|Amount|Statement\s+Period"
    r"|Previous\s+Balance|Total\s+Outstanding|Account\s+Summary"
    r"|Shop\s+&\s+Smile|Points\s+Expiry|Closing\s+Balance"
    r"|Earned|Redeemed|Forfeited|GSTIN|STMT\s+No|CKYC)",
    re.IGNORECASE,
)


class SBICardParser(BaseParser):
    """Parser for SBI Card credit card statements (all product variants)."""

    def parse(self, pdf_path: str) -> ParsedStatement:
        all_lines: List[str] = []
        full_text = ""

        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                full_text += text + "\n"
                all_lines.extend(text.split("\n"))
                # NOTE: extract_tables() is intentionally omitted here.
                # SBI Card statements render transactions cleanly via extract_text().
                # Adding table cells to all_lines would duplicate every transaction
                # row that pdfplumber also extracts as flowing text.

        period_start, period_end = self._extract_period(full_text)
        card_last4 = self._extract_card_last4(full_text)
        total_amount_due = self._extract_total_amount_due(full_text)
        credit_limit = self._extract_credit_limit(full_text)
        payment_due_date = extract_payment_due_date_from_text(full_text)
        card_variant = self._extract_card_variant(full_text)
        transactions = self._extract_transactions(all_lines)

        logger.info(
            "SBI Card parse: card=%s variant=%s period=%s..%s txns=%d due=%s limit=%s payment_due=%s",
            card_last4,
            card_variant,
            period_start,
            period_end,
            len(transactions),
            total_amount_due,
            credit_limit,
            payment_due_date,
        )

        return ParsedStatement(
            bank="sbi",
            period_start=period_start,
            period_end=period_end,
            transactions=transactions,
            card_last4=card_last4,
            total_amount_due=total_amount_due,
            credit_limit=credit_limit,
            payment_due_date=payment_due_date,
            card_variant=card_variant,
        )

    # ------------------------------------------------------------------
    # Statement metadata extractors
    # ------------------------------------------------------------------

    def _extract_period(self, text: str) -> Tuple[Optional[date], Optional[date]]:
        """Extract billing period from 'Statement Period: DD MMM YY to DD MMM YY'."""
        m = _PERIOD_RE.search(text)
        if m:
            start = _parse_date(m.group(1))
            end = _parse_date(m.group(2))
            if start and end:
                return start, end

        # Fallback: numeric date range "18/12/2025 to 17/01/2026"
        m = _PERIOD_NUM_RE.search(text)
        if m:
            start = _parse_numeric_date(m.group(1))
            end = _parse_numeric_date(m.group(2))
            if start and end:
                return start, end

        return None, None

    @staticmethod
    def _extract_card_last4(text: str) -> Optional[str]:
        """Extract visible trailing digits from the masked SBI Card number.

        SBI Card statements show the card number in one of two formats:
          - Full last-4 visible:  "XXXX XXXX XXXX 1234"  → returns "1234"
          - Only last-2 visible:  "XXXX XXXX XXXX XX20"  → returns "20"

        We return the raw visible digits without fabricating unknown ones.
        Callers (statement_processor) handle the partial case for SBI by doing
        a suffix match (Card.last4.endswith(partial)) instead of an exact match.
        Returning None is reserved for when no digits can be found at all.
        """
        # Scan only the first ~2000 chars where the card number header appears
        scan = text[:2000]
        m = _CARD_NUM_RE.search(scan)
        if m:
            digits = re.sub(r"\D", "", m.group(1))
            if digits:
                # Return exactly what is visible — 2 or 4 digits, never padded
                return digits[-4:] if len(digits) >= 4 else digits

        m = _CARD_LAST4_RE.search(scan)
        if m:
            digits = re.sub(r"\D", "", m.group(1))
            if digits:
                return digits[-4:] if len(digits) >= 4 else digits

        return None

    @staticmethod
    def _extract_total_amount_due(text: str) -> Optional[float]:
        """Extract Total Amount Due from the statement header."""
        m = _TOTAL_DUE_RE.search(text[:3000])
        if m:
            try:
                val = float(m.group(1).replace(",", ""))
                return val  # May be 0.0 for fully-paid accounts
            except ValueError:
                pass
        return None

    @staticmethod
    def _extract_credit_limit(text: str) -> Optional[float]:
        """Extract Credit Limit (₹). Skips 'Available Credit Limit' lines."""
        for m in _CREDIT_LIMIT_RE.finditer(text[:4000]):
            # Ensure we haven't matched "Available Credit Limit"
            pre = text[max(0, m.start() - 15) : m.start()]
            if "available" in pre.lower() or "cash" in pre.lower():
                continue
            try:
                val = float(m.group(1).replace(",", ""))
                if val > 0:
                    return val
            except ValueError:
                pass
        return None

    @staticmethod
    def _extract_card_variant(text: str) -> Optional[str]:
        """Detect SBI Card product name from the statement header."""
        m = _CARD_VARIANT_RE.search(text[:1500])
        if m:
            return f"SBI Card {m.group(1).strip().title()}"
        return None

    # ------------------------------------------------------------------
    # Transaction extraction
    # ------------------------------------------------------------------

    def _extract_transactions(self, lines: List[str]) -> List[ParsedTransaction]:
        transactions: List[ParsedTransaction] = []
        seen: set = set()

        for raw_line in lines:
            line = raw_line.strip()
            if not line:
                continue
            # Clean up PDF encoding artifacts
            line = re.sub(r"\(cid:\d+\)", " ", line)
            line = re.sub(r"\s+", " ", line).strip()

            # Skip known header / summary lines early
            if _SKIP_LINE_RE.match(line):
                continue

            tx = self._parse_transaction_line(line)
            if tx:
                # Deduplicate by semantic content; line_idx is intentionally excluded
                # so that the same transaction appearing from both extract_text() and
                # any other source is collapsed into one entry.
                key = (tx.date.isoformat(), tx.merchant, tx.amount, tx.type)
                if key not in seen:
                    seen.add(key)
                    transactions.append(tx)

        return transactions

    def _parse_transaction_line(self, line: str) -> Optional[ParsedTransaction]:
        m = _TX_LINE_RE.match(line)
        if not m:
            return None
        parsed_date = _parse_date(m.group(1))
        if not parsed_date:
            return None
        return _build_transaction(parsed_date, m.group(2), m.group(3), m.group(4))


# ------------------------------------------------------------------
# Module-level helpers (no self; reused by both parse methods)
# ------------------------------------------------------------------

def _build_transaction(
    parsed_date: date,
    raw_desc: str,
    amount_str: str,
    direction: Optional[str],
) -> Optional[ParsedTransaction]:
    """Build a ParsedTransaction from parsed fields; returns None if invalid."""
    try:
        amount = float(amount_str.replace(",", ""))
    except ValueError:
        return None

    if amount <= 0:
        return None

    suffix = (direction or "").strip().upper()
    is_credit = suffix.startswith("C")  # "C", "Cr", "CR"
    tx_type = "credit" if is_credit else "debit"
    merchant = _clean_merchant(raw_desc.strip())

    # Heuristic: classify known bill-payment lines as cc_payment.
    # cc_payment rows are excluded from net-spend analytics:
    #   sum(debits) - sum(credits) WHERE category != 'cc_payment'
    # Refunds are merchant-level credits (e.g. Flipkart cancellation), NOT bill
    # payments — including them here would make refunds invisible in analytics.
    parser_category: Optional[str] = None
    desc_lower = raw_desc.lower()
    if any(kw in desc_lower for kw in ("payment received", "payment credited")):
        parser_category = "cc_payment"

    return ParsedTransaction(
        date=parsed_date,
        merchant=merchant,
        amount=amount,
        type=tx_type,
        category=parser_category,
        description=raw_desc.strip(),
    )


def _parse_date(date_str: str) -> Optional[date]:
    """Parse dates in SBI Card formats: 'DD MMM YY', 'DD MMM YYYY'."""
    cleaned = re.sub(r"\s+", " ", date_str.strip().replace(",", ""))
    for fmt in (
        "%d %b %Y",   # 17 Jan 2026
        "%d %B %Y",   # 17 January 2026
        "%d %b %y",   # 05 Jan 26  ← primary SBI format (2-digit year)
        "%d %B %y",   # 05 January 26
    ):
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue
    return None


def _parse_numeric_date(date_str: str) -> Optional[date]:
    """Parse numeric date: DD/MM/YYYY or DD-MM-YYYY."""
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y"):
        try:
            return datetime.strptime(date_str.strip(), fmt).date()
        except ValueError:
            continue
    return None


def _clean_merchant(raw: str) -> str:
    """Normalise merchant name: strip trailing country token and whitespace."""
    if not raw:
        return "Unknown"
    # Strip trailing "IN", "INDIA", "IND" (common in SBI transaction descriptions)
    merchant = re.sub(r"\s+(?:IN|INDIA|IND)\s*$", "", raw, flags=re.IGNORECASE)
    merchant = re.sub(r"\s+", " ", merchant).strip()
    return merchant[:512] if merchant else raw[:512]
