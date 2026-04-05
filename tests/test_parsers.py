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
from tests.synthetic_profile import (
    AXIS_STATEMENT,
    DOB_DAY,
    DOB_MONTH,
    DOB_YEAR,
    HDFC_STATEMENT,
    ICICI_STATEMENT,
    IDFC_SYNTHETIC_PDF,
    LAST4_AXIS,
    LAST4_HDFC,
    LAST4_ICICI,
    LAST4_IDFC_SYNTH,
    NAME,
    card_last4s_for_pdf_unlock,
)

FIXTURES = Path(__file__).parent / "fixtures"

PROFILE = {
    "name": NAME,
    "dob_day": DOB_DAY,
    "dob_month": DOB_MONTH,
    "dob_year": DOB_YEAR,
}


def _unlock(pdf_path: str, bank: str) -> str:
    """Attempt to unlock a PDF; returns the (possibly unlocked) path."""
    passwords = generate_passwords(
        bank=bank,
        name=PROFILE["name"],
        dob_day=PROFILE["dob_day"],
        dob_month=PROFILE["dob_month"],
        card_last4s=card_last4s_for_pdf_unlock(),
        dob_year=PROFILE["dob_year"],
    )
    result = unlock_pdf(
        pdf_path, passwords, allowed_roots=(FIXTURES.resolve(),),
    )
    return result or pdf_path


# =====================================================================
# HDFC — sample statement, Feb 2026
# =====================================================================
class TestHDFCParser:

    @pytest.fixture(autouse=True)
    def parse(self, tmp_path):
        src = str(FIXTURES / HDFC_STATEMENT)
        unlocked = _unlock(src, "hdfc")
        self.result = HDFCParser().parse(unlocked)
        yield
        if unlocked != src:
            Path(unlocked).unlink(missing_ok=True)

    def test_card_detected(self):
        assert self.result.card_last4 == LAST4_HDFC

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
# Axis
# =====================================================================
class TestAxisParser:

    @pytest.fixture(autouse=True)
    def parse(self, tmp_path):
        src = str(FIXTURES / AXIS_STATEMENT)
        unlocked = _unlock(src, "axis")
        self.result = AxisParser().parse(unlocked)
        yield
        if unlocked != src:
            Path(unlocked).unlink(missing_ok=True)

    def test_card_detected(self):
        assert self.result.card_last4 == LAST4_AXIS

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
# ICICI
# =====================================================================
class TestICICIParser:

    @pytest.fixture(autouse=True)
    def parse(self, tmp_path):
        src = str(FIXTURES / ICICI_STATEMENT)
        unlocked = _unlock(src, "icici")
        self.result = ICICIParser().parse(unlocked)
        yield
        if unlocked != src:
            Path(unlocked).unlink(missing_ok=True)

    def test_card_detected(self):
        assert self.result.card_last4 == LAST4_ICICI

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
        src = str(FIXTURES / IDFC_SYNTHETIC_PDF)
        self.result = IDFCFirstBankParser().parse(src)

    def test_card_detected(self):
        assert self.result.card_last4 == LAST4_IDFC_SYNTH

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
