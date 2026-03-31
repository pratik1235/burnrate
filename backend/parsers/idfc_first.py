"""IDFC FIRST Bank credit card statement parser.

Layout (typical portal PDF):
- Title includes "Credit Card Statement"; card masked as (XX9370) or XXXX 9370.
- Statement period often DD/Mon/YYYY - DD/Mon/YYYY.
- Summary: Total Amount Due, Minimum Amount Due, Credit Limit, Payment Due Date.
- Transactions: table with Transaction Date (DD/MM/YYYY), details, amount ending in DR/CR;
  pdfplumber may merge cells with embedded newlines — we split and zip columns.
"""

import logging
import re
from datetime import date, datetime
from typing import List, Optional, Tuple

import pdfplumber

from backend.parsers.base import BaseParser, ParsedStatement, ParsedTransaction
from backend.parsers.currency_infer import infer_currency_from_document_text

logger = logging.getLogger(__name__)

# Bound full-document regex scans (first pages contain summary; reduces pathological cost).
_SUMMARY_SCAN_CHARS = 14_000

_PERIOD_RE = re.compile(
    r"(\d{2}/[A-Za-z]{3}/\d{4})\s*[-–]\s*(\d{2}/[A-Za-z]{3}/\d{4})",
    re.IGNORECASE,
)

_CARD_RE = re.compile(r"[Xx]{2,4}\s*(\d{4})")

# Next line is often "Rs 1,234.56 DR" — avoid DOTALL .*? which can skip to Minimum Amount Due.
_TOTAL_DUE_RE = re.compile(
    r"Total\s+Amount\s+Due\s*\n\s*(?:rs\.?|inr|[r₹])\s*([\d,]+\.\d{2})\s*(?:DR|CR)",
    re.IGNORECASE,
)

_MIN_DUE_RE = re.compile(
    r"Minimum\s+Amount\s+Due\s*[\r\n]+\s*[r₹]?\s*([\d,]+\.\d{2})\s*(?:DR|CR)?",
    re.IGNORECASE,
)

# Credit limit: label-based (more stable than chaining off total-due layout).
_CREDIT_LIMIT_RE = re.compile(
    r"Credit\s+Limit\s*[\r\n:]*\s*[r₹]?\s*([\d,]+(?:\.\d{2})?)",
    re.IGNORECASE,
)

# Fallback if label pattern misses (some templates inline summary in one block).
_CREDIT_LIMIT_INLINE_RE = re.compile(
    r"Total\s+Amount\s+Due\s*.*?\n\s*[r₹]?\s*[\d,]+\.\d{2}\s*(?:DR|CR)\s+"
    r"[r₹]?\s*[\d,]+\.\d{2}\s*(?:DR|CR)?\s+"
    r"[r₹]?\s*([\d,]+(?:\.\d{2})?)\b",
    re.IGNORECASE | re.DOTALL,
)

_TX_TEXT_LINE_RE = re.compile(
    r"^(\d{2}/\d{2}/\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s*(DR|CR)\s*$",
    re.IGNORECASE,
)


class IDFCFirstBankParser(BaseParser):
    """Parser for IDFC FIRST Bank credit card statements."""

    def parse(self, pdf_path: str) -> ParsedStatement:
        full_text = ""
        table_rows: List[List[str]] = []
        text_lines: List[str] = []

        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                full_text += text + "\n"
                text_lines.extend(line.strip() for line in text.split("\n") if line.strip())
                for table in page.extract_tables() or []:
                    for row in table:
                        if row:
                            table_rows.append([str(c or "").strip() for c in row])

        summary_blob = full_text[:_SUMMARY_SCAN_CHARS]
        period_start, period_end = self._extract_period(summary_blob)
        card_last4 = self._extract_card_last4(full_text)
        total_amount_due = self._extract_amount(summary_blob, _TOTAL_DUE_RE)
        min_amount_due = self._extract_amount(summary_blob, _MIN_DUE_RE)
        credit_limit = self._extract_amount(summary_blob, _CREDIT_LIMIT_RE)
        if credit_limit is None:
            credit_limit = self._extract_amount(summary_blob, _CREDIT_LIMIT_INLINE_RE)

        transactions = self._extract_transactions_from_tables(table_rows)
        if not transactions:
            transactions = self._extract_transactions_from_text_lines(text_lines)

        currency = infer_currency_from_document_text(full_text)

        logger.debug(
            "IDFC parse: bank=idfc_first period=%s..%s txns=%d due=%s min_due=%s limit=%s currency=%s",
            period_start,
            period_end,
            len(transactions),
            total_amount_due,
            min_amount_due,
            credit_limit,
            currency,
        )

        return ParsedStatement(
            bank="idfc_first",
            period_start=period_start,
            period_end=period_end,
            transactions=transactions,
            card_last4=card_last4,
            total_amount_due=total_amount_due,
            credit_limit=credit_limit,
            currency=currency,
        )

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
        for m in pattern.finditer(text):
            try:
                return float(m.group(1).replace(",", ""))
            except ValueError:
                continue
        return None

    def _extract_transactions_from_tables(
        self, table_rows: List[List[str]],
    ) -> List[ParsedTransaction]:
        header_idx, col_map = self._find_transaction_header(table_rows)
        if header_idx is None or not col_map:
            return []

        data_rows = table_rows[header_idx + 1 :]
        seen: set = set()
        out: List[ParsedTransaction] = []

        date_col = col_map.get("date")
        desc_col = col_map.get("desc")
        amt_col = col_map.get("amount")
        if date_col is None or amt_col is None:
            return []

        for row in data_rows:
            if not row or len(row) <= max(date_col, amt_col):
                continue
            dates = [x.strip() for x in row[date_col].split("\n") if x.strip()]
            amounts_raw = [x.strip().upper() for x in row[amt_col].split("\n") if x.strip()]
            desc_parts = []
            if desc_col is not None and desc_col < len(row):
                desc_parts = [x.strip() for x in row[desc_col].split("\n") if x.strip()]

            if not dates or not amounts_raw:
                continue

            n = min(len(dates), len(amounts_raw))
            for i in range(n):
                parsed_date = self._parse_numeric_date(dates[i])
                if not parsed_date:
                    continue
                desc = desc_parts[i] if i < len(desc_parts) else (
                    " ".join(desc_parts) if desc_parts else ""
                )
                self._process_and_append_tx(
                    parsed_date, desc, amounts_raw[i], seen, out,
                )

        return out

    @staticmethod
    def _find_transaction_header(
        table_rows: List[List[str]],
    ) -> Tuple[Optional[int], dict]:
        """Locate header row and column indices for date / description / amount."""
        for i, row in enumerate(table_rows):
            if not row:
                continue
            cells_lower = [str(c or "").lower() for c in row]
            joined = " ".join(cells_lower)
            if "transaction" not in joined or "date" not in joined:
                continue

            date_col: Optional[int] = None
            desc_col: Optional[int] = None
            amt_col: Optional[int] = None

            for j, cl in enumerate(cells_lower):
                if "transaction" in cl and "date" in cl:
                    date_col = j
                elif any(
                    k in cl for k in ("detail", "description", "narration", "particular", "merchant")
                ):
                    desc_col = j
                elif "amount" in cl and "eligible" not in cl:
                    amt_col = j

            if amt_col is None and i + 1 < len(table_rows):
                nxt = [str(c or "").lower() for c in table_rows[i + 1]]
                for j, cl in enumerate(nxt):
                    if "amount" in cl or cl.strip() in ("dr", "cr"):
                        amt_col = j
                        break

            if date_col is not None and amt_col is None and len(row) >= 6:
                date_col, desc_col, amt_col = 0, 2, 5
            elif date_col is not None and amt_col is None:
                amt_col = len(row) - 1

            if date_col is None or amt_col is None:
                continue

            if desc_col is None:
                desc_col = date_col + 1 if date_col + 1 < amt_col else max(0, amt_col - 1)

            return i, {"date": date_col, "desc": desc_col, "amount": amt_col}

        return None, {}

    def _extract_transactions_from_text_lines(
        self, lines: List[str],
    ) -> List[ParsedTransaction]:
        seen: set = set()
        out: List[ParsedTransaction] = []
        for line in lines:
            m = _TX_TEXT_LINE_RE.match(line.strip())
            if not m:
                continue
            parsed_date = self._parse_numeric_date(m.group(1))
            if not parsed_date:
                continue
            desc = m.group(2).strip()
            amount_str = f"{m.group(3)} {m.group(4)}".upper()
            self._process_and_append_tx(parsed_date, desc, amount_str, seen, out)
        return out

    def _process_and_append_tx(
        self,
        parsed_date: date,
        description: str,
        amount_str: str,
        seen: set,
        transactions: list,
    ) -> None:
        amount_str = amount_str.strip().upper()
        is_credit = amount_str.endswith("CR")
        clean_amount = (
            amount_str.replace("CR", "").replace("DR", "").replace(",", "").strip()
        )
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
            return datetime.strptime(date_str.strip(), "%d/%m/%Y").date()
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
