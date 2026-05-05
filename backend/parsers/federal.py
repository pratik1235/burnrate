"""Federal Bank credit card statement parser.

Handles Celesta / Imperio / Signet / Scapia style statements.
Federal Bank statements use a Payment Summary and transaction table with:
  DATE | TRANSACTION DETAILS | MERCHANT CATEGORY | AMOUNT

Date formats seen: DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY.
Credit entries may carry a 'Cr' suffix or appear in a credit column.
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
    r"^(\d{2}[/-]\d{2}[/-]\d{4})\s+"
    r"(.+?)\s+"
    r"([\d,]+\.\d{2})\s*(Cr|CR|Dr|DR)?\s*$",
    re.IGNORECASE,
)

# Alt format: DD-Mon-YYYY description amount [Cr]
_TX_LINE_TEXT_DATE_RE = re.compile(
    r"^(\d{2}[\s-]\w{3}[\s-]\d{4})\s+"
    r"(.+?)\s+"
    r"([\d,]+\.\d{2})\s*(Cr|CR|Dr|DR)?\s*$",
    re.IGNORECASE,
)

_PERIOD_RE = re.compile(
    r"Statement\s+Period[:\s]+(\d{2}[/-]\d{2}[/-]\d{4})\s*[-–to]+\s*(\d{2}[/-]\d{2}[/-]\d{4})",
    re.IGNORECASE,
)

_PERIOD_TEXT_RE = re.compile(
    r"Statement\s+Period[:\s]+(\d{1,2}\s+\w{3,9},?\s+\d{4})\s*[-–to]+\s*(\d{1,2}\s+\w{3,9},?\s+\d{4})",
    re.IGNORECASE,
)

_BILLING_PERIOD_RE = re.compile(
    r"Billing\s+(?:Cycle|Period)[:\s]+(\d{2}[/-]\d{2}[/-]\d{4})\s*[-–to]+\s*(\d{2}[/-]\d{2}[/-]\d{4})",
    re.IGNORECASE,
)

_CARD_NUM_RE = re.compile(
    r"(?:Card\s+(?:No|Number)|Credit\s+Card)[.:\s]*(\d{4,6})[Xx*]+(\d{3,4})",
    re.IGNORECASE,
)

_CARD_NUM_GENERIC_RE = re.compile(r"(\d{4})[Xx*]{4,}(\d{4})")

_TOTAL_DUE_RE = re.compile(
    r"Total\s+(?:Payment|Amount)\s+Due.*?([\d,]+\.\d{2})",
    re.IGNORECASE | re.DOTALL,
)

_CREDIT_LIMIT_RE = re.compile(
    r"Credit\s+Limit.*?([\d,]+\.\d{2})",
    re.IGNORECASE | re.DOTALL,
)

_KNOWN_MERCHANT_CATS = re.compile(
    r"\s+(?:MISC|DEPT STORE|GROCERY|ELECTRONICS|AIRLINE|HOTEL|"
    r"RESTAURANT|FUEL|TELECOM|INSURANCE|UTILITY|GOVERNMENT|EDUCATION|"
    r"ENTERTAINMENT|HEALTH|AUTO|TRAVEL|E-COMMERCE|SHOPPING|OTHERS?)\s*$",
    re.IGNORECASE,
)


class FederalBankParser(BaseParser):
    """Parser for Federal Bank credit card statements."""

    def parse(self, pdf_path: str) -> ParsedStatement:
        all_lines: List[str] = []
        full_text = ""

        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                full_text += text + "\n"
                all_lines.extend(text.split("\n"))

                for table in page.extract_tables():
                    for row in table:
                        for cell in (row or []):
                            if cell:
                                all_lines.extend(str(cell).split("\n"))

        period_start, period_end = self._extract_period(full_text)
        card_last4 = self._extract_card_last4(full_text)
        total_amount_due = self._extract_total_amount_due(full_text)
        credit_limit = self._extract_credit_limit(full_text)
        transactions = self._extract_transactions(all_lines)
        payment_due_date = extract_payment_due_date_from_text(full_text)

        logger.info(
            "Federal Bank parse: card=%s period=%s..%s txns=%d due=%s limit=%s payment_due=%s",
            card_last4, period_start, period_end, len(transactions),
            total_amount_due, credit_limit, payment_due_date,
        )

        return ParsedStatement(
            bank="federal",
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
        for pat in (_PERIOD_RE, _BILLING_PERIOD_RE):
            m = pat.search(text)
            if m:
                start = self._parse_numeric_date(m.group(1))
                end = self._parse_numeric_date(m.group(2))
                if start and end:
                    return start, end

        m = _PERIOD_TEXT_RE.search(text)
        if m:
            start = self._parse_text_date(m.group(1))
            end = self._parse_text_date(m.group(2))
            if start and end:
                return start, end

        return None, None

    @staticmethod
    def _extract_card_last4(text: str) -> Optional[str]:
        m = _CARD_NUM_RE.search(text)
        if m:
            return m.group(2)[-4:]
        m = _CARD_NUM_GENERIC_RE.search(text)
        if m:
            return m.group(2)[-4:]
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
        amounts: List[float] = []
        for m in re.finditer(r"Credit\s+Limit", text, re.IGNORECASE):
            pre = text[max(0, m.start() - 20):m.start()]
            if "available" in pre.lower() or "cash" in pre.lower():
                continue
            window = text[m.end():m.end() + 200]
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
        if m:
            parsed_date = self._parse_numeric_date(m.group(1))
            if parsed_date:
                return self._build_transaction(parsed_date, m.group(2), m.group(3), m.group(4))

        m = _TX_LINE_TEXT_DATE_RE.match(line)
        if m:
            parsed_date = self._parse_text_date(m.group(1))
            if parsed_date:
                return self._build_transaction(parsed_date, m.group(2), m.group(3), m.group(4))

        return None

    def _build_transaction(
        self, parsed_date: date, raw_desc: str, amount_str: str, direction: Optional[str]
    ) -> Optional[ParsedTransaction]:
        try:
            amount = float(amount_str.replace(",", ""))
        except ValueError:
            return None

        if amount <= 0:
            return None

        is_credit = (direction or "").strip().lower() == "cr"
        tx_type = "credit" if is_credit else "debit"
        merchant = self._clean_merchant(raw_desc.strip())

        return ParsedTransaction(
            date=parsed_date,
            merchant=merchant,
            amount=amount,
            type=tx_type,
            description=raw_desc.strip(),
        )

    # ------------------------------------------------------------------
    # Merchant cleanup
    # ------------------------------------------------------------------

    @staticmethod
    def _clean_merchant(raw: str) -> str:
        if not raw:
            return "Unknown"
        merchant = _KNOWN_MERCHANT_CATS.sub("", raw).strip()
        merchant = re.sub(r"\s+(IN|INDIA|IND)\s*$", "", merchant, flags=re.IGNORECASE)
        return merchant[:512] if merchant else raw[:512]

    # ------------------------------------------------------------------
    # Date helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_text_date(date_str: str) -> Optional[date]:
        cleaned = date_str.strip().replace(",", "").replace("-", " ")
        cleaned = re.sub(r"\s+", " ", cleaned)
        for fmt in ("%d %b %Y", "%d %B %Y"):
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
