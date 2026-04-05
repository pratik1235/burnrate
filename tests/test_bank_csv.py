"""Unit tests for bank account CSV parsers and BANK statement API."""

from pathlib import Path

import pytest

from backend.parsers.axis_bank_csv import AxisBankCSVParser
from backend.parsers.detector import detect_bank_csv
from backend.parsers.hdfc_bank_csv import HDFCBankCSVParser
from backend.parsers.icici_bank_csv import ICICIBankCSVParser
from backend.parsers.sbi_bank_csv import SBIBankCSVParser

FIXTURES = Path(__file__).parent / "fixtures"


class TestHDFCBankCSVParser:
    def test_parses_rows(self, tmp_path):
        src = FIXTURES / "hdfc_bank_min.csv"
        p = tmp_path / "stmt.csv"
        p.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        result = HDFCBankCSVParser().parse(str(p))
        assert result.bank == "hdfc"
        assert len(result.transactions) == 2
        debits = [t for t in result.transactions if t.type == "debit"]
        credits = [t for t in result.transactions if t.type == "credit"]
        assert len(debits) == 1 and debits[0].amount == 500.0
        assert len(credits) == 1 and credits[0].amount == 50000.0


class TestDetectBankCSV:
    def test_detects_hdfc_from_file(self, tmp_path):
        src = FIXTURES / "hdfc_bank_min.csv"
        p = tmp_path / "hdfc_statement.csv"
        p.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        assert detect_bank_csv(str(p)) == "hdfc"


@pytest.mark.parametrize(
    "cls,header_line,data_line",
    [
        (
            ICICIBankCSVParser,
            "Transaction Date,Value Date,Transaction Remarks,Withdrawal Amount (INR),Deposit Amount (INR),Balance (INR)\n",
            "01/01/2024,01/01/2024,TEST,100.00,,900.00\n",
        ),
        (
            SBIBankCSVParser,
            "Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance\n",
            "01/01/2024,01/01/2024,TEST,,100.00,,1000.00\n",
        ),
        (
            AxisBankCSVParser,
            "Tran Date,CHQNO,PARTICULARS,DR,CR,BAL,SOL\n",
            "01-01-2024,,TEST,100.00,,1000.00,X\n",
        ),
    ],
)
def test_minimal_bank_csv_parse(cls, header_line, data_line, tmp_path):
    p = tmp_path / "stmt.csv"
    p.write_text(header_line + data_line, encoding="utf-8")
    result = cls().parse(str(p))
    assert result.bank == cls.bank_name
    assert len(result.transactions) >= 1


class TestBankStatementUpload:
    def test_upload_bank_csv_source_bank(self, api_client):
        filepath = FIXTURES / "hdfc_bank_min.csv"
        with open(filepath, "rb") as f:
            resp = api_client.post(
                "/api/statements/upload",
                files={"file": ("hdfc_bank_min.csv", f, "text/csv")},
                data={"source": "BANK"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("status") == "success"
        assert data.get("count", 0) >= 1

        tx_resp = api_client.get("/api/transactions", params={"source": "BANK", "limit": 50})
        assert tx_resp.status_code == 200
        txs = tx_resp.json().get("transactions", [])
        assert any(t.get("source") == "BANK" for t in txs)

        ba = api_client.get("/api/transactions/bank-accounts")
        assert ba.status_code == 200
        accounts = ba.json().get("accounts", [])
        assert isinstance(accounts, list)
