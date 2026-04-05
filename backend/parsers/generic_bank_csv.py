"""Generic bank account CSV statement parser.

Handles CSV files from banks without a dedicated parser (Federal Bank,
Indian Bank, etc.) by auto-detecting column mappings from common header
naming patterns.
"""

import re
from typing import Dict, List, Optional

from backend.parsers.bank_csv_base import BaseBankCSVParser

_DATE_PATTERNS = {
    "date", "txn date", "tran date", "transaction date",
    "trans date", "posting date",
}
_DESC_PATTERNS = {
    "description", "narration", "particulars", "remarks",
    "transaction remarks", "details", "transaction description",
}
_DEBIT_PATTERNS = {
    "debit", "dr", "withdrawal", "withdrawal amt", "withdrawal amt.",
    "withdrawal amount", "debit amount",
}
_CREDIT_PATTERNS = {
    "credit", "cr", "deposit", "deposit amt", "deposit amt.",
    "deposit amount", "credit amount",
}
_BALANCE_PATTERNS = {
    "balance", "bal", "closing balance", "running balance",
}


class GenericBankCSVParser(BaseBankCSVParser):
    """Fallback CSV parser that auto-detects column mapping."""

    def __init__(self, bank: str = "unknown"):
        self.bank_name = bank

    def _get_column_mapping(self, headers: List[str]) -> Optional[Dict[str, int]]:
        col_map: Dict[str, int] = {}

        for i, h in enumerate(headers):
            h_lower = h.strip().lower().rstrip(".")
            if h_lower in _DATE_PATTERNS and "date" not in col_map:
                col_map["date"] = i
            elif h_lower in _DESC_PATTERNS and "description" not in col_map:
                col_map["description"] = i
            elif h_lower in _DEBIT_PATTERNS and "debit" not in col_map:
                col_map["debit"] = i
            elif h_lower in _CREDIT_PATTERNS and "credit" not in col_map:
                col_map["credit"] = i
            elif h_lower in _BALANCE_PATTERNS and "balance" not in col_map:
                col_map["balance"] = i

        if "date" not in col_map:
            for i, h in enumerate(headers):
                if "date" in h.strip().lower():
                    col_map["date"] = i
                    break

        if "description" not in col_map:
            for i, h in enumerate(headers):
                h_lower = h.strip().lower()
                if any(kw in h_lower for kw in ("desc", "narr", "particular", "remark")):
                    col_map["description"] = i
                    break

        if "date" in col_map and "description" in col_map:
            return col_map
        return None

    def _clean_description(self, desc: str) -> str:
        desc = re.sub(r"\s+", " ", desc).strip()
        return desc
