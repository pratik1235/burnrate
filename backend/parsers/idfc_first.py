"""IDFC FIRST Bank credit card statement parser.

IDFC FIRST Bank statements follow this structure:
  - Title includes: "Credit Card Statement"
  - Card number partially masked: e.g., "(XX9370)" or "XXXX 9370"
  - Summary section lists Total Amount Due, Minimum Amount Due, Credit Limit, and Payment Due Date.
  - Transactions are presented in a table with columns: 
    Transaction Date | Transaction Details | EMI Eligibility... | Amount
  - Transaction dates are typically "DD/MM/YYYY".
  - Amounts end in " CR" (credit) or " DR" (debit).
"""

import logging
import re
from datetime import date, datetime
from typing import List, Optional, Tuple

import pdfplumber

from backend.parsers.base import BaseParser, ParsedStatement, ParsedTransaction

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Regex Patterns
# ---------------------------------------------------------------------------

_PERIOD_RE = re.compile(
    r"(\d{2}/[A-Za-z]{3}/\d{4})\s*-\s*(\d{2}/[A-Za-z]{3}/\d{4})",
    re.IGNORECASE,
)

_CARD_RE = re.compile(r"[Xx]{2,4}\s*(\d{4})")

# Updated to aggressively handle newlines and spacing between the label and value
_TOTAL_DUE_RE = re.compile(
    r"Total\s+Amount\s+Due.*?\n\s*[r₹]?\s*([\d,]+\.\d{2})\s*(?:DR|CR)",
    re.IGNORECASE | re.DOTALL,
)

_MIN_DUE_RE = re.compile(
    r"Minimum\s+Amount\s+Due\s*[\r\n]+\s*([\d,]+\.\d{2})\s*(?:DR|CR)?",
    re.IGNORECASE,
)

_CREDIT_LIMIT_RE = re.compile(
    r"Total\s+Amount\s+Due.*?\n\s*[r₹]?\s*[\d,]+\.\d{2}\s*(?:DR|CR)\s+"
    r"[r₹]?\s*[\d,]+\.\d{2}\s*(?:DR|CR)\s+"
    r"[r₹]?\s*([\d,]+(?:\.\d{2})?)",
    re.IGNORECASE | re.DOTALL,
)

_DUE_DATE_RE = re.compile(
    r"Payment\s+Due\s+Date\s*[\r\n]+\s*(\d{2}/[A-Za-z]{3}/\d{4})",
    re.IGNORECASE,
)


class IDFCFirstBankParser(BaseParser):
    """Parser for IDFC FIRST Bank credit card statements."""

    def parse(self, pdf_path: str) -> ParsedStatement:
        full_text = ""
        table_rows: List[List[str]] = []

        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                full_text += text + "\n"

                for table in page.extract_tables():
                    for row in table:
                        if row:
                            table_rows.append([str(c or "").strip() for c in row])

        period_start, period_end = self._extract_period(full_text)
        card_last4 = self._extract_card_last4(full_text)
        
        # Searching the full_text block directly for the summary values
        total_amount_due = self._extract_amount(full_text, _TOTAL_DUE_RE)
        min_amount_due = self._extract_amount(full_text, _MIN_DUE_RE)
        credit_limit = self._extract_amount(full_text, _CREDIT_LIMIT_RE)
        payment_due_date = self._extract_date(full_text, _DUE_DATE_RE)

        transactions = self._extract_transactions(table_rows)

        logger.info(
            "IDFC parse: card=%s period=%s..%s txns=%d due=%s min_due=%s limit=%s due_date=%s",
            card_last4, period_start, period_end, len(transactions),
            total_amount_due, min_amount_due, credit_limit, payment_due_date
        )

        return ParsedStatement(
            bank="idfc_first",
            period_start=period_start,
            period_end=period_end,
            transactions=transactions,
            card_last4=card_last4,
            total_amount_due=total_amount_due,
            credit_limit=credit_limit,
        )

    # ------------------------------------------------------------------
    # Extraction Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_period(text: str) -> Tuple[Optional[date], Optional[date]]:
        m = _PERIOD_RE.search(text)
        if m:
            try:
                start = datetime.strptime(m.group(1), "%d/%b/%Y").date()
                end = datetime.strptime(m.group(2), "%d/%b/%Y").date()
                return start, end
            except ValueError:
                pass
        return None, None

    @staticmethod
    def _extract_card_last4(text: str) -> Optional[str]:
        m = _CARD_RE.search(text)
        return m.group(1) if m else None

    @staticmethod
    def _extract_amount(text: str, pattern: re.Pattern) -> Optional[float]:
        # We finditer to grab the first occurrence in the summary section 
        # to avoid hitting table headers later in the document.
        for m in pattern.finditer(text):
            try:
                return float(m.group(1).replace(",", ""))
            except ValueError:
                continue
        return None

    @staticmethod
    def _extract_date(text: str, pattern: re.Pattern) -> Optional[date]:
        m = pattern.search(text)
        if m:
            try:
                return datetime.strptime(m.group(1), "%d/%b/%Y").date()
            except ValueError:
                pass
        return None

    # ------------------------------------------------------------------
    # Transaction Extraction
    # ------------------------------------------------------------------

    def _extract_transactions(self, table_rows: List[List[str]]) -> List[ParsedTransaction]:
        seen: set = set()
        transactions: List[ParsedTransaction] = []
        table_rows = table_rows[2:]

        for row in table_rows:
            if len(row) < 3:
                continue

            # PDFPlumber often squashes multiple rows into one cell separated by newlines.
            # We split the cells by newline to unpack them.
            dates_raw = [row[0]]
            desc_raw = [row[2]]
            amounts_raw = [row[5]]

            # Guardrail: Skip if there are no dates, no amounts, or the first date is invalid
            if not dates_raw or not amounts_raw or not re.match(r"^\d{2}/\d{2}/\d{4}$", dates_raw[0]):
                continue

            # If lengths match, we can safely zip them. If descriptions are split weirdly
            # due to text wrapping, we join them as a fallback.
            if len(dates_raw) == len(amounts_raw):
                for i in range(len(dates_raw)):
                    parsed_date = self._parse_numeric_date(dates_raw[i])
                    if not parsed_date:
                        continue
                    
                    # Try to map the description index, fallback to the first one if wrapped
                    desc = desc_raw[i] if i < len(desc_raw) else " ".join(desc_raw)
                    amount_str = amounts_raw[i].upper()
                    self._process_and_append_tx(parsed_date, desc, amount_str, seen, transactions)
            else:
                # Fallback: if columns are completely misaligned, just grab the first valid set
                parsed_date = self._parse_numeric_date(dates_raw[0])
                if parsed_date:
                    self._process_and_append_tx(
                        parsed_date, 
                        " ".join(desc_raw), 
                        amounts_raw[0].upper(), 
                        seen, 
                        transactions
                    )

        return transactions

    def _process_and_append_tx(
        self, 
        parsed_date: date, 
        description: str, 
        amount_str: str, 
        seen: set, 
        transactions: list
    ):
        is_credit =  amount_str.endswith("CR")
        clean_amount = amount_str.replace("CR", "").replace("DR", "").replace(",", "").strip()
        
        try:
            amount = float(clean_amount)
        except ValueError:
            return
            
        if amount <= 0:
            return

        tx = ParsedTransaction(
            date=parsed_date,
            merchant=self._clean_merchant(description),
            amount=amount,
            type="credit" if is_credit else "debit",
            description=description,
        )

        key = (tx.date.isoformat(), tx.merchant, tx.amount, tx.type)
        if key not in seen:
            seen.add(key)
            transactions.append(tx)

    @staticmethod
    def _parse_numeric_date(date_str: str) -> Optional[date]:
        try:
            return datetime.strptime(date_str, "%d/%m/%Y").date()
        except ValueError:
            return None

    @staticmethod
    def _clean_merchant(raw: str) -> str:
        if not raw:
            return "Unknown"
        merchant = raw
        merchant = re.sub(r"^UPICC/(DR|CR)/\d+/", "", merchant, flags=re.IGNORECASE)
        merchant = re.sub(r"^UPI/\d+/\d+/", "", merchant, flags=re.IGNORECASE)
        merchant = re.sub(r"\s+", " ", merchant).strip()
        return merchant[:512] if merchant else "Unknown"
