"""HDFC Bank credit card statement parser.

Handles Regalia/Infinia/Diners style statements where pdfplumber
extracts transaction tables as single-column text strings with format:
  DD/MM/YYYY| HH:MM DESCRIPTION [+|- REWARDS] [+] C AMOUNT [l]

The ₹ symbol is rendered as 'C' by pdfplumber, and the PI column
colored dot renders as 'l'.
"""

import logging
import re
from datetime import date, datetime
from typing import List, Optional, Tuple

import pdfplumber

from backend.parsers.base import BaseParser, ParsedStatement, ParsedTransaction

logger = logging.getLogger(__name__)

_TX_DATE_RE = re.compile(r"(\d{2}/\d{2}/\d{4})\|\s*\d{2}:\d{2}\s+")

# Amount at end of line. Credit entries have '+' directly before the C (rupee symbol).
# Debit: "C 49,071.00 l"   Credit: "+ C 2.00 l"
_TX_AMOUNT_RE = re.compile(r"(\+\s+)?C\s*([\d,]+\.\d{2})\s*l?\s*$")

_BILLING_PERIOD_RE = re.compile(
    r"Billing\s+Period\s+(\d{1,2}\s+\w{3},?\s+\d{4})\s*[-\u2013]\s*(\d{1,2}\s+\w{3},?\s+\d{4})",
    re.IGNORECASE,
)

_CARD_NUM_RE = re.compile(
    r"(?:Credit\s+Card\s+No\.?\s*)"
    r"(\d{4,6}[X*x]+\d{2,4})",
    re.IGNORECASE,
)


_TOTAL_DUE_RE = re.compile(
    r"TOTAL\s+AMOUNT\s+DUE.*?C\s*([\d,]+(?:\.\d{2})?)",
    re.DOTALL | re.IGNORECASE,
)

_CREDIT_LIMIT_RE = re.compile(
    r"TOTAL\s+CREDIT\s+LIMIT.*?C\s*([\d,]+(?:\.\d{2})?)",
    re.DOTALL | re.IGNORECASE,
)


class HDFCParser(BaseParser):
    """Parser for HDFC Bank credit card statements."""

    def parse(self, pdf_path: str) -> ParsedStatement:
        all_lines: List[str] = []
        header_text = ""
        full_text = ""

        with pdfplumber.open(pdf_path) as pdf:
            for i, page in enumerate(pdf.pages):
                text = page.extract_text() or ""
                if i == 0:
                    header_text = text
                full_text += text + "\n"
                all_lines.extend(text.split("\n"))

                for table in page.extract_tables():
                    for row in table:
                        for cell in (row or []):
                            if cell:
                                all_lines.extend(str(cell).split("\n"))

        period_start, period_end = self._extract_period(header_text)
        card_last4 = self._extract_card_last4(header_text)
        transactions = self._extract_transactions(all_lines)
        total_amount_due = self._extract_total_amount_due(full_text)
        credit_limit = self._extract_credit_limit(full_text)

        logger.info(
            "HDFC parse: card=%s period=%s..%s txns=%d due=%s limit=%s",
            card_last4, period_start, period_end, len(transactions),
            total_amount_due, credit_limit,
        )

        return ParsedStatement(
            bank="hdfc",
            period_start=period_start,
            period_end=period_end,
            transactions=transactions,
            card_last4=card_last4,
            total_amount_due=total_amount_due,
            credit_limit=credit_limit,
        )

    # ------------------------------------------------------------------
    # Statement summary fields
    # ------------------------------------------------------------------

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
        anchor = re.search(r"TOTAL\s+CREDIT\s+LIMIT", text, re.IGNORECASE)
        if not anchor:
            return None

        # pdfplumber flattens multi-column rows, so smaller values
        # (e.g. Minimum Due) may appear before the actual limit.
        # Extract all amounts in a bounded window and return the largest.
        window = text[anchor.end() : anchor.end() + 250]
        cutoff = re.search(r"Past\s+Due|OVER\s+LIMIT", window, re.IGNORECASE)
        if cutoff:
            window = window[: cutoff.start()]

        amounts: List[float] = []
        for am in re.finditer(r"C\s*([\d,]+(?:\.\d{2})?)", window):
            try:
                val = float(am.group(1).replace(",", ""))
                if val > 0:
                    amounts.append(val)
            except ValueError:
                pass

        return max(amounts) if amounts else None

    # ------------------------------------------------------------------
    # Period
    # ------------------------------------------------------------------

    def _extract_period(self, text: str) -> Tuple[Optional[date], Optional[date]]:
        m = _BILLING_PERIOD_RE.search(text)
        if m:
            start = self._parse_text_date(m.group(1))
            end = self._parse_text_date(m.group(2))
            if start or end:
                return start, end

        fallback_patterns = [
            r"Billing\s+Period\s+(\d{2}[/-]\d{2}[/-]\d{2,4})\s*[-\u2013]\s*(\d{2}[/-]\d{2}[/-]\d{2,4})",
            r"Statement\s+Period[:\s]+(\d{2}[/-]\d{2}[/-]\d{2,4})\s*[-\u2013to]+\s*(\d{2}[/-]\d{2}[/-]\d{2,4})",
        ]
        for pat in fallback_patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                start = self._parse_numeric_date(m.group(1))
                end = self._parse_numeric_date(m.group(2))
                if start or end:
                    return start, end

        return None, None

    # ------------------------------------------------------------------
    # Card last-4
    # ------------------------------------------------------------------

    def _extract_card_last4(self, text: str) -> Optional[str]:
        m = _CARD_NUM_RE.search(text)
        if m:
            digits = re.sub(r"[^0-9]", "", m.group(1))
            if len(digits) >= 4:
                return digits[-4:]
        return None

    # ------------------------------------------------------------------
    # Transaction extraction
    # ------------------------------------------------------------------

    def _extract_transactions(self, lines: List[str]) -> List[ParsedTransaction]:
        transactions: List[ParsedTransaction] = []
        seen: set = set()

        # Normalize all lines once
        cleaned: List[str] = []
        for raw_line in lines:
            line = raw_line.strip()
            if not line:
                cleaned.append("")
                continue
            line = re.sub(r"\(cid:\d+\)", " ", line)
            line = re.sub(r"\s+", " ", line).strip()
            cleaned.append(line)

        # --- Pass 1: standard single-line transactions (original logic) ---
        for line in cleaned:
            if not line:
                continue
            tx = self._parse_transaction_line(line)
            if tx:
                key = (tx.date.isoformat(), tx.merchant, tx.amount, tx.type)
                if key not in seen:
                    seen.add(key)
                    transactions.append(tx)

        # --- Pass 2: multi-line transactions (e.g. UPI RuPay CC payments) ---
        # Some HDFC card statements (e.g. RuPay cards) put the description
        # on the line(s) ABOVE the date+amount line. When pass 1 extracts a
        # transaction with an empty merchant ("Unknown"), look backwards for
        # the description.
        self._fixup_multiline_transactions(cleaned, transactions)

        return transactions

    def _fixup_multiline_transactions(
        self,
        cleaned: List[str],
        transactions: List[ParsedTransaction],
    ) -> None:
        """For transactions with 'Unknown' merchant, look backwards in the
        source lines to find the description. This handles HDFC RuPay-style
        multi-line entries where description precedes the date+amount line."""
        unknown_txns = [tx for tx in transactions if tx.merchant == "Unknown"]
        if not unknown_txns:
            return

        for tx in unknown_txns:
            date_str = tx.date.strftime("%d/%m/%Y")
            for idx, line in enumerate(cleaned):
                if not line.startswith(date_str):
                    continue
                # Confirm this is the matching date+amount line
                if _TX_AMOUNT_RE.search(line[11:]) is None:
                    continue

                # Collect description from preceding non-empty lines,
                # stopping at another date line, header, or page boundary.
                desc_parts: List[str] = []
                for back in range(idx - 1, max(idx - 5, -1), -1):
                    prev = cleaned[back]
                    if not prev:
                        break
                    if _TX_DATE_RE.match(prev):
                        break
                    if any(kw in prev.upper() for kw in (
                        "DATE & TIME", "TRANSACTION DESCRIPTION",
                        "DOMESTIC TRANSACTION", "INTERNATIONAL TRANSACTION",
                        "PAGE ", "REWARDS",
                    )):
                        break
                    # Skip standalone reference numbers (continuation lines)
                    if re.match(r"^[A-Z0-9]{10,}\)?\s*$", prev):
                        continue
                    desc_parts.insert(0, prev)

                if desc_parts:
                    raw_desc = " ".join(desc_parts)
                    # Strip cardholder name if it appears as a standalone line
                    # (common: name on one line, description on the next)
                    if len(desc_parts) > 1:
                        raw_desc = " ".join(desc_parts[1:])
                    tx.merchant = self._clean_merchant(raw_desc)
                    tx.description = raw_desc
                break

    def _parse_transaction_line(self, line: str) -> Optional[ParsedTransaction]:
        date_match = _TX_DATE_RE.match(line)
        if not date_match:
            return None

        parsed_date = self._parse_numeric_date(date_match.group(1))
        if not parsed_date:
            return None

        rest = line[date_match.end():]

        amount_match = _TX_AMOUNT_RE.search(rest)
        if not amount_match:
            return None

        is_credit = amount_match.group(1) is not None
        amount_str = amount_match.group(2).replace(",", "")

        try:
            amount = float(amount_str)
        except ValueError:
            return None

        if amount <= 0:
            return None

        desc_raw = rest[: amount_match.start()].strip()

        # Strip trailing reward-point indicators like "+ 1308" or "- 120".
        # Require whitespace on both sides of the sign to avoid clipping
        # numbers that are part of descriptions (e.g. "RATE 18.0 -10").
        desc_raw = re.sub(r"\s+[+\-]\s+\d+\s*$", "", desc_raw).strip()

        merchant = self._clean_merchant(desc_raw)
        tx_type = "credit" if is_credit else "debit"

        return ParsedTransaction(
            date=parsed_date,
            merchant=merchant,
            amount=amount,
            type=tx_type,
            description=desc_raw,
        )

    # ------------------------------------------------------------------
    # Merchant cleanup
    # ------------------------------------------------------------------

    @staticmethod
    def _clean_merchant(raw: str) -> str:
        if not raw:
            return "Unknown"

        merchant = raw

        # Common gateway/EMI prefixes
        merchant = re.sub(r"^EMI\s+", "", merchant)
        merchant = re.sub(r"^(PYU|PAY|RSP|ING|PPSL|BPPY)\*", "", merchant)

        # Reference annotations — complete or truncated (multi-line wraps)
        merchant = re.sub(r"\(Ref#[^)]*\)?\s*$", "", merchant)

        merchant = merchant.strip()
        return merchant[:512] if merchant else raw[:512]

    # ------------------------------------------------------------------
    # Date helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_text_date(date_str: str) -> Optional[date]:
        """Parse 'DD Mon, YYYY' or 'DD Mon YYYY'."""
        cleaned = date_str.strip().replace(",", "")
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
