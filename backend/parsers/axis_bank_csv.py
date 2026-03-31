"""Axis Bank account CSV statement parser.

Axis Net Banking CSV format:
  Tran Date, CHQNO, PARTICULARS, DR, CR, BAL, SOL
  Date format: DD-MM-YYYY

Alternative format:
  Transaction Date, Cheque No, Description, Debit, Credit, Balance
"""

import re
from typing import Dict, List, Optional

from backend.parsers.bank_csv_base import BaseBankCSVParser

_DATE_COL_NAMES = {
    "tran date", "transaction date", "date", "txn date",
}
_DESC_COL_NAMES = {
    "particulars", "description", "narration", "transaction remarks",
}
_DEBIT_COL_NAMES = {
    "dr", "debit", "withdrawal",
}
_CREDIT_COL_NAMES = {
    "cr", "credit", "deposit",
}


class AxisBankCSVParser(BaseBankCSVParser):
    """Parser for Axis Bank account CSV statements."""

    bank_name = "axis"

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
            elif h_lower in {"bal", "balance", "closing balance"} and "balance" not in col_map:
                col_map["balance"] = i
            elif h_lower in {"chqno", "cheque no", "chq./ref.no."} and "ref" not in col_map:
                col_map["ref"] = i

        if "date" in col_map and "description" in col_map:
            return col_map
        return None

    def _clean_description(self, desc: str) -> str:
        desc = re.sub(r"\s+", " ", desc).strip()
        desc = re.sub(r"^(UPI|NEFT|IMPS|RTGS)[/-]", r"\1 ", desc)
        return desc
