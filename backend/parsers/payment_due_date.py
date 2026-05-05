"""Heuristic extraction of payment due dates from Indian CC statement PDF text."""

import re
from datetime import date
from typing import Iterable, Optional

_SUMMARY_CHARS = 22_000

# Label anchors → capture date on same or following lines.
_LABEL_RES = [
    re.compile(r"Payment\s+Due\s+Date", re.IGNORECASE),
    re.compile(r"(?:Payment\s+Due|Due)\s+Date", re.IGNORECASE),
    re.compile(r"Pay(?:ment)?\s+by", re.IGNORECASE),
    re.compile(r"Last\s+Date\s+for\s+Payment", re.IGNORECASE),
]

_MONTH_MAP = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

_DATE_TOKEN_RE = re.compile(
    r"\b("
    r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}"
    r"|\d{1,2}/[A-Za-z]{3}/\d{4}"
    r"|\d{1,2}\s+[A-Za-z]{3,9},?\s+\d{4}"
    r"|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}"
    r")\b",
    re.IGNORECASE,
)

_AXIS_SUMMARY_RE = re.compile(
    r"Total\s+Payment\s+Due\s+Minimum\s+Payment\s+Due\s+Statement\s+Period\s+"
    r"Payment\s+Due\s+Date\s+Statement\s+Generation\s+Date\s*\n\s*"
    r".*?\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s*[-\u2013]\s*"
    r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s+"
    r"(?P<due>\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b",
    re.IGNORECASE,
)

_HDFC_NEW_SUMMARY_RE = re.compile(
    r"MINIMUM\s+DUE\s+DUE\s+DATE\s*\n\s*"
    r"(?:[A-Z₹`]\s*)?[\d,]+(?:\.\d{2})?\s+"
    r"(?P<due>\d{1,2}\s+[A-Za-z]{3,9},?\s+\d{4})\b",
    re.IGNORECASE,
)

_INDIAN_BANK_SUMMARY_RE = re.compile(
    r"Payment\s+Due\s+Date\s*\n\s*(?P<due>\d{1,2}\s+[A-Za-z]{3}\s+\d{4})",
    re.IGNORECASE,
)


def _parse_slash_date(s: str) -> Optional[date]:
    s = s.strip()
    for sep in ("/", "-"):
        parts = s.split(sep)
        if len(parts) != 3:
            continue
        try:
            d, m, y = int(parts[0]), int(parts[1]), int(parts[2])
            if y < 100:
                y += 2000 if y < 70 else 1900
            return date(y, m, d)
        except (ValueError, TypeError):
            continue
    return None


def _parse_month_date(s: str) -> Optional[date]:
    cleaned = re.sub(r"\s+", " ", s.strip().replace(",", " "))
    parts = cleaned.split()
    if len(parts) != 3:
        return None

    # "06 Oct 2025"
    if parts[0].isdigit():
        d = int(parts[0])
        mon = _MONTH_MAP.get(parts[1].lower()[:3])
        y = int(parts[2]) if parts[2].isdigit() else 0
    # "September 30 2022"
    elif parts[1].isdigit():
        mon = _MONTH_MAP.get(parts[0].lower()[:3])
        d = int(parts[1])
        y = int(parts[2]) if parts[2].isdigit() else 0
    else:
        return None

    if not mon or y <= 0:
        return None
    try:
        return date(y, mon, d)
    except ValueError:
        return None


def _parse_date_token(s: str) -> Optional[date]:
    s = s.strip()
    if re.match(r"\d{1,2}/[A-Za-z]{3}/\d{4}$", s, re.IGNORECASE):
        d_s, m_s, y_s = s.split("/")
        mon = _MONTH_MAP.get(m_s.lower()[:3])
        if mon:
            try:
                return date(int(y_s), mon, int(d_s))
            except ValueError:
                return None
    if re.match(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$", s):
        return _parse_slash_date(s)
    return _parse_month_date(s)


def _collapse_doubled_label_letters(text: str) -> str:
    """ICICI PDFs sometimes extract labels as PPAAYYMMEENNTT DDUUEE DDAATTEE."""
    return re.sub(r"([A-Za-z])\1", r"\1", text)


def _iter_date_tokens(text: str) -> Iterable[date]:
    for m in _DATE_TOKEN_RE.finditer(text):
        parsed = _parse_date_token(m.group(1))
        if parsed:
            yield parsed


def _extract_from_known_summary_tables(blob: str) -> Optional[date]:
    for rx in (_AXIS_SUMMARY_RE, _HDFC_NEW_SUMMARY_RE, _INDIAN_BANK_SUMMARY_RE):
        m = rx.search(blob)
        if m:
            parsed = _parse_date_token(m.group("due"))
            if parsed:
                return parsed
    return None


def _extract_after_label(blob: str) -> Optional[date]:
    for rx in _LABEL_RES:
        for m in rx.finditer(blob):
            window = blob[m.end() : m.end() + 260]
            # If this is a summary header row, avoid accidentally returning
            # Statement Period start/end dates. Dedicated table patterns handle it.
            if re.search(r"Statement\s+Period", window[:120], re.IGNORECASE):
                continue
            for parsed in _iter_date_tokens(window):
                return parsed
    return None


def extract_payment_due_date_from_text(full_text: str) -> Optional[date]:
    """Scan statement text for common Indian CC 'payment due date' patterns."""
    blob = (full_text or "")[:_SUMMARY_CHARS]
    normalized = _collapse_doubled_label_letters(blob)

    return (
        _extract_from_known_summary_tables(normalized)
        or _extract_after_label(normalized)
    )
