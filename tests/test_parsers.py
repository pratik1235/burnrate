"""Parser-level integration tests.

Verifies that each bank parser correctly extracts metadata and
transactions from real PDF statements in the fixtures directory.
"""

from datetime import date
from pathlib import Path

import pytest

from backend.parsers.hdfc import HDFCParser
from backend.parsers.axis import AxisParser
from backend.parsers.icici import ICICIParser
from backend.parsers.idfc_first import IDFCFirstBankParser
from backend.services.pdf_unlock import generate_passwords, unlock_pdf

FIXTURES = Path(__file__).parent / "fixtures"

PROFILE = {
    "name": "Pratik Prakash",
    "dob_day": "09",
    "dob_month": "02",
    "dob_year": "1999",
}


def _unlock(pdf_path: str, bank: str) -> str:
    """Attempt to unlock a PDF; returns the (possibly unlocked) path."""
    passwords = generate_passwords(
        bank=bank,
        name=PROFILE["name"],
        dob_day=PROFILE["dob_day"],
        dob_month=PROFILE["dob_month"],
        card_last4s=["8087", "1464", "9735", "0000"],
        dob_year=PROFILE["dob_year"],
    )
    result = unlock_pdf(pdf_path, passwords)
    return result or pdf_path


# =====================================================================
# HDFC — Card 8087, Feb 2026
# =====================================================================
class TestHDFCParser:

    @pytest.fixture(autouse=True)
    def parse(self, tmp_path):
        src = str(FIXTURES / "hdfc_8087_2026-02.pdf")
        unlocked = _unlock(src, "hdfc")
        self.result = HDFCParser().parse(unlocked)
        yield
        if unlocked != src:
            Path(unlocked).unlink(missing_ok=True)

    def test_card_detected(self):
        assert self.result.card_last4 == "8087"

    def test_period(self):
        assert self.result.period_start is not None
        assert self.result.period_end is not None
        assert self.result.period_start < self.result.period_end

    def test_transaction_count(self):
        assert len(self.result.transactions) == 35

    def test_total_amount_due(self):
        assert self.result.total_amount_due is not None
        assert self.result.total_amount_due > 0

    def test_credit_limit(self):
        assert self.result.credit_limit is not None
        assert self.result.credit_limit > 0

    def test_has_both_debits_and_credits(self):
        types = {tx.type for tx in self.result.transactions}
        assert "debit" in types
        assert "credit" in types

    def test_merchants_are_clean(self):
        for tx in self.result.transactions:
            assert tx.merchant != "Unknown"
            assert len(tx.merchant) <= 512

    def test_no_zero_amounts(self):
        for tx in self.result.transactions:
            assert tx.amount > 0


# =====================================================================
# Axis — Card 9735
# =====================================================================
class TestAxisParser:

    @pytest.fixture(autouse=True)
    def parse(self, tmp_path):
        src = str(FIXTURES / "axis_9735.pdf")
        unlocked = _unlock(src, "axis")
        self.result = AxisParser().parse(unlocked)
        yield
        if unlocked != src:
            Path(unlocked).unlink(missing_ok=True)

    def test_card_detected(self):
        assert self.result.card_last4 == "9735"

    def test_period(self):
        assert self.result.period_start is not None
        assert self.result.period_end is not None

    def test_transaction_count(self):
        assert len(self.result.transactions) == 12

    def test_total_spend(self):
        debits = sum(tx.amount for tx in self.result.transactions if tx.type == "debit")
        assert debits == pytest.approx(5064.0, abs=1)

    def test_merchants_are_non_empty(self):
        for tx in self.result.transactions:
            assert tx.merchant and tx.merchant != "Unknown"


# =====================================================================
# ICICI — Card 0000
# =====================================================================
class TestICICIParser:

    @pytest.fixture(autouse=True)
    def parse(self, tmp_path):
        src = str(FIXTURES / "icici_0000.pdf")
        unlocked = _unlock(src, "icici")
        self.result = ICICIParser().parse(unlocked)
        yield
        if unlocked != src:
            Path(unlocked).unlink(missing_ok=True)

    def test_card_detected(self):
        assert self.result.card_last4 == "0000"

    def test_period(self):
        assert self.result.period_start is not None
        assert self.result.period_end is not None

    def test_transaction_count(self):
        assert len(self.result.transactions) == 4

    def test_has_credit_transaction(self):
        credits = [tx for tx in self.result.transactions if tx.type == "credit"]
        assert len(credits) >= 1, "ICICI statement should have at least one credit (BBPS payment)"

    def test_total_debit_spend(self):
        debits = sum(tx.amount for tx in self.result.transactions if tx.type == "debit")
        assert debits == pytest.approx(2405.14, abs=1)


# =====================================================================
# IDFC FIRST — Synthetic fixture (layout smoke test)
# =====================================================================
class TestIDFCFirstParser:

    @pytest.fixture(autouse=True)
    def parse(self):
        src = str(FIXTURES / "idfc_9370_synthetic.pdf")
        self.result = IDFCFirstBankParser().parse(src)

    def test_card_detected(self):
        assert self.result.card_last4 == "9370"

    def test_period(self):
        assert self.result.period_start == date(2026, 1, 1)
        assert self.result.period_end == date(2026, 1, 31)

    def test_transaction_count(self):
        assert len(self.result.transactions) == 3

    def test_total_amount_due(self):
        assert self.result.total_amount_due == pytest.approx(1234.56, abs=0.01)

    def test_credit_limit(self):
        assert self.result.credit_limit == pytest.approx(500_000.0, abs=1)

    def test_debits_and_credits(self):
        types = {tx.type for tx in self.result.transactions}
        assert "debit" in types
        assert "credit" in types

    def test_merchants_are_clean(self):
        for tx in self.result.transactions:
            assert tx.merchant != "Unknown"
            assert len(tx.merchant) <= 512
