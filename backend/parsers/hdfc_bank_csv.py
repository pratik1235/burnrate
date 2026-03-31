"""HDFC Bank account CSV statement parser.

HDFC Net Banking CSV format:
  Date, Narration, Chq./Ref.No., Value Dt, Withdrawal Amt., Deposit Amt., Closing Balance
  Date format: DD/MM/YY
"""

import re
from typing import Dict, List, Optional

from backend.parsers.bank_csv_base import BaseBankCSVParser

_KNOWN_HEADERS = {
    "date", "narration", "chq./ref.no.", "value dt",
    "withdrawal amt.", "deposit amt.", "closing balance",
}

_DATE_COL_NAMES = {"date", "txn date", "transaction date"}
_DESC_COL_NAMES = {"narration", "description", "particulars", "transaction remarks"}
_DEBIT_COL_NAMES = {"withdrawal amt.", "withdrawal amt", "withdrawal", "debit", "dr"}
_CREDIT_COL_NAMES = {"deposit amt.", "deposit amt", "deposit", "credit", "cr"}


class HDFCBankCSVParser(BaseBankCSVParser):
    """Parser for HDFC Bank account CSV statements."""

    bank_name = "hdfc"

    def _get_column_mapping(self, headers: List[str]) -> Optional[Dict[str, int]]:
        col_map: Dict[str, int] = {}

        for i, h in enumerate(headers):
            h_lower = h.strip().lower()
            if h_lower in _DATE_COL_NAMES and "date" not in col_map:
                col_map["date"] = i
            elif h_lower in _DESC_COL_NAMES and "description" not in col_map:
                col_map["description"] = i
            elif h_lower in _DEBIT_COL_NAMES and "debit" not in col_map:
                col_map["debit"] = i
            elif h_lower in _CREDIT_COL_NAMES and "credit" not in col_map:
                col_map["credit"] = i
            elif h_lower in {"closing balance", "balance"} and "balance" not in col_map:
                col_map["balance"] = i
            elif h_lower in {"chq./ref.no.", "ref no", "ref no.", "reference"} and "ref" not in col_map:
                col_map["ref"] = i

        if "date" in col_map and "description" in col_map:
            return col_map
        return None

    def _clean_description(self, desc: str) -> str:
        desc = re.sub(r"\s+", " ", desc).strip()
        desc = re.sub(r"^(UPI|NEFT|IMPS|RTGS)[/-]", r"\1 ", desc)
        return desc
