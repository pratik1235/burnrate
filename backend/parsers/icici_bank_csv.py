"""ICICI Bank account CSV statement parser.

ICICI Net Banking CSV format (common variants):
  Variant 1: S No., Value Date, Transaction Date, Cheque Number,
             Transaction Remarks, Withdrawal Amount (INR), Deposit Amount (INR), Balance (INR)
  Variant 2: Transaction Date, Value Date, Description, Debit, Credit, Balance
  Date format: DD/MM/YYYY or DD-Mon-YYYY
"""

import re
from typing import Dict, List, Optional

from backend.parsers.bank_csv_base import BaseBankCSVParser

_DATE_COL_NAMES = {
    "transaction date", "txn date", "date", "tran date",
}
_DESC_COL_NAMES = {
    "transaction remarks", "remarks", "description", "narration",
    "particulars",
}
_DEBIT_COL_NAMES = {
    "withdrawal amount (inr)", "withdrawal amount", "withdrawal",
    "debit amount (inr)", "debit", "dr",
}
_CREDIT_COL_NAMES = {
    "deposit amount (inr)", "deposit amount", "deposit",
    "credit amount (inr)", "credit", "cr",
}


class ICICIBankCSVParser(BaseBankCSVParser):
    """Parser for ICICI Bank account CSV statements."""

    bank_name = "icici"

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
            elif h_lower in {"balance (inr)", "balance", "closing balance"} and "balance" not in col_map:
                col_map["balance"] = i

        if "date" in col_map and "description" in col_map:
            return col_map
        return None

    def _clean_description(self, desc: str) -> str:
        desc = re.sub(r"\s+", " ", desc).strip()
        desc = re.sub(r"^(UPI|NEFT|IMPS|RTGS)[/-]", r"\1 ", desc)
        return desc
