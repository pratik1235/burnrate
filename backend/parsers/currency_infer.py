"""Infer ISO 4217-style currency from raw statement text (no FX APIs)."""

import re
from collections import Counter
from typing import List, Optional


def hint_from_amount_string(raw: str) -> Optional[str]:
    """Return INR/USD from a cell that may contain symbols, else None."""
    if not raw or not str(raw).strip():
        return None
    s = str(raw).strip()
    if "₹" in s:
        return "INR"
    if re.search(r"\bINR\b", s, re.I):
        return "INR"
    if "$" in s and "₹" not in s:
        return "USD"
    if re.search(r"\bUSD\b", s, re.I):
        return "USD"
    return None


def normalize_currency_code(raw: str) -> Optional[str]:
    """Normalize a currency column cell to a 3-letter code."""
    if not raw or not str(raw).strip():
        return None
    t = str(raw).strip().upper()
    if len(t) == 3 and t.isalpha():
        return t
    if t in ("RUPEES", "RS", "RS."):
        return "INR"
    if t in ("DOLLARS", "US$"):
        return "USD"
    return None


def resolve_currency_from_hints(hints: List[Optional[str]], default: str = "INR") -> str:
    resolved = [h for h in hints if h]
    if not resolved:
        return default
    return Counter(resolved).most_common(1)[0][0]


def infer_currency_from_document_text(text: str, default: str = "INR") -> str:
    """Use full PDF text: INR symbols/labels vs USD $ amounts."""
    if not text:
        return default
    if "₹" in text or re.search(r"\bINR\b", text, re.I):
        return "INR"
    if re.search(r"\$\s*\d", text) or re.search(r"\bUSD\b", text, re.I):
        return "USD"
    return default
