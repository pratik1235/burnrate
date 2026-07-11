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
from backend.parsers.sbi import SBICardParser
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
    LAST4_SBI_SYNTH,
    LAST4_SBI_REGISTERED,
    NAME,
    SBI_SYNTHETIC_PDF,
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


# =====================================================================
# SBI Card — Synthetic fixture (layout smoke test)
# =====================================================================
class TestSBICardParser:
    """Tests for the SBI Card PDF statement parser using a synthetic fixture.

    Fixture: tests/fixtures/sbi_xx20_synthetic.pdf
    Generator: scripts/generate_sbi_fixture_pdf.py

    This fixture specifically exercises the SBI partial card number scenario:
    the card number is printed as "XXXX XXXX XXXX XX20" (only last 2 digits
    visible). The parser must return "20" — NOT "0020" (zero-padded, wrong)
    and NOT None (no data). The statement_processor then resolves the correct
    registered card via a suffix match (last4.endswith("20")).
    """

    @pytest.fixture(autouse=True)
    def parse(self):
        src = str(FIXTURES / SBI_SYNTHETIC_PDF)
        self.result = SBICardParser().parse(src)

    # --- Metadata ---

    def test_bank_identifier(self):
        assert self.result.bank == "sbi"

    def test_card_last4_is_partial_digits(self):
        """Core SBI partial-digit contract: parser returns raw visible digits.

        When the statement shows "XXXX XXXX XXXX XX20", card_last4 must be
        exactly "20" — not None (would lose card info), not "0020" (fabricates
        unknown digits), not "9999" (not in the fixture at all).
        The full 4-digit last4 is resolved by statement_processor at import time.
        """
        assert self.result.card_last4 == LAST4_SBI_SYNTH  # "20"
        assert len(self.result.card_last4) == 2, (
            "SBI partial-digit: fixture shows only last 2, parser should return exactly 2 digits"
        )
        assert self.result.card_last4 != "0020", (
            "Must NOT zero-pad: '0020' fabricates digits that aren't in the statement"
        )

    def test_suffix_match_resolves_registered_card(self):
        """Document the suffix-match contract for the statement_processor.

        LAST4_SBI_REGISTERED ends with LAST4_SBI_SYNTH ("1320" ends with "20").
        The statement_processor uses this to resolve the correct card.
        """
        assert LAST4_SBI_REGISTERED.endswith(LAST4_SBI_SYNTH), (
            "Test constant LAST4_SBI_REGISTERED must end with LAST4_SBI_SYNTH "
            "to represent a realistic registered card that the suffix match would find"
        )

    def test_period_start_and_end(self):
        from datetime import date
        assert self.result.period_start == date(2025, 12, 18)
        assert self.result.period_end == date(2026, 1, 17)

    def test_period_ordering(self):
        assert self.result.period_start < self.result.period_end

    def test_total_amount_due(self):
        assert self.result.total_amount_due == pytest.approx(1234.56, abs=0.01)

    def test_credit_limit(self):
        assert self.result.credit_limit == pytest.approx(212_000.0, abs=1)

    def test_payment_due_date(self):
        from datetime import date
        assert self.result.payment_due_date == date(2026, 2, 5)

    # --- Transactions ---

    def test_transaction_count(self):
        # Synthetic fixture has 4 transaction lines
        assert len(self.result.transactions) == 4

    def test_has_debit_transactions(self):
        debits = [tx for tx in self.result.transactions if tx.type == "debit"]
        assert len(debits) >= 1

    def test_has_credit_transactions(self):
        credits = [tx for tx in self.result.transactions if tx.type == "credit"]
        assert len(credits) >= 1, "Statement must have at least one credit (payment/refund)"

    def test_payment_received_is_credit(self):
        payments = [tx for tx in self.result.transactions if "PAYMENT RECEIVED" in tx.description.upper()]
        assert len(payments) == 1
        assert payments[0].type == "credit"

    def test_payment_received_has_cc_payment_category(self):
        payments = [tx for tx in self.result.transactions if "PAYMENT RECEIVED" in tx.description.upper()]
        assert payments[0].category == "cc_payment"

    def test_refund_is_credit(self):
        refunds = [tx for tx in self.result.transactions if "REFUND" in tx.description.upper()]
        assert len(refunds) == 1
        assert refunds[0].type == "credit"

    def test_no_zero_amounts(self):
        for tx in self.result.transactions:
            assert tx.amount > 0

    def test_merchants_are_clean(self):
        for tx in self.result.transactions:
            assert tx.merchant and tx.merchant != "Unknown"
            assert len(tx.merchant) <= 512

    def test_all_transaction_dates_in_period(self):
        for tx in self.result.transactions:
            assert self.result.period_start <= tx.date <= self.result.period_end

    def test_debit_total_spend(self):
        debits = sum(tx.amount for tx in self.result.transactions if tx.type == "debit")
        # AMAZON 750.00 + SWIGGY 320.00 = 1070.00
        assert debits == pytest.approx(1070.0, abs=1)
