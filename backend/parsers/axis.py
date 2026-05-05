"""Axis Bank credit card statement parser.

Handles Axis Bank statements where the Payment Summary section contains:
  Total Payment Due, Credit Limit, Statement Period, Credit Card Number

Transaction table columns:
  DATE | TRANSACTION DETAILS | MERCHANT CATEGORY | AMOUNT (Rs.) Dr/Cr | CASHBACK EARNED Cr/Dr

Amount column uses Dr/Cr suffix to indicate debit/credit direction.
The CASHBACK EARNED column is ignored.
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
    r"^(\d{2}/\d{2}/\d{4})\s+"
    r"(.+?)\s+"
    r"([\d,]+\.\d{2})\s+(Dr|Cr)"
    r"(?:\s+[\d,]+\.\d{2}\s+(?:Cr|Dr))?\s*$",
    re.IGNORECASE,
)

_PERIOD_RE = re.compile(
    r"(\d{2}/\d{2}/\d{4})\s*[-–]\s*(\d{2}/\d{2}/\d{4})"
)

_CARD_NUM_RE = re.compile(r"(\d{4,6})\*{2,}(\d{4})")

_KNOWN_MERCHANT_CATS = re.compile(
    r"\s+(?:MISC STORE|DEPT STORES?|GROCERY|ELECTRONICS|"
    r"AIRLINE|HOTEL|RESTAURANT|FUEL|TELECOM|INSURANCE|"
    r"UTILITY|GOVERNMENT|EDUCATION|ENTERTAINMENT|"
    r"HEALTH|AUTO|TRAVEL|OTHERS?)\s*$",
    re.IGNORECASE,
)


class AxisParser(BaseParser):
    """Parser for Axis Bank credit card statements."""

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
            "Axis parse: card=%s period=%s..%s txns=%d due=%s limit=%s payment_due=%s",
            card_last4, period_start, period_end, len(transactions),
            total_amount_due, credit_limit, payment_due_date,
        )

        return ParsedStatement(
            bank="axis",
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
        anchor = re.search(r"Statement\s+Period", text, re.IGNORECASE)
        if anchor:
            window = text[anchor.start() : anchor.start() + 200]
            m = _PERIOD_RE.search(window)
            if m:
                start = self._parse_date(m.group(1))
                end = self._parse_date(m.group(2))
                if start and end:
                    return start, end

        m = _PERIOD_RE.search(text)
        if m:
            start = self._parse_date(m.group(1))
            end = self._parse_date(m.group(2))
            return start, end

        return None, None

    @staticmethod
    def _extract_card_last4(text: str) -> Optional[str]:
        for m in _CARD_NUM_RE.finditer(text):
            return m.group(2)
        return None

    @staticmethod
    def _extract_total_amount_due(text: str) -> Optional[float]:
        m = re.search(
            r"Total\s+Payment\s+Due.*?([\d,]+\.\d{2})",
            text,
            re.IGNORECASE | re.DOTALL,
        )
        if m:
            try:
                return float(m.group(1).replace(",", ""))
            except ValueError:
                pass
        return None

    @staticmethod
    def _extract_credit_limit(text: str) -> Optional[float]:
        """Extract Credit Limit (largest amount near the first non-Available Credit Limit label).

        The Payment Summary row contains Credit Limit, Available Credit Limit,
        and Available Cash Limit in sequence. The actual Credit Limit is always
        the largest of these values.
        """
        amounts: List[float] = []
        for m in re.finditer(r"Credit\s+Limit", text, re.IGNORECASE):
            pre = text[max(0, m.start() - 15) : m.start()]
            if "available" in pre.lower():
                continue
            window = text[m.end() : m.end() + 300]
            for am in re.finditer(r"([\d,]+\.\d{2})", window):
                try:
                    val = float(am.group(1).replace(",", ""))
                    if val > 0:
                        amounts.append(val)
                except ValueError:
                    pass
            break

        return max(amounts) if amounts else None

    # ------------------------------------------------------------------
    # Transaction extraction
    # ------------------------------------------------------------------

    def _extract_transactions(self, lines: List[str]) -> List[ParsedTransaction]:
        transactions: List[ParsedTransaction] = []

        for raw_line in lines:
            line = raw_line.strip()
            if not line:
                continue

            line = re.sub(r"\s+", " ", line).strip()

            tx = self._parse_transaction_line(line)
            if tx:
                transactions.append(tx)

        return transactions

    def _parse_transaction_line(self, line: str) -> Optional[ParsedTransaction]:
        m = _TX_LINE_RE.match(line)
        if not m:
            return None

        parsed_date = self._parse_date(m.group(1))
        if not parsed_date:
            return None

        raw_desc = m.group(2).strip()
        amount_str = m.group(3).replace(",", "")
        direction = m.group(4).strip().lower()

        try:
            amount = float(amount_str)
        except ValueError:
            return None

        if amount <= 0:
            return None

        is_credit = direction == "cr"
        tx_type = "credit" if is_credit else "debit"
        merchant = self._clean_merchant(raw_desc)

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
        merchant = _KNOWN_MERCHANT_CATS.sub("", raw).strip()
        return merchant[:512] if merchant else raw[:512]

    # ------------------------------------------------------------------
    # Date helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_date(date_str: str) -> Optional[date]:
        for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y"):
            try:
                return datetime.strptime(date_str.strip(), fmt).date()
            except ValueError:
                continue
        return None
