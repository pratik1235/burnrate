"""ICICI Bank credit card statement parser.

Handles Amazon Pay / Coral / Rubyx style statements where pdfplumber
renders ₹ as backtick (`).  Transaction lines follow the format:

    DD/MM/YYYY  SERIAL_NO  DESCRIPTION  REWARD_PTS  [INTL_AMT]  AMOUNT [CR]

"CR" suffix indicates a credit transaction.
"""

import logging
import re
from datetime import date, datetime
from typing import List, Optional, Tuple

import pdfplumber

from backend.parsers.base import BaseParser, ParsedStatement, ParsedTransaction
from backend.parsers.payment_due_date import extract_payment_due_date_from_text

logger = logging.getLogger(__name__)

_TX_LINE_RE = re.compile(
    r"^(\d{2}/\d{2}/\d{4})\s+\d{8,}\s+(.+)\s+([\d,]+\.\d{2})\s*(CR)?\s*$",
    re.IGNORECASE,
)

_CARD_NUM_RE = re.compile(r"(\d{4})[Xx*]+(\d{3,4})")

_STATEMENT_PERIOD_RE = re.compile(
    r"Statement\s+period\s*:\s*(\w+\s+\d{1,2},?\s+\d{4})\s+to\s+(\w+\s+\d{1,2},?\s+\d{4})",
    re.IGNORECASE,
)

_STATEMENT_DATE_RE = re.compile(
    r"STATEMENT\s+DATE\s*\n?\s*(\w+\s+\d{1,2},?\s+\d{4})",
    re.IGNORECASE,
)

_TOTAL_DUE_RE = re.compile(
    r"Total\s+Amount\s+due\s*\n?\s*`([\d,]+(?:\.\d{2})?)",
    re.IGNORECASE,
)

_CREDIT_LIMIT_RE = re.compile(
    r"Credit\s+Limit\s*\(Including\s+cash\)",
    re.IGNORECASE,
)

_AMOUNT_RE = re.compile(r"`([\d,]+(?:\.\d{2})?)")


class ICICIParser(BaseParser):
    """Parser for ICICI Bank credit card statements."""

    def parse(self, pdf_path: str) -> ParsedStatement:
        all_lines: List[str] = []
        full_text = ""

        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                full_text += text + "\n"
                all_lines.extend(text.split("\n"))

        period_start, period_end = self._extract_period(full_text)
        card_last4 = self._extract_card_last4(full_text)
        total_amount_due = self._extract_total_amount_due(full_text)
        credit_limit = self._extract_credit_limit(full_text)
        transactions = self._extract_transactions(all_lines)
        payment_due_date = extract_payment_due_date_from_text(full_text)

        logger.info(
            "ICICI parse: card=%s period=%s..%s txns=%d due=%s limit=%s payment_due=%s",
            card_last4, period_start, period_end, len(transactions),
            total_amount_due, credit_limit, payment_due_date,
        )

        return ParsedStatement(
            bank="icici",
            period_start=period_start,
            period_end=period_end,
            transactions=transactions,
            card_last4=card_last4,
            total_amount_due=total_amount_due,
            credit_limit=credit_limit,
            payment_due_date=payment_due_date,
        )

    # ------------------------------------------------------------------
    # Statement metadata
    # ------------------------------------------------------------------

    def _extract_period(self, text: str) -> Tuple[Optional[date], Optional[date]]:
        m = _STATEMENT_PERIOD_RE.search(text)
        if m:
            start = self._parse_text_date(m.group(1))
            end = self._parse_text_date(m.group(2))
            if start and end:
                return start, end

        m = _STATEMENT_DATE_RE.search(text)
        if m:
            end = self._parse_text_date(m.group(1))
            if end:
                start_approx = end.replace(day=1) if end.day > 1 else end
                return start_approx, end

        return None, None

    @staticmethod
    def _extract_card_last4(text: str) -> Optional[str]:
        for m in _CARD_NUM_RE.finditer(text):
            last_digits = m.group(2)
            if len(last_digits) >= 4:
                return last_digits[-4:]
            full = m.group(1) + last_digits
            return full[-4:]
        return None

    @staticmethod
    def _extract_total_amount_due(text: str) -> Optional[float]:
        m = _TOTAL_DUE_RE.search(text)
        if m:
            try:
                return float(m.group(1).replace(",", ""))
            except ValueError:
                pass
        return None

    @staticmethod
    def _extract_credit_limit(text: str) -> Optional[float]:
        anchor = _CREDIT_LIMIT_RE.search(text)
        if not anchor:
            return None

        window = text[anchor.end(): anchor.end() + 500]
        amounts: List[float] = []
        for m in _AMOUNT_RE.finditer(window):
            try:
                val = float(m.group(1).replace(",", ""))
                if val > 0:
                    amounts.append(val)
            except ValueError:
                pass

        return max(amounts) if amounts else None

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

            line = re.sub(r"\(cid:\d+\)", " ", line)
            line = re.sub(r"\s+", " ", line).strip()

            tx = self._parse_transaction_line(line)
            if tx:
                key = (tx.date.isoformat(), tx.merchant, tx.amount, tx.type)
                if key not in seen:
                    seen.add(key)
                    transactions.append(tx)

        return transactions

    def _parse_transaction_line(self, line: str) -> Optional[ParsedTransaction]:
        m = _TX_LINE_RE.match(line)
        if not m:
            return None

        parsed_date = self._parse_numeric_date(m.group(1))
        if not parsed_date:
            return None

        raw_desc = m.group(2).strip()
        amount_str = m.group(3).replace(",", "")
        is_credit = m.group(4) is not None

        try:
            amount = float(amount_str)
        except ValueError:
            return None

        if amount <= 0:
            return None

        # Strip trailing reward-points number from description
        merchant = re.sub(r"\s+\d+\s*$", "", raw_desc).strip()
        merchant = self._clean_merchant(merchant)
        tx_type = "credit" if is_credit else "debit"

        return ParsedTransaction(
            date=parsed_date,
            merchant=merchant,
            amount=amount,
            type=tx_type,
            description=raw_desc,
        )

    # ------------------------------------------------------------------
    # Merchant cleanup
    # ------------------------------------------------------------------

    @staticmethod
    def _clean_merchant(raw: str) -> str:
        if not raw:
            return "Unknown"
        merchant = raw
        merchant = re.sub(r"\s+(IN|INDIA)\s*$", "", merchant, flags=re.IGNORECASE)
        merchant = merchant.strip()
        return merchant[:512] if merchant else raw[:512]

    # ------------------------------------------------------------------
    # Date helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_text_date(date_str: str) -> Optional[date]:
        """Parse 'January 29, 2026' or 'DD/MM/YYYY' or 'DD Mon YYYY'."""
        cleaned = date_str.strip().replace(",", "")
        for fmt in ("%B %d %Y", "%d %B %Y", "%d %b %Y", "%d/%m/%Y", "%d-%m-%Y"):
            try:
                return datetime.strptime(cleaned, fmt).date()
            except ValueError:
                continue
        return None

    @staticmethod
    def _parse_numeric_date(date_str: str) -> Optional[date]:
        for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y"):
            try:
                return datetime.strptime(date_str.strip(), fmt).date()
            except ValueError:
                continue
        return None
