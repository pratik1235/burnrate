"""Synthetic user profile and card last-four values for tests (not real PII)."""

NAME = "Casey Jordan"
DOB_DAY = "17"
DOB_MONTH = "08"
DOB_YEAR = "1992"

LAST4_HDFC = "4219"
LAST4_AXIS = "5631"
LAST4_ICICI = "7820"
LAST4_EXTRA = "3192"
LAST4_IDFC_SYNTH = "1847"

HDFC_STATEMENT = f"hdfc_{LAST4_HDFC}_2026-02.pdf"
AXIS_STATEMENT = f"axis_{LAST4_AXIS}.pdf"
ICICI_STATEMENT = f"icici_{LAST4_ICICI}.pdf"
IDFC_SYNTHETIC_PDF = f"idfc_{LAST4_IDFC_SYNTH}_synthetic.pdf"


def card_last4s_for_pdf_unlock() -> list[str]:
    return [LAST4_HDFC, LAST4_EXTRA, LAST4_AXIS, LAST4_ICICI]
