"""Base CSV parser for bank account statements.

Provides shared utilities for reading CSV files, detecting columns,
and parsing common date formats used by Indian banks.
"""

import csv
import io
import logging
import re
from abc import abstractmethod
from datetime import date, datetime
from typing import Dict, List, Optional, Tuple

from backend.parsers.base import BaseParser, ParsedStatement, ParsedTransaction
from backend.parsers.currency_infer import (
    hint_from_amount_string,
    normalize_currency_code,
    resolve_currency_from_hints,
)

logger = logging.getLogger(__name__)


DATE_FORMATS = [
    "%d/%m/%Y",
    "%d/%m/%y",
    "%d-%m-%Y",
    "%d-%m-%y",
    "%d %b %Y",
    "%d %b %y",
    "%d-%b-%Y",
    "%d-%b-%y",
    "%d %B %Y",
    "%Y-%m-%d",
    "%m/%d/%Y",
]


def parse_date_flexible(date_str: str) -> Optional[date]:
    """Try multiple date formats to parse a date string."""
    cleaned = date_str.strip().replace(",", "")
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue
    return None


def parse_amount(amount_str: str) -> Optional[float]:
    """Parse an amount string, handling commas, currency symbols, and whitespace."""
    if not amount_str:
        return None
    cleaned = amount_str.strip()
    cleaned = re.sub(r"[₹$€£,\s]", "", cleaned)
    cleaned = cleaned.replace("(", "-").replace(")", "")
    if not cleaned or cleaned in ("-", "."):
        return None
    try:
        val = float(cleaned)
        return abs(val)
    except ValueError:
        return None


def read_csv_content(file_path: str) -> Tuple[List[str], List[List[str]]]:
    """Read a CSV file, stripping BOM and returning (headers, rows).

    Returns normalized lowercase header names and raw row data.
    """
    with open(file_path, "r", encoding="utf-8-sig", errors="replace") as f:
        content = f.read()

    content = content.strip()
    if not content:
        return [], []

    reader = csv.reader(io.StringIO(content))
    all_rows = list(reader)

    if not all_rows:
        return [], []

    header_idx = _find_header_row(all_rows)
    if header_idx is None:
        return [], []

    headers = [h.strip().lower() for h in all_rows[header_idx]]
    data_rows = all_rows[header_idx + 1:]

    non_empty = [r for r in data_rows if any(cell.strip() for cell in r)]
    return headers, non_empty


def _find_header_row(rows: List[List[str]]) -> Optional[int]:
    """Find the row index containing column headers.

    Checks the first 15 rows for rows containing date-like header names.
    """
    date_keywords = {"date", "txn date", "tran date", "transaction date", "value date", "value dt"}
    for i, row in enumerate(rows[:15]):
        lower_cells = {c.strip().lower() for c in row if c.strip()}
        if lower_cells & date_keywords:
            return i
    return None


class BaseBankCSVParser(BaseParser):
    """Base class for bank account CSV statement parsers.

    Subclasses implement `_get_column_mapping` and optionally override
    `_parse_date` or `_clean_description` for bank-specific behavior.
    """

    bank_name: str = "unknown"

    def parse(self, csv_path: str) -> ParsedStatement:
        """Parse a CSV bank statement file."""
        headers, rows = read_csv_content(csv_path)

        if not headers or not rows:
            logger.warning("Empty CSV or no header row found: %s", csv_path)
            return ParsedStatement(
                bank=self.bank_name,
                period_start=None,
                period_end=None,
                transactions=[],
            )

        col_map = self._get_column_mapping(headers)
        if not col_map:
            logger.warning("Could not map columns for %s: %s", self.bank_name, headers)
            return ParsedStatement(
                bank=self.bank_name,
                period_start=None,
                period_end=None,
                transactions=[],
            )

        transactions = self._extract_transactions(rows, col_map, len(headers))
        account_last4 = self._extract_account_last4(rows, col_map, headers)
        currency = self._resolve_csv_currency(headers, rows, col_map)

        period_start = min((t.date for t in transactions), default=None)
        period_end = max((t.date for t in transactions), default=None)

        logger.info(
            "%s CSV parse: account=%s period=%s..%s txns=%d currency=%s",
            self.bank_name, account_last4, period_start, period_end,
            len(transactions), currency,
        )

        return ParsedStatement(
            bank=self.bank_name,
            period_start=period_start,
            period_end=period_end,
            transactions=transactions,
            card_last4=account_last4,
            currency=currency,
        )

    def _currency_column_index(self, headers: List[str]) -> Optional[int]:
        for i, h in enumerate(headers):
            hl = h.strip().lower()
            if hl in ("currency", "curr", "txn currency", "transaction currency", "iso currency"):
                return i
            if "currency" in hl:
                return i
        return None

    def _resolve_csv_currency(
        self, headers: List[str], rows: List[List[str]], col_map: Dict[str, int],
    ) -> str:
        hints: List[Optional[str]] = []
        curr_idx = self._currency_column_index(headers)
        if curr_idx is not None:
            for row in rows:
                if curr_idx < len(row):
                    c = normalize_currency_code(row[curr_idx])
                    if c:
                        hints.append(c)
        for row in rows:
            if len(row) < max(col_map.values()) + 1:
                continue
            if "debit" in col_map:
                h = hint_from_amount_string(row[col_map["debit"]])
                if h:
                    hints.append(h)
            if "credit" in col_map:
                h = hint_from_amount_string(row[col_map["credit"]])
                if h:
                    hints.append(h)
        return resolve_currency_from_hints(hints)

    @abstractmethod
    def _get_column_mapping(self, headers: List[str]) -> Optional[Dict[str, int]]:
        """Return a dict mapping logical names to column indices.

        Required keys: 'date', 'description'
        Optional keys: 'debit', 'credit', 'balance', 'ref'

        Return None if headers don't match this bank's format.
        """

    def _extract_transactions(
        self, rows: List[List[str]], col_map: Dict[str, int], num_cols: int,
    ) -> List[ParsedTransaction]:
        transactions: List[ParsedTransaction] = []

        for row in rows:
            if len(row) < max(col_map.values()) + 1:
                continue

            date_str = row[col_map["date"]].strip()
            if not date_str:
                continue

            parsed_date = self._parse_date(date_str)
            if not parsed_date:
                continue

            desc = row[col_map["description"]].strip() if "description" in col_map else ""
            desc = self._clean_description(desc)
            if not desc:
                desc = "Unknown"

            debit_val = None
            credit_val = None

            if "debit" in col_map:
                debit_val = parse_amount(row[col_map["debit"]])
            if "credit" in col_map:
                credit_val = parse_amount(row[col_map["credit"]])

            if debit_val and debit_val > 0:
                transactions.append(ParsedTransaction(
                    date=parsed_date,
                    merchant=desc[:512],
                    amount=debit_val,
                    type="debit",
                    description=desc,
                ))
            elif credit_val and credit_val > 0:
                transactions.append(ParsedTransaction(
                    date=parsed_date,
                    merchant=desc[:512],
                    amount=credit_val,
                    type="credit",
                    description=desc,
                ))

        return transactions

    def _parse_date(self, date_str: str) -> Optional[date]:
        """Parse a date string. Override for bank-specific formats."""
        return parse_date_flexible(date_str)

    def _clean_description(self, desc: str) -> str:
        """Clean up a transaction description. Override for bank-specific cleanup."""
        desc = re.sub(r"\s+", " ", desc).strip()
        return desc

    def _extract_account_last4(
        self, rows: List[List[str]], col_map: Dict[str, int],
        headers: List[str],
    ) -> Optional[str]:
        """Try to extract account last 4 digits from the CSV data.

        Override in subclass for bank-specific extraction.
        """
        return None
