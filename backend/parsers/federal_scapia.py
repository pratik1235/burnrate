"""Federal Bank Scapia credit card statement parser.

Scapia (Federal Bank) issues co-branded credit cards in two variants:
  - VISA card  (XXXXXXXXXXXX1670)
  - RuPay card (XXXXXXXXXXXX3694)

A single combined PDF statement covers both cards.

  Page 1 — Summary / billing header:
    - Customer name and both masked card numbers
    - Billing Cycle: two formats seen in the wild:
        * Compact: "BillingCycle ... 25Feb2026-24Mar2026"  (no spaces)
        * Spaced:  "Billing Cycle ... 25 Mar 2026 - 24 Apr 2026"
    - Total Due, Minimum Due, Statement Date, Due Date
    - Available Limit, Total Limit, Cash withdrawal limit

  Page 2+ (transactions start on page 2, may overflow):
    - Section header: "Your Transactions"
    - Each transaction row contains:
        [card-network logo image]  [date·time]  [merchant]  [Payment?]  [₹amount]
    - Card-network identification is image-based:
        * Image "Im11" (x0≈38, w=33, h=10) beside a row = RuPay card transaction
        * No image beside a row = shared/unassigned (e.g. bill payment)
        * Offset: img.top + 2.25 ≈ transaction word top (empirically verified)
    - Header images identify which masked number belongs to which network:
        * "Im3" (x0≈24) = VISA logo  → next XXX...last4 = VISA card
        * "Im4" (x0≈161) = RuPay logo → next XXX...last4 = RuPay card

  Pages after transactions:
    - "All about your Scapia Federal Credit Card" (fees/info page) — stop here.
    - MITC pages, Grievance pages — ignore.

Password format: none observed (statements appear unencrypted).
"""

import copy
import logging
import re
from datetime import date, datetime
from typing import Dict, List, Optional, Tuple

import pdfplumber

from backend.parsers.base import BaseParser, ParsedStatement, ParsedTransaction

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Billing cycle
# Supports both compact ("BillingCycle ... 25Mar2026-24Apr2026")
# and spaced  ("Billing Cycle ... 25 Mar 2026 - 24 Apr 2026") formats.
# ---------------------------------------------------------------------------

_BILLING_CYCLE_RE = re.compile(
    r"Billing\s*Cycle\b.*?"
    r"(\d{1,2}\s*[A-Za-z]{3}\s*\d{4})"
    r"\s*[-\u2013]\s*"
    r"(\d{1,2}\s*[A-Za-z]{3}\s*\d{4})",
    re.IGNORECASE | re.DOTALL,
)

# ---------------------------------------------------------------------------
# Masked card number — "XXXXXXXXXXXX1670"
# ---------------------------------------------------------------------------

_MASKED_CARD_RE = re.compile(r"X{4,}(\d{4})", re.IGNORECASE)

# ---------------------------------------------------------------------------
# Summary fields (page 1) — match both compact and spaced label variants
# ---------------------------------------------------------------------------

# Total Due: first ₹ amount after "Total Due" or "TotalDue"
_TOTAL_DUE_RE = re.compile(
    r"Total\s*Due\b[^\n]*\n([₹\d,]+\.\d{2})",
    re.IGNORECASE,
)

# Limits line: "AvailableLimit TotalLimit Cashwithdrawallimit\n₹X ₹Y ₹Z"
# or spaced:   "Available Limit Total Limit Cash withdrawal limit\n₹X ₹Y ₹Z"
_LIMITS_LINE_RE = re.compile(
    r"Available\s*Limit\s+Total\s*Limit\s+Cash\s*withdrawal\s*limit\s*\n"
    r"([₹\d,]+\.\d{2})\s+([₹\d,]+\.\d{2})\s+([₹\d,]+\.\d{2})",
    re.IGNORECASE,
)

# Statement date / Due date — separated by intervening "Transactions +₹..." line
# Works for both compact ("StatementDate DueDate") and spaced ("Statement Date Due Date")
_STATEMENT_DUE_DATE_RE = re.compile(
    r"Statement\s*Date\s+Due\s*Date\b.*?"
    r"(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s+"
    r"(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})",
    re.IGNORECASE | re.DOTALL,
)

# ---------------------------------------------------------------------------
# Transaction date+time token: "26-03-2026·17:15" (middle-dot separator)
# ---------------------------------------------------------------------------

_TX_DATETIME_RE = re.compile(
    r"^(\d{2}-\d{2}-\d{4})[·•\u00b7\u2022]\d{2}:\d{2}$"
)

# ---------------------------------------------------------------------------
# Amount token: "₹160.00", "+₹1,670.68", "-₹250.00"
# ---------------------------------------------------------------------------

_AMOUNT_RE = re.compile(r"^([+-]?)₹([\d,]+\.\d{2})$")

# ---------------------------------------------------------------------------
# X-coordinate thresholds (empirical — word positions in new PDF format)
# ---------------------------------------------------------------------------

_X_DATE_MIN = 75.0
_X_DATE_MAX = 105.0
_X_MERCHANT_MIN = 155.0
_X_PAYMENT_LABEL_MIN = 340.0
_X_PAYMENT_LABEL_MAX = 395.0
_X_AMOUNT_MIN = 415.0
_X_REWARD_MIN = 520.0

# Image name constants for card-network identification
_IMG_VISA_LOGO = "Im3"      # VISA logo in page header (x0≈24)
_IMG_RUPAY_LOGO = "Im4"     # RuPay logo in page header (x0≈161)
_IMG_RUPAY_TX = "Im11"      # RuPay logo beside each transaction row (x0≈38)

# Offset between logo image top and transaction word top (empirically verified)
_TX_LOGO_OFFSET = 2.25

# Section header text — transactions appear below this
_SECTION_HEADER_TEXT = "your transactions"
# Stop-word — no more transactions after this page section
_STOP_SECTION_TEXT = "all about your scapia federal credit card"


def _parse_compact_date(s: str) -> Optional[date]:
    """Parse compact dates like '25Mar2026' or '25 Mar 2026'."""
    s = s.strip()
    # Insert spaces between adjacent digit/letter runs
    s = re.sub(r"(\d)([A-Za-z])", r"\1 \2", s)
    s = re.sub(r"([A-Za-z])(\d)", r"\1 \2", s)
    s = re.sub(r"\s+", " ", s)
    for fmt in ("%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _parse_amount(token: str) -> Tuple[Optional[float], bool]:
    """Parse an amount token like '₹160.00', '+₹1,670.68', '-₹250.00'.

    Returns (amount_float, is_credit). amount_float is always positive.
    is_credit is True when the token starts with '+'.
    """
    m = _AMOUNT_RE.match(token.strip())
    if not m:
        return None, False
    sign = m.group(1)
    amount = float(m.group(2).replace(",", ""))
    if amount <= 0:
        return None, False
    return amount, sign == "+"


class ScapiaFederalParser(BaseParser):
    """Parser for Federal Bank Scapia credit card statements.

    Handles combined dual-card statements (VISA + RuPay) using image-based
    per-transaction card-network detection. Also supports the older single-card
    compact-format PDFs for backward compatibility.
    """

    def parse(self, pdf_path: str) -> ParsedStatement:
        full_text = ""
        all_pages_words: List[List[dict]] = []
        all_pages_images: List[List[dict]] = []

        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                full_text += text + "\n"
                words = page.extract_words(x_tolerance=3, y_tolerance=3) or []
                images = page.images or []
                all_pages_words.append(words)
                all_pages_images.append(images)

        period_start, period_end = self._extract_billing_period(full_text)
        total_amount_due = self._extract_total_due(full_text)
        credit_limit = self._extract_credit_limit(full_text)
        payment_due_date = self._extract_due_date(full_text)

        # Extract both card last-4s using header images (VISA/RuPay logos)
        # Use the first transaction page (index 1) header for image positions
        first_tx_page_words = all_pages_words[1] if len(all_pages_words) > 1 else []
        first_tx_page_images = all_pages_images[1] if len(all_pages_images) > 1 else []
        visa_last4, rupay_last4 = self._extract_dual_card_last4s(
            first_tx_page_words, first_tx_page_images
        )

        # Extract transactions with per-row card-network tagging
        transactions = self._extract_transactions(all_pages_words, all_pages_images)

        # Determine primary card (most debit transactions → that card's last-4 is primary)
        rupay_debit_count = sum(
            1 for t in transactions if t.card_network == "rupay" and t.type == "debit"
        )
        visa_debit_count = sum(
            1 for t in transactions if t.card_network == "visa" and t.type == "debit"
        )

        if rupay_last4 and visa_last4:
            # Dual-card format — assign primary/secondary
            if rupay_debit_count >= visa_debit_count:
                card_last4 = rupay_last4
                card_last4_secondary = visa_last4
            else:
                card_last4 = visa_last4
                card_last4_secondary = rupay_last4
        else:
            # Old single-card format — only one last-4 found
            card_last4 = visa_last4 or rupay_last4
            card_last4_secondary = None

        logger.info(
            "Scapia Federal parse: card=%s secondary=%s period=%s..%s "
            "txns=%d (visa=%d rupay=%d) total_due=%s limit=%s payment_due=%s",
            card_last4, card_last4_secondary,
            period_start, period_end, len(transactions),
            visa_debit_count, rupay_debit_count,
            total_amount_due, credit_limit, payment_due_date,
        )

        return ParsedStatement(
            bank="federal_scapia",
            period_start=period_start,
            period_end=period_end,
            transactions=transactions,
            card_last4=card_last4,
            card_last4_secondary=card_last4_secondary,
            total_amount_due=total_amount_due,
            credit_limit=credit_limit,
            payment_due_date=payment_due_date,
        )

    # ------------------------------------------------------------------
    # Billing period
    # ------------------------------------------------------------------

    def _extract_billing_period(
        self, text: str
    ) -> Tuple[Optional[date], Optional[date]]:
        m = _BILLING_CYCLE_RE.search(text)
        if m:
            start = _parse_compact_date(m.group(1))
            end = _parse_compact_date(m.group(2))
            if start and end:
                return start, end
        return None, None

    # ------------------------------------------------------------------
    # Dual card last-4 extraction (header image-based)
    # ------------------------------------------------------------------

    def _extract_dual_card_last4s(
        self,
        page_words: List[dict],
        page_images: List[dict],
    ) -> Tuple[Optional[str], Optional[str]]:
        """Extract VISA and RuPay card last-4 digits from the page header.

        Uses image positions:
          Im3 (x0≈24)   = VISA logo  → nearest masked word is VISA card number
          Im4 (x0≈161)  = RuPay logo → nearest masked word is RuPay card number

        Falls back to text order when images are absent (old compact-format PDFs).
        """
        visa_anchor: Optional[float] = None
        rupay_anchor: Optional[float] = None
        for img in page_images:
            if img.get("name") == _IMG_VISA_LOGO:
                visa_anchor = img["x0"]
            elif img.get("name") == _IMG_RUPAY_LOGO:
                rupay_anchor = img["x0"]

        # Masked card number words in the header area (top < 100)
        masked_words = [
            w for w in page_words
            if re.match(r"X{4,}\d{4}", w["text"]) and w["top"] < 100
        ]

        visa_last4: Optional[str] = None
        rupay_last4: Optional[str] = None

        for w in masked_words:
            last4 = w["text"][-4:]
            if visa_anchor is not None and abs(w["x0"] - visa_anchor) < 80:
                visa_last4 = last4
            elif rupay_anchor is not None and abs(w["x0"] - rupay_anchor) < 80:
                rupay_last4 = last4

        # Fallback: no logo images — use text order
        if not visa_last4 and not rupay_last4 and masked_words:
            visa_last4 = masked_words[0]["text"][-4:]
            if len(masked_words) > 1:
                rupay_last4 = masked_words[1]["text"][-4:]

        return visa_last4, rupay_last4

    # ------------------------------------------------------------------
    # Total amount due
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_total_due(text: str) -> Optional[float]:
        m = _TOTAL_DUE_RE.search(text)
        if m:
            try:
                return float(m.group(1).replace("₹", "").replace(",", ""))
            except ValueError:
                pass
        return None

    # ------------------------------------------------------------------
    # Credit limit  (TotalLimit — second amount in the limits row)
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_credit_limit(text: str) -> Optional[float]:
        m = _LIMITS_LINE_RE.search(text)
        if m:
            try:
                return float(m.group(2).replace("₹", "").replace(",", ""))
            except ValueError:
                pass
        return None

    # ------------------------------------------------------------------
    # Due date (payment due date)
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_due_date(text: str) -> Optional[date]:
        m = _STATEMENT_DUE_DATE_RE.search(text)
        if m:
            # group(2) is the DueDate value
            return _parse_compact_date(m.group(2))
        return None

    # ------------------------------------------------------------------
    # Transaction extraction (word-position + image-based)
    # ------------------------------------------------------------------

    def _extract_transactions(
        self,
        all_pages_words: List[List[dict]],
        all_pages_images: List[List[dict]],
    ) -> List[ParsedTransaction]:
        """Extract all transactions across all transaction pages.

        Per-page strategy:
          1. Skip page 1 (summary page).
          2. Stop when the fees/info section begins.
          3. Build a card_network map from Im11 logo images on each page.
          4. Group words into horizontal bands by vertical position (±4pt).
          5. Parse each band; annotate card_network from the logo map.
        """
        transactions: List[ParsedTransaction] = []
        seen: set = set()
        in_tx_section = False

        for page_idx, words in enumerate(all_pages_words):
            if not words:
                continue

            # Transactions always start on page 2 (0-indexed: page_idx == 1)
            if page_idx < 1:
                continue

            page_text_lower = " ".join(w["text"].lower() for w in words)

            # Stop before the fees/info section
            if _STOP_SECTION_TEXT in page_text_lower:
                break

            # Detect the "Your Transactions" section header
            if _SECTION_HEADER_TEXT in page_text_lower:
                in_tx_section = True

            if not in_tx_section:
                continue

            # Build card-network map for this page from Im11 logo images
            page_images = all_pages_images[page_idx] if page_idx < len(all_pages_images) else []
            card_network_map = self._build_card_network_map(page_images)

            # Group words into horizontal bands (±4pt tolerance)
            bands: Dict[float, List[dict]] = {}
            for w in words:
                top = w["top"]
                matched_band = None
                for band_top in bands:
                    if abs(top - band_top) <= 4:
                        matched_band = band_top
                        break
                if matched_band is None:
                    matched_band = top
                    bands[matched_band] = []
                bands[matched_band].append(w)

            # Process each band in top-to-bottom order
            for band_top in sorted(bands.keys()):
                band_words = bands[band_top]
                # Determine card_network for this row from the logo map
                card_network = self._lookup_card_network(band_top, card_network_map)
                tx = self._parse_word_band(band_words, card_network)
                if tx:
                    # Dedup key includes page and row position so that multiple
                    # identical-looking transactions on different rows/pages
                    # (e.g. ₹20 to the same merchant on the same date) are kept.
                    key = (tx.date.isoformat(), tx.merchant, tx.amount, tx.type,
                           page_idx, round(band_top, 1))
                    if key not in seen:
                        seen.add(key)
                        transactions.append(tx)


        return transactions

    @staticmethod
    def _build_card_network_map(page_images: List[dict]) -> Dict[float, str]:
        """Build a map of approximate transaction-top → card_network for a page.

        Im11 (x0≈38, w≈33, h≈10) is the RuPay logo placed beside each
        RuPay transaction row. Consistent offset: img.top + 2.25 ≈ word.top.

        Returns an empty dict for old compact-format PDFs (no per-row logos).
        """
        result: Dict[float, str] = {}
        for img in page_images:
            if img.get("name") == _IMG_RUPAY_TX and img["x0"] < 80:
                tx_top = round(img["top"] + _TX_LOGO_OFFSET, 1)
                result[tx_top] = "rupay"
        return result

    @staticmethod
    def _lookup_card_network(
        band_top: float,
        card_network_map: Dict[float, str],
    ) -> Optional[str]:
        """Find the card_network for a band by matching its top coordinate.

        Tolerates ±3pt difference to account for minor rendering variation.
        Returns None when no logo is associated (e.g. bill payment rows,
        or old-format PDFs without per-row logos).
        """
        for img_top, network in card_network_map.items():
            if abs(band_top - img_top) <= 3.0:
                return network
        return None

    def _parse_word_band(
        self,
        band_words: List[dict],
        card_network: Optional[str] = None,
    ) -> Optional[ParsedTransaction]:
        """Parse a single horizontal word band into a ParsedTransaction.

        Expected word layout within a transaction row:
          [date·time]  [merchant]  [Payment?]  [₹amount]  [reward_pts?]
        """
        if len(band_words) < 2:
            return None

        date_word: Optional[dict] = None
        merchant_words: List[str] = []
        is_payment_category = False
        amount_token: Optional[str] = None

        for w in sorted(band_words, key=lambda x: x["x0"]):
            text = w["text"].strip()
            x0 = w["x0"]

            if not text:
                continue

            # Reward-point trailing digits (far right, bare integer) — skip
            if x0 >= _X_REWARD_MIN and re.match(r"^\d+$", text):
                continue

            # Date·time token
            if _X_DATE_MIN <= x0 <= _X_DATE_MAX and _TX_DATETIME_RE.match(text):
                date_word = w
                continue

            # Amount token
            if x0 >= _X_AMOUNT_MIN:
                if _AMOUNT_RE.match(text):
                    amount_token = text
                continue

            # "Payment" category label
            if _X_PAYMENT_LABEL_MIN <= x0 <= _X_PAYMENT_LABEL_MAX:
                if text.lower() == "payment":
                    is_payment_category = True
                continue

            # Merchant name words
            if x0 >= _X_MERCHANT_MIN:
                merchant_words.append(text)

        if date_word is None or amount_token is None:
            return None

        # Parse date
        date_str = _TX_DATETIME_RE.match(date_word["text"]).group(1)
        try:
            tx_date = datetime.strptime(date_str, "%d-%m-%Y").date()
        except ValueError:
            return None

        # Parse amount
        amount, is_credit = _parse_amount(amount_token)
        if amount is None:
            return None

        tx_type = "credit" if is_credit else "debit"
        merchant = self._clean_merchant(" ".join(merchant_words))

        # Map 'Payment' category label → cc_payment app category slug
        parser_category: Optional[str] = "cc_payment" if is_payment_category else None

        return ParsedTransaction(
            date=tx_date,
            merchant=merchant,
            amount=amount,
            type=tx_type,
            description=merchant,
            category=parser_category,
            card_network=card_network,
        )

    # ------------------------------------------------------------------
    # Merchant cleanup
    # ------------------------------------------------------------------

    @staticmethod
    def _clean_merchant(raw: str) -> str:
        """Normalise merchant name extracted from PDF words."""
        if not raw:
            return "Unknown"
        merchant = re.sub(r"\s+(IN|INDIA|IND)\s*$", "", raw, flags=re.IGNORECASE)
        merchant = re.sub(r"\s+", " ", merchant).strip()
        return merchant[:512] if merchant else "Unknown"
