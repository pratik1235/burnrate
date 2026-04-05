"""Bank detector for credit card statement PDFs and bank account CSVs."""

import csv
import io
import os
import re
from typing import Optional

import pdfplumber


def _detect_bank_from_filename(filename: str) -> Optional[str]:
    """Detect bank from filename patterns (shared by PDF and CSV)."""
    lower = filename.lower()
    if "hdfc" in lower:
        return "hdfc"
    if "icici" in lower:
        return "icici"
    if "axis" in lower:
        return "axis"
    if "sbi" in lower or "sbi card" in lower or "state bank" in lower:
        return "sbi"
    if "american express" in lower or "amex" in lower:
        return "amex"
    if "idfc first" in lower or "idfc" in lower:
        return "idfc_first"
    if "indusind" in lower:
        return "indusind"
    if "kotak" in lower:
        return "kotak"
    if "standard chartered" in lower:
        return "sc"
    if "yes bank" in lower:
        return "yes"
    if "au small finance" in lower or "au bank" in lower:
        return "au"
    if "rbl bank" in lower or "rbl" in lower:
        return "rbl"
    if "federal" in lower or "federalbank" in lower:
        return "federal"
    if "indian bank" in lower or "indianbank" in lower or "indian_bank" in lower:
        return "indian_bank"
    return None


def detect_bank_csv(csv_path: str) -> Optional[str]:
    """Detect which bank a CSV statement belongs to.

    Checks filename first, then analyzes CSV header patterns.
    """
    filename = os.path.basename(csv_path)
    bank = _detect_bank_from_filename(filename)
    if bank:
        return bank

    try:
        with open(csv_path, "r", encoding="utf-8-sig", errors="replace") as f:
            content = f.read(4096)
    except Exception:
        return None

    content_lower = content.lower()

    if re.search(r"\bhdfc\b", content_lower) or "hdfc bank" in content_lower:
        return "hdfc"
    if re.search(r"\bicici\b", content_lower) or "icici bank" in content_lower:
        return "icici"
    if re.search(r"\bsbi\b", content_lower) or "state bank" in content_lower:
        return "sbi"
    if re.search(r"\baxis\b", content_lower) or "axis bank" in content_lower:
        return "axis"
    if "federal bank" in content_lower:
        return "federal"
    if "indian bank" in content_lower and "south indian bank" not in content_lower:
        return "indian_bank"

    # Detect from header column patterns unique to each bank
    reader = csv.reader(io.StringIO(content))
    for row in list(reader)[:10]:
        joined = " ".join(c.strip().lower() for c in row)
        if "narration" in joined and "withdrawal amt" in joined:
            return "hdfc"
        if "particulars" in joined and "sol" in joined:
            return "axis"
        if "txn date" in joined and "value date" in joined:
            return "sbi"
        if "transaction remarks" in joined and "withdrawal amount" in joined:
            return "icici"

    return None


def detect_bank(pdf_path: str) -> Optional[str]:
    """
    Detect which bank a statement PDF belongs to.
    Returns one of: 'hdfc', 'icici', 'axis', 'sbi', 'amex', 'idfc_first',
    'indusind', 'kotak', 'sc', 'yes', 'au', 'rbl', 'federal', 'indian_bank',
    or None.
    """
    filename = os.path.basename(pdf_path)
    bank = _detect_bank_from_filename(filename)
    if bank:
        return bank

    # Try card BIN prefixes from masked card numbers in filename
    bin_match = re.search(r"(\d{4})[xX*]+\d{2,4}", filename.lower())
    if bin_match:
        first4 = bin_match.group(1)
        hdfc_bins = {"5522", "4386", "4567", "5241", "4543", "5254", "4213"}
        icici_bins = {"4568", "5243", "4998", "5236", "4389", "4315", "4998", "5270", "4329"}
        axis_bins = {"4108", "4178", "5269", "4021", "4717"}
        if first4 in hdfc_bins:
            return "hdfc"
        if first4 in icici_bins:
            return "icici"
        if first4 in axis_bins:
            return "axis"

    # Open PDF and extract first page text
    try:
        with pdfplumber.open(pdf_path) as pdf:
            if not pdf.pages:
                return None
            text = pdf.pages[0].extract_text() or ""
    except Exception:
        return None

    text_lower = text.lower()

    if re.search(r"\bhdfc\b", text_lower) or "hdfc bank" in text_lower:
        return "hdfc"
    if re.search(r"\bicici\b", text_lower) or "icici bank" in text_lower:
        return "icici"
    if re.search(r"\baxis\s*bank\b", text_lower) or "axis bank" in text_lower:
        return "axis"
    if re.search(r"\bsbi\b", text_lower) or "sbi card" in text_lower or "state bank" in text_lower:
        return "sbi"
    if "american express" in text_lower or re.search(r"\bamex\b", text_lower):
        return "amex"
    if "idfc first" in text_lower or re.search(r"\bidfc\b", text_lower):
        return "idfc_first"
    if re.search(r"\bindusind\b", text_lower):
        return "indusind"
    if re.search(r"\bkotak\b", text_lower):
        return "kotak"
    if "standard chartered" in text_lower:
        return "sc"
    if "yes bank" in text_lower:
        return "yes"
    if "au small finance" in text_lower or "au bank" in text_lower:
        return "au"
    if "rbl bank" in text_lower or re.search(r"\brbl\b", text_lower):
        return "rbl"
    if "federal bank" in text_lower or re.search(r"\bfederal\s*bank\b", text_lower):
        return "federal"
    if "indian bank" in text_lower and "south indian bank" not in text_lower:
        return "indian_bank"

    return None
