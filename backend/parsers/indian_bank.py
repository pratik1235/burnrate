"""Indian Bank (OneCard) credit card statement parser.

Indian Bank OneCard statements follow this structure:
  - Title: "Indian Bank One Credit Card Statement (DD Mon YYYY - DD Mon YYYY)"
  - Card number: NNNN-NNXX-XXXX-NNNN (dash-separated, partially masked)
  - Summary with Opening Balance, Total Amount Due, Statement Date, etc.
  - Transaction table columns: Date | Merchant | Category | Mode | Reward Points | Amount
  - Transaction dates use "DD Mon" without year; year is inferred from statement period.
  - Transactions continue across pages, ending before "IMPORTANT INFORMATION".

Credit detection strategy (green cell — sole signal):
  The PDF renders the Amount cell with a light-green background
  (non_stroking_color ≈ (0.843, 0.973, 0.804)) for every credit row (payments,
  refunds, chargebacks). This is the authoritative visual signal used by the bank
  and is the ONLY criterion used to classify a transaction as credit. Category
  keywords ("Repayments", "Refunds", etc.) are NOT used for type classification;
  they are retained solely for merchant cleaning and category-slug mapping.

Password format: First 4 letters of name (UPPERCASE) + DOB as DDMM.
"""

import logging
import re
from datetime import date, datetime
from typing import List, Optional, Tuple

import pdfplumber

from backend.parsers.base import BaseParser, ParsedStatement, ParsedTransaction, detect_emi_transaction
from backend.parsers.payment_due_date import extract_payment_due_date_from_text

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
    r"Total\s+Amount\s+Due\s*[=\s]*(-?[\d,]+\.\d{2})\s*(Cr|Dr|CR|DR)?",
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
    "chargeback",
})

# The exact RGB (0-1 scale) used by Indian Bank to highlight credit amount cells.
# Green background = credit transaction (payment, refund, chargeback, etc.).
_GREEN_CELL_COLOR: Tuple[float, float, float] = (0.84314, 0.97255, 0.80392)
# Tolerance for floating-point colour comparison
_GREEN_COLOR_TOLERANCE: float = 0.015

# Transaction mode codes to strip from merchant descriptions
_MODE_CODES = [
    "TOKEN_ECOM", "ECOM", "POS", "CONTACTLESS",
    "IMPS", "NEFT", "ATM", "NFC",
]

# Category labels that pdfplumber injects into the text from the PDF table
_CATEGORY_LABELS = [
    "Food & Dining", "Shopping", "Entertainment", "Travel",
    "Bills and Utilities", "Utilities", "Health", "Education", "Groceries", "Fuel",
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
        # Amounts (normalised strings) whose PDF cell is green → confirmed credit.
        green_amount_keys: set = set()

        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                full_text += text + "\n"
                all_lines.extend(text.split("\n"))

                for table in page.extract_tables():
                    for row in table:
                        if row:
                            table_rows.append([str(c or "").strip() for c in row])

                # Detect credit transactions via green Amount-cell highlighting.
                green_amount_keys |= self._extract_green_amount_keys(page)

        logger.debug(
            "Indian Bank: detected %d green-highlighted amount cell(s): %s",
            len(green_amount_keys), green_amount_keys,
        )

        period_start, period_end = self._extract_period(full_text)
        card_last4 = self._extract_card_last4(full_text)
        total_amount_due = self._extract_total_amount_due(full_text)
        credit_limit = self._extract_credit_limit(full_text)
        transactions = self._extract_transactions(
            all_lines, table_rows, period_start, period_end,
            green_amount_keys=green_amount_keys,
        )
        payment_due_date = extract_payment_due_date_from_text(full_text)

        card_variant = self._extract_card_variant(full_text)

        logger.info(
            "Indian Bank parse: card=%s variant=%s period=%s..%s txns=%d due=%s limit=%s payment_due=%s",
            card_last4, card_variant, period_start, period_end, len(transactions),
            total_amount_due, credit_limit, payment_due_date,
        )

        return ParsedStatement(
            bank="indian_bank",
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
    # Green-cell credit detection
    # ------------------------------------------------------------------

    @staticmethod
    def _is_green_cell_color(color: object) -> bool:
        """Return True if *color* matches the Indian Bank credit-highlight green.

        The bank renders the Amount cell of every credit transaction with a
        light-green background.  In pdfplumber the rect's ``non_stroking_color``
        is a 3-tuple of floats in the 0-1 range.  We compare component-wise
        within a small tolerance to handle minor PDF rendering variations.
        """
        if not isinstance(color, (tuple, list)) or len(color) < 3:
            return False
        r, g, b = float(color[0]), float(color[1]), float(color[2])
        tr, tg, tb = _GREEN_CELL_COLOR
        return (
            abs(r - tr) <= _GREEN_COLOR_TOLERANCE
            and abs(g - tg) <= _GREEN_COLOR_TOLERANCE
            and abs(b - tb) <= _GREEN_COLOR_TOLERANCE
        )

    def _extract_green_amount_keys(self, page: object) -> set:
        """Return a set of composite 'DD Mon|amount' keys for green Amount cells.

        Using a composite key of (date, amount) rather than amount alone prevents
        false-positive credit classification when the same amount appears on multiple
        dates but only some of those rows are highlighted green.  For each green rect,
        the date is read from the leftmost characters of the same text row (same Y
        band), producing a key like ``'20 Sep|353.00'`` that is unique per row.
        """
        keys: set = set()
        green_rects = [
            r for r in page.rects
            if r.get("fill") and self._is_green_cell_color(r.get("non_stroking_color"))
        ]
        if not green_rects:
            return keys

        chars = page.chars  # list of character dicts with positional info
        for rect in green_rects:
            rx0, rtop, rx1, rbottom = rect["x0"], rect["top"], rect["x1"], rect["bottom"]
            chars_in_rect = [
                c for c in chars
                if rx0 <= c["x0"] and c["x1"] <= rx1
                and rtop <= c["top"] and c["bottom"] <= rbottom
            ]
            if not chars_in_rect:
                # Widen tolerance slightly — allow chars that merely overlap
                chars_in_rect = [
                    c for c in chars
                    if c["x0"] < rx1 and c["x1"] > rx0
                    and c["top"] < rbottom and c["bottom"] > rtop
                ]
            if not chars_in_rect:
                continue

            # --- Amount: text within the green rect ---
            raw_amount = "".join(
                c["text"] for c in sorted(chars_in_rect, key=lambda c: c["x0"])
            ).strip()
            normalised_amount = raw_amount.replace(",", "")
            if not re.match(r"^[\d.]+$", normalised_amount):
                continue

            # --- Date: leftmost chars of the same horizontal text row ---
            y_center = sum(c["top"] for c in chars_in_rect) / len(chars_in_rect)
            row_chars = [c for c in chars if abs(c["top"] - y_center) < 7]
            # Date column occupies the far-left of the row (x0 < 85 pt)
            date_chars = [c for c in row_chars if c["x0"] < 85]
            date_raw = "".join(
                c["text"] for c in sorted(date_chars, key=lambda c: c["x0"])
            ).strip()
            m = re.match(r"^(\d{2}\s+\w{3})", date_raw)
            date_key = m.group(1) if m else ""

            key = f"{date_key}|{normalised_amount}"
            keys.add(key)
            logger.debug(
                "Green amount cell: raw='%s' date='%s' → key='%s'",
                raw_amount, date_key, key,
            )
        return keys

    # ------------------------------------------------------------------
    # Card variant
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_card_variant(text: str) -> Optional[str]:
        """Indian Bank only issues 'One Credit Card' — return it as a constant
        if the statement header confirms it."""
        if re.search(r"One\s+Credit\s+Card", text, re.IGNORECASE):
            return "One Credit Card"
        return None

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
                val = float(m.group(1).replace(",", ""))
                if m.group(1).startswith("-") or (m.group(2) and m.group(2).lower() == "cr"):
                    val = -abs(val)
                values.append(val)
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
        green_amount_keys: Optional[set] = None,
    ) -> List[ParsedTransaction]:
        ref_year = (
            period_end.year if period_end
            else period_start.year if period_start
            else date.today().year
        )
        green_amount_keys = green_amount_keys or set()

        seen: set = set()
        # Tracks (date_iso, amount) pairs already captured by text extraction.
        # The table extractor is supplemental — it only adds rows that text missed.
        # When text and table both parse the same physical PDF row they produce
        # different merchant strings (e.g. "Blinkit Groceries -7.06" vs "Blinkit"),
        # so the strict (date, merchant, amount, type) dedup key does not catch the
        # duplicate.  This looser set ensures table rows that match an already-seen
        # (date, amount) pair are silently skipped.
        seen_date_amount: set = set()
        transactions: List[ParsedTransaction] = []

        # --- Text-based extraction (most reliable for this format) ---
        in_tx_section = False
        for text_line_idx, raw_line in enumerate(lines):
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

            tx = self._parse_text_line(
                line, ref_year, period_start, period_end,
                green_amount_keys=green_amount_keys,
            )
            if tx:
                if self._add_unique(tx, seen, transactions, source_idx=("text", text_line_idx)):
                    seen_date_amount.add((tx.date.isoformat(), tx.amount))

        # --- Table-based extraction (supplement; catches rows text misses) ---
        for row_idx, row in enumerate(table_rows):
            tx = self._parse_table_row(
                row, ref_year, period_start, period_end,
                green_amount_keys=green_amount_keys,
            )
            if tx:
                # Skip table rows already covered by text extraction at same
                # date + amount — they are the same physical PDF row rendered
                # differently by pdfplumber's two extraction modes.
                if (tx.date.isoformat(), tx.amount) in seen_date_amount:
                    logger.debug(
                        "Table row skipped (covered by text): %s %s %.2f",
                        tx.date, tx.merchant, tx.amount,
                    )
                    continue
                self._add_unique(tx, seen, transactions, source_idx=("table", row_idx))

        return transactions

    @staticmethod
    def _add_unique(
        tx: ParsedTransaction,
        seen: set,
        out: List[ParsedTransaction],
        source_idx=None,
    ) -> bool:
        """Add *tx* to *out* if not already seen.  Returns True if added."""
        # Include the source position so that two genuinely identical
        # transactions on different rows are not treated as duplicates.
        key = (tx.date.isoformat(), tx.merchant, tx.amount, tx.type, source_idx)
        if key not in seen:
            seen.add(key)
            out.append(tx)
            return True
        return False

    # ------------------------------------------------------------------
    # Text line → ParsedTransaction
    # ------------------------------------------------------------------

    def _parse_text_line(
        self,
        line: str,
        ref_year: int,
        period_start: Optional[date],
        period_end: Optional[date],
        green_amount_keys: Optional[set] = None,
    ) -> Optional[ParsedTransaction]:
        green_amount_keys = green_amount_keys or set()

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
            return self._build_transaction(
                parsed_date, raw_desc, amount_str,
                green_amount_keys=green_amount_keys,
                date_key=m.group(1),
            )

        # Try "DD/MM/YYYY ... Amount [Dr/Cr]" (alternate format)
        m = _TX_LINE_DATED_RE.match(line)
        if m:
            parsed_date = self._parse_numeric_date(m.group(1))
            if not parsed_date:
                return None

            raw_desc = m.group(2).strip()
            amount_str = m.group(3).replace(",", "")
            # Green Amount-cell highlight is the sole credit signal.
            # Use a composite key so same-amount rows on different dates are distinct.
            # strftime("%d %b") produces "05 Sep" which matches the PDF "DD Mon" format.
            short_date = parsed_date.strftime("%d %b")
            composite_key = f"{short_date}|{amount_str}"
            is_credit = composite_key in green_amount_keys

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
        green_amount_keys: Optional[set] = None,
    ) -> Optional[ParsedTransaction]:
        green_amount_keys = green_amount_keys or set()

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
        amount_str = None
        for cell in reversed(row):
            stripped = cell.strip().replace(",", "")
            try:
                float(stripped)  # validate it's numeric
                amount_str = stripped
                break
            except ValueError:
                continue

        if not amount_str:
            return None
        try:
            amount = float(amount_str)
        except ValueError:
            return None
        if amount <= 0:
            return None

        # Green Amount-cell highlight is the sole credit signal.
        # Composite key «DD Mon|amount» prevents false positives when the same
        # amount appears on multiple dates but only one row is green.
        composite_key = f"{date_cell}|{amount_str}"
        is_credit = composite_key in green_amount_keys
        full_desc = f"{merchant} {category}".strip()
        clean = self._clean_merchant(full_desc, category=category)

        # Map the PDF's 'Repayments' category to the app's 'CC Bill Payment' slug
        parser_category = "cc_payment" if category.lower() in {"repayment", "repayments"} else None

        return ParsedTransaction(
            date=parsed_date,
            merchant=clean,
            amount=amount,
            type="credit" if is_credit else "debit",
            description=full_desc,
            category=parser_category,
        )

    # ------------------------------------------------------------------
    # Build transaction (shared logic for text lines)
    # ------------------------------------------------------------------

    def _build_transaction(
        self,
        parsed_date: date,
        raw_desc: str,
        amount_str: str,
        green_amount_keys: Optional[set] = None,
        date_key: Optional[str] = None,
    ) -> Optional[ParsedTransaction]:
        """Build a ParsedTransaction from a text-line match.

        Credit classification uses a single signal: the Amount cell must be
        highlighted green in the PDF (amount_str present in *green_amount_keys*).
        Category keywords are intentionally NOT used for type classification —
        they are only consulted for merchant cleaning and category-slug mapping.
        """
        green_amount_keys = green_amount_keys or set()

        try:
            amount = float(amount_str)
        except ValueError:
            return None
        if amount <= 0:
            return None

        # Green Amount-cell highlight is the sole credit signal.
        # Composite key «DD Mon|amount» prevents false positives when the same
        # amount appears on multiple dates but only one row is green.
        if date_key is None:
            # strftime("%d %b") produces "05 Sep" matching the PDF "DD Mon" format.
            date_key = parsed_date.strftime("%d %b")
        composite_key = f"{date_key}|{amount_str}"
        is_credit = composite_key in (green_amount_keys or set())
        if is_credit:
            logger.debug(
                "Green-cell credit: '%s' date_key='%s' amount=%s",
                raw_desc[:80], date_key, amount_str,
            )

        desc_lower = raw_desc.lower()

        # Extract the category token from the description for merchant cleaning
        detected_cat = ""
        for cat in _CATEGORY_LABELS:
            if cat.lower() in desc_lower:
                detected_cat = cat
                break

        # Detect EMI transactions first
        is_emi = detect_emi_transaction(raw_desc, detected_cat)

        # Map the PDF's 'Repayments' category to the app's 'CC Bill Payment' slug
        parser_category = None
        if is_emi:
            parser_category = "emi"
        elif detected_cat.lower() in {"repayment", "repayments"}:
            parser_category = "cc_payment"

        merchant = self._clean_merchant(raw_desc, category=detected_cat)
        return ParsedTransaction(
            date=parsed_date,
            merchant=merchant,
            amount=amount,
            type="credit" if is_credit else "debit",
            description=raw_desc,
            category=parser_category,
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
