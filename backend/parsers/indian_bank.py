"""Indian Bank (OneCard) credit card statement parser.

Indian Bank OneCard statements follow this structure:
  - Title: "Indian Bank One Credit Card Statement (DD Mon YYYY - DD Mon YYYY)"
  - Card number: NNNN-NNXX-XXXX-NNNN (dash-separated, partially masked)
  - Summary with Opening Balance, Total Amount Due, Statement Date, etc.
  - Transaction table columns: Date | Merchant | Category | Mode | Reward Points | Amount
  - Transaction dates use "DD Mon" without year; year is inferred from statement period.
  - Transactions continue across pages, ending before "IMPORTANT INFORMATION".

Credit transactions are identified by category keywords like "Repayments" or "Refunds".

Password format: First 4 letters of name (UPPERCASE) + DOB as DDMM.
"""

import logging
import re
from datetime import date, datetime
from typing import List, Optional, Tuple

import pdfplumber

from backend.parsers.base import BaseParser, ParsedStatement, ParsedTransaction

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Period — extracted from the title
# ---------------------------------------------------------------------------

_TITLE_PERIOD_RE = re.compile(
    r"Statement\s*\(\s*(\d{1,2}\s+\w{3}\s+\d{4})\s*-\s*(\d{1,2}\s+\w{3}\s+\d{4})\s*\)",
    re.IGNORECASE,
)

_PERIOD_NUMERIC_RE = re.compile(
    r"Statement\s+Period[:\s]+(\d{2}[/-]\d{2}[/-]\d{4})\s*[-\u2013to]+\s*(\d{2}[/-]\d{2}[/-]\d{4})",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Card number — "4062-29XX-XXXX-2197"
# ---------------------------------------------------------------------------

_CARD_DASHED_RE = re.compile(
    r"(\d{4})[- ]?\d{2}[Xx*]{2}[- ]?[Xx*]{4}[- ]?(\d{4})",
)

_CARD_GENERIC_RE = re.compile(r"(\d{4})[Xx*]{4,8}(\d{4})")

# ---------------------------------------------------------------------------
# Summary fields
# ---------------------------------------------------------------------------

_TOTAL_DUE_RE = re.compile(
    r"Total\s+Amount\s+Due\s*[=\s]*([\d,]+\.\d{2})",
    re.IGNORECASE,
)

_CREDIT_LIMIT_RE = re.compile(
    r"(?:Total\s+)?Credit\s+Limit\s*[:\s]*([\d,]+(?:\.\d{2})?)",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Transaction line in text extraction
# "DD Mon   Description...   Amount"
# ---------------------------------------------------------------------------

_TX_LINE_RE = re.compile(
    r"^(\d{2}\s+\w{3})\s+"
    r"(.+?)\s+"
    r"([\d,]+\.\d{2})\s*$",
)

# Fallback: "DD/MM/YYYY  Description  Amount [Dr/Cr]"
_TX_LINE_DATED_RE = re.compile(
    r"^(\d{2}[/-]\d{2}[/-]\d{4})\s+"
    r"(.+?)\s+"
    r"([\d,]+\.\d{2})\s*(Dr|Cr)?\s*$",
    re.IGNORECASE,
)

# Transaction types that indicate a credit (repayment / refund)
_CREDIT_KEYWORDS = frozenset({
    "repayment", "repayments", "refund", "refunds",
    "reversal", "reversals", "cashback", "credit adjustment",
})

# Transaction mode codes to strip from merchant descriptions
_MODE_CODES = [
    "TOKEN_ECOM", "ECOM", "POS", "CONTACTLESS",
    "IMPS", "NEFT", "UPI", "ATM", "NFC",
]

# Category labels that pdfplumber injects into the text from the PDF table
_CATEGORY_LABELS = [
    "Food & Dining", "Shopping", "Entertainment", "Travel",
    "Utilities", "Health", "Education", "Groceries", "Fuel",
    "EMI", "Others", "Miscellaneous", "Personal Care",
    "Insurance", "Government", "Bills & Recharges", "Investments",
    "Rent", "Transfers", "Repayments", "Refunds",
]


class IndianBankParser(BaseParser):
    """Parser for Indian Bank (OneCard) credit card statements."""

    def parse(self, pdf_path: str) -> ParsedStatement:
        all_lines: List[str] = []
        full_text = ""
        table_rows: List[List[str]] = []

        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                full_text += text + "\n"
                all_lines.extend(text.split("\n"))

                for table in page.extract_tables():
                    for row in table:
                        if row:
                            table_rows.append([str(c or "").strip() for c in row])

        period_start, period_end = self._extract_period(full_text)
        card_last4 = self._extract_card_last4(full_text)
        total_amount_due = self._extract_total_amount_due(full_text)
        credit_limit = self._extract_credit_limit(full_text)
        transactions = self._extract_transactions(
            all_lines, table_rows, period_start, period_end,
        )

        logger.info(
            "Indian Bank parse: card=%s period=%s..%s txns=%d due=%s limit=%s",
            card_last4, period_start, period_end, len(transactions),
            total_amount_due, credit_limit,
        )

        return ParsedStatement(
            bank="indian_bank",
            period_start=period_start,
            period_end=period_end,
            transactions=transactions,
            card_last4=card_last4,
            total_amount_due=total_amount_due,
            credit_limit=credit_limit,
        )

    # ------------------------------------------------------------------
    # Statement period
    # ------------------------------------------------------------------

    def _extract_period(self, text: str) -> Tuple[Optional[date], Optional[date]]:
        m = _TITLE_PERIOD_RE.search(text)
        if m:
            start = self._parse_text_date(m.group(1))
            end = self._parse_text_date(m.group(2))
            if start and end:
                return start, end

        m = _PERIOD_NUMERIC_RE.search(text)
        if m:
            start = self._parse_numeric_date(m.group(1))
            end = self._parse_numeric_date(m.group(2))
            if start and end:
                return start, end

        return None, None

    # ------------------------------------------------------------------
    # Card last-4
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_card_last4(text: str) -> Optional[str]:
        m = _CARD_DASHED_RE.search(text)
        if m:
            return m.group(2)[-4:]
        m = _CARD_GENERIC_RE.search(text)
        if m:
            return m.group(2)[-4:]
        return None

    # ------------------------------------------------------------------
    # Total amount due
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_total_amount_due(text: str) -> Optional[float]:
        values: List[float] = []
        for m in _TOTAL_DUE_RE.finditer(text):
            try:
                values.append(float(m.group(1).replace(",", "")))
            except ValueError:
                pass
        # Multiple "Total Amount Due" appear (sidebar summary + illustration).
        # Return the last occurrence which is the definitive one.
        return values[-1] if values else None

    # ------------------------------------------------------------------
    # Credit limit
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_credit_limit(text: str) -> Optional[float]:
        m = _CREDIT_LIMIT_RE.search(text)
        if m:
            try:
                return float(m.group(1).replace(",", ""))
            except ValueError:
                pass
        return None

    # ------------------------------------------------------------------
    # Transaction extraction
    # ------------------------------------------------------------------

    def _extract_transactions(
        self,
        lines: List[str],
        table_rows: List[List[str]],
        period_start: Optional[date],
        period_end: Optional[date],
    ) -> List[ParsedTransaction]:
        ref_year = (
            period_end.year if period_end
            else period_start.year if period_start
            else date.today().year
        )

        seen: set = set()
        transactions: List[ParsedTransaction] = []

        # --- Text-based extraction (most reliable for this format) ---
        in_tx_section = False
        for raw_line in lines:
            line = raw_line.strip()
            if not line:
                continue

            upper = line.upper()
            if "TRANSACTION HISTORY" in upper:
                in_tx_section = True
                continue
            if "IMPORTANT INFORMATION" in upper:
                in_tx_section = False
                continue

            if not in_tx_section:
                continue

            tx = self._parse_text_line(line, ref_year, period_start, period_end)
            if tx:
                self._add_unique(tx, seen, transactions)

        # --- Table-based extraction (supplement; catches rows text misses) ---
        for row in table_rows:
            tx = self._parse_table_row(row, ref_year, period_start, period_end)
            if tx:
                self._add_unique(tx, seen, transactions)

        return transactions

    @staticmethod
    def _add_unique(
        tx: ParsedTransaction,
        seen: set,
        out: List[ParsedTransaction],
    ) -> None:
        key = (tx.date.isoformat(), tx.merchant, tx.amount, tx.type)
        if key not in seen:
            seen.add(key)
            out.append(tx)

    # ------------------------------------------------------------------
    # Text line → ParsedTransaction
    # ------------------------------------------------------------------

    def _parse_text_line(
        self,
        line: str,
        ref_year: int,
        period_start: Optional[date],
        period_end: Optional[date],
    ) -> Optional[ParsedTransaction]:
        # Try "DD Mon ... Amount" (primary format)
        m = _TX_LINE_RE.match(line)
        if m:
            parsed_date = self._resolve_short_date(
                m.group(1), ref_year, period_start, period_end,
            )
            if not parsed_date:
                return None

            raw_desc = m.group(2).strip()
            amount_str = m.group(3).replace(",", "")
            return self._build_transaction(parsed_date, raw_desc, amount_str)

        # Try "DD/MM/YYYY ... Amount [Dr/Cr]" (alternate format)
        m = _TX_LINE_DATED_RE.match(line)
        if m:
            parsed_date = self._parse_numeric_date(m.group(1))
            if not parsed_date:
                return None

            raw_desc = m.group(2).strip()
            amount_str = m.group(3).replace(",", "")
            direction = (m.group(4) or "").strip().lower()
            is_credit = direction == "cr"

            try:
                amount = float(amount_str)
            except ValueError:
                return None
            if amount <= 0:
                return None

            merchant = self._clean_merchant(raw_desc)
            return ParsedTransaction(
                date=parsed_date,
                merchant=merchant,
                amount=amount,
                type="credit" if is_credit else "debit",
                description=raw_desc,
            )

        return None

    # ------------------------------------------------------------------
    # Table row → ParsedTransaction
    # ------------------------------------------------------------------

    def _parse_table_row(
        self,
        row: List[str],
        ref_year: int,
        period_start: Optional[date],
        period_end: Optional[date],
    ) -> Optional[ParsedTransaction]:
        if len(row) < 3:
            return None

        date_cell = row[0].strip()
        if not re.match(r"^\d{2}\s+\w{3}$", date_cell):
            if not re.match(r"^\d{2}[/-]\d{2}[/-]\d{2,4}$", date_cell):
                return None

        if re.match(r"^\d{2}\s+\w{3}$", date_cell):
            parsed_date = self._resolve_short_date(
                date_cell, ref_year, period_start, period_end,
            )
        else:
            parsed_date = self._parse_numeric_date(date_cell)

        if not parsed_date:
            return None

        merchant = row[1].strip() if len(row) > 1 else ""
        category = row[2].strip() if len(row) > 2 else ""

        # Amount is the last numeric cell
        amount = None
        for cell in reversed(row):
            stripped = cell.strip().replace(",", "")
            try:
                amount = float(stripped)
                break
            except ValueError:
                continue

        if not amount or amount <= 0:
            return None

        is_credit = category.lower() in _CREDIT_KEYWORDS
        full_desc = f"{merchant} {category}".strip()
        clean = self._clean_merchant(full_desc, category=category)

        return ParsedTransaction(
            date=parsed_date,
            merchant=clean,
            amount=amount,
            type="credit" if is_credit else "debit",
            description=full_desc,
        )

    # ------------------------------------------------------------------
    # Build transaction (shared logic for text lines)
    # ------------------------------------------------------------------

    def _build_transaction(
        self,
        parsed_date: date,
        raw_desc: str,
        amount_str: str,
    ) -> Optional[ParsedTransaction]:
        try:
            amount = float(amount_str)
        except ValueError:
            return None
        if amount <= 0:
            return None

        desc_lower = raw_desc.lower()
        is_credit = any(kw in desc_lower for kw in _CREDIT_KEYWORDS)

        # Extract the category token from the description for merchant cleaning
        detected_cat = ""
        for cat in _CATEGORY_LABELS:
            if cat.lower() in desc_lower:
                detected_cat = cat
                break

        merchant = self._clean_merchant(raw_desc, category=detected_cat)
        return ParsedTransaction(
            date=parsed_date,
            merchant=merchant,
            amount=amount,
            type="credit" if is_credit else "debit",
            description=raw_desc,
        )

    # ------------------------------------------------------------------
    # Merchant cleanup
    # ------------------------------------------------------------------

    @staticmethod
    def _clean_merchant(raw: str, category: str = "") -> str:
        if not raw:
            return "Unknown"

        merchant = raw

        # Strip trailing numeric values (reward points)
        merchant = re.sub(r"\s+[\d,]+\.\d{2}\s*$", "", merchant)

        # Strip known transaction mode codes
        for mode in _MODE_CODES:
            merchant = re.sub(
                r"\s+" + re.escape(mode) + r"(?:\s|$)",
                " ", merchant, flags=re.IGNORECASE,
            )

        # Strip known category labels (case-insensitive)
        for cat in _CATEGORY_LABELS:
            merchant = re.sub(
                r"\s+" + re.escape(cat) + r"\s*$",
                "", merchant, flags=re.IGNORECASE,
            )

        # General cleanup
        merchant = re.sub(r"\s+(IN|INDIA|IND)\s*$", "", merchant, flags=re.IGNORECASE)
        merchant = re.sub(r"^(PYU|PAY|RSP|ING|PPSL|BPPY)\*", "", merchant)
        merchant = re.sub(r"\(Ref#[^)]*\)", "", merchant)
        merchant = re.sub(r"\s+", " ", merchant).strip()

        return merchant[:512] if merchant else "Unknown"

    # ------------------------------------------------------------------
    # Date helpers
    # ------------------------------------------------------------------

    def _resolve_short_date(
        self,
        short: str,
        ref_year: int,
        period_start: Optional[date],
        period_end: Optional[date],
    ) -> Optional[date]:
        """Parse 'DD Mon' and infer the year from the statement period."""
        cleaned = short.strip()
        for fmt in ("%d %b", "%d %B"):
            try:
                parsed = datetime.strptime(cleaned, fmt).date()
                break
            except ValueError:
                continue
        else:
            return None

        candidate = parsed.replace(year=ref_year)

        if period_end and candidate > period_end:
            prev = candidate.replace(year=ref_year - 1)
            if period_start and prev >= period_start:
                return prev
            # Transaction is after period end but within the same year —
            # could be a post-period charge. Keep it.
            return candidate

        return candidate

    @staticmethod
    def _parse_text_date(date_str: str) -> Optional[date]:
        """Parse 'DD Mon YYYY' or 'DD Month YYYY'."""
        cleaned = date_str.strip().replace(",", "")
        cleaned = re.sub(r"\s+", " ", cleaned)
        for fmt in ("%d %b %Y", "%d %B %Y"):
            try:
                return datetime.strptime(cleaned, fmt).date()
            except ValueError:
                continue
        return None

    @staticmethod
    def _parse_numeric_date(date_str: str) -> Optional[date]:
        """Parse DD/MM/YYYY or DD-MM-YYYY variants."""
        for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y"):
            try:
                return datetime.strptime(date_str.strip(), fmt).date()
            except ValueError:
                continue
        return None
