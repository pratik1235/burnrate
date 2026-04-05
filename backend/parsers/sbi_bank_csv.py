"""SBI (State Bank of India) account CSV statement parser.

SBI Net Banking CSV/XLS format:
  Txn Date, Value Date, Description, Ref No./Cheque No., Debit, Credit, Balance
  Date formats: DD Mon YYYY (e.g. "1 Jan 2024"), DD/MM/YYYY, DD-MM-YYYY

SBI may also export with slightly different headers:
  - "Txn Date" / "Transaction Date" / "Date"
  - "Description" / "Narration" / "Particulars"
"""

import re
from datetime import date
from typing import Dict, List, Optional

from backend.parsers.bank_csv_base import BaseBankCSVParser, parse_date_flexible

_DATE_COL_NAMES = {
    "txn date", "transaction date", "date", "tran date",
}
_DESC_COL_NAMES = {
    "description", "narration", "particulars", "transaction remarks",
}
_DEBIT_COL_NAMES = {
    "debit", "withdrawal", "dr", "debit amount",
}
_CREDIT_COL_NAMES = {
    "credit", "deposit", "cr", "credit amount",
}
_REF_COL_NAMES = {
    "ref no./cheque no.", "ref no", "cheque no", "reference",
    "chq./ref.no.", "ref no./cheque no",
}


class SBIBankCSVParser(BaseBankCSVParser):
    """Parser for SBI bank account CSV statements."""

    bank_name = "sbi"

    def _get_column_mapping(self, headers: List[str]) -> Optional[Dict[str, int]]:
        col_map: Dict[str, int] = {}

        for i, h in enumerate(headers):
            h_lower = h.strip().lower().rstrip(".")
            if h_lower in _DATE_COL_NAMES and "date" not in col_map:
                col_map["date"] = i
            elif h_lower in _DESC_COL_NAMES and "description" not in col_map:
                col_map["description"] = i
            elif h_lower in _DEBIT_COL_NAMES and "debit" not in col_map:
                col_map["debit"] = i
            elif h_lower in _CREDIT_COL_NAMES and "credit" not in col_map:
                col_map["credit"] = i
            elif h_lower in {"balance", "closing balance"} and "balance" not in col_map:
                col_map["balance"] = i
            elif h_lower in _REF_COL_NAMES and "ref" not in col_map:
                col_map["ref"] = i

        if "date" in col_map and "description" in col_map:
            return col_map
        return None

    def _parse_date(self, date_str: str) -> Optional[date]:
        """SBI uses 'DD Mon YYYY' (e.g. '1 Jan 2024') as primary format."""
        cleaned = date_str.strip().replace(",", "")
        cleaned = re.sub(r"\s+", " ", cleaned)
        return parse_date_flexible(cleaned)

    def _clean_description(self, desc: str) -> str:
        desc = re.sub(r"\s+", " ", desc).strip()
        desc = re.sub(r"^(UPI|NEFT|IMPS|RTGS)[/-]", r"\1 ", desc)
        return desc
