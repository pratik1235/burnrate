"""Generic credit card statement parser.

Fallback parser for banks without a dedicated parser. Uses common
patterns found in Indian bank credit card statements to extract
statement metadata and transactions.
"""

import logging
import re
from datetime import date, datetime
from typing import List, Optional, Tuple

import pdfplumber

from backend.parsers.base import BaseParser, ParsedStatement, ParsedTransaction
from backend.parsers.currency_infer import infer_currency_from_document_text

logger = logging.getLogger(__name__)


class GenericParser(BaseParser):
    """Fallback parser for unsupported bank statements."""

    def __init__(self, bank: str = "unknown"):
        self._bank = bank

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
        currency = infer_currency_from_document_text(full_text)

        logger.info(
            "Generic parse (%s): card=%s period=%s..%s txns=%d due=%s limit=%s currency=%s",
            self._bank, card_last4, period_start, period_end,
            len(transactions), total_amount_due, credit_limit, currency,
        )

        return ParsedStatement(
            bank=self._bank,
            period_start=period_start,
            period_end=period_end,
            transactions=transactions,
            card_last4=card_last4,
            total_amount_due=total_amount_due,
            credit_limit=credit_limit,
            currency=currency,
        )

    def _extract_period(self, text: str) -> Tuple[Optional[date], Optional[date]]:
        patterns = [
            r"Statement\s+Period[:\s]+(\d{2}[/-]\d{2}[/-]\d{2,4})\s*[-–to]+\s*(\d{2}[/-]\d{2}[/-]\d{2,4})",
            r"Billing\s+Period[:\s]+(\d{2}[/-]\d{2}[/-]\d{2,4})\s*[-–to]+\s*(\d{2}[/-]\d{2}[/-]\d{2,4})",
            r"From\s+(\d{2}[/-]\d{2}[/-]\d{2,4})\s+[Tt]o\s+(\d{2}[/-]\d{2}[/-]\d{2,4})",
            r"(\d{2}[/-]\d{2}[/-]\d{4})\s*[-–]\s*(\d{2}[/-]\d{2}[/-]\d{4})",
        ]
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                start = self._parse_date(m.group(1))
                end = self._parse_date(m.group(2))
                if start and end:
                    return start, end
        return None, None

    @staticmethod
    def _extract_card_last4(text: str) -> Optional[str]:
        for m in re.finditer(r"(\d{4,6})[Xx*]{4,}(\d{4})", text):
            return m.group(2)
        return None

    @staticmethod
    def _extract_total_amount_due(text: str) -> Optional[float]:
        patterns = [
            r"Total\s+Amount\s+Due.*?([\d,]+\.\d{2})",
            r"Total\s+Payment\s+Due.*?([\d,]+\.\d{2})",
            r"Amount\s+Payable.*?([\d,]+\.\d{2})",
        ]
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE | re.DOTALL)
            if m:
                try:
                    return float(m.group(1).replace(",", ""))
                except ValueError:
                    pass
        return None

    @staticmethod
    def _extract_credit_limit(text: str) -> Optional[float]:
        patterns = [
            r"Credit\s+Limit.*?([\d,]+\.\d{2})",
            r"Total\s+Credit\s+Limit.*?([\d,]+\.\d{2})",
        ]
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE | re.DOTALL)
            if m:
                try:
                    val = float(m.group(1).replace(",", ""))
                    if val > 0:
                        return val
                except ValueError:
                    pass
        return None

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
        # Pattern: DD/MM/YYYY description amount [Dr/Cr]
        m = re.match(
            r"^(\d{2}[/-]\d{2}[/-]\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s*(Dr|Cr|CR|DR)?\s*$",
            line,
            re.IGNORECASE,
        )
        if not m:
            return None

        parsed_date = self._parse_date(m.group(1))
        if not parsed_date:
            return None

        raw_desc = m.group(2).strip()
        amount_str = m.group(3).replace(",", "")
        direction = (m.group(4) or "").strip().lower()

        try:
            amount = float(amount_str)
        except ValueError:
            return None

        if amount <= 0:
            return None

        is_credit = direction in ("cr",)
        tx_type = "credit" if is_credit else "debit"

        return ParsedTransaction(
            date=parsed_date,
            merchant=raw_desc[:512] if raw_desc else "Unknown",
            amount=amount,
            type=tx_type,
            description=raw_desc,
        )

    @staticmethod
    def _parse_date(date_str: str) -> Optional[date]:
        for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y"):
            try:
                return datetime.strptime(date_str.strip(), fmt).date()
            except ValueError:
                continue
        return None
