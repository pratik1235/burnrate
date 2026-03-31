#!/usr/bin/env python3
"""Regenerate tests/fixtures/idfc_9370_synthetic.pdf (synthetic IDFC-style layout).

Requires: pip install fpdf2
Run from repo root: python scripts/generate_idfc_fixture_pdf.py
"""

from pathlib import Path

from fpdf import FPDF


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    out = root / "tests" / "fixtures" / "idfc_9370_synthetic.pdf"

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", size=9)
    lines = [
        "IDFC FIRST Bank",
        "Credit Card Statement",
        "(XX9370)",
        "Statement period 01/Jan/2026 - 31/Jan/2026",
        "",
        "Total Amount Due",
        "Rs 1,234.56 DR",
        "Minimum Amount Due",
        "100.00 DR",
        "Credit Limit",
        "500000.00",
        "Payment Due Date",
        "15/Feb/2026",
        "",
        "15/01/2026    AMAZON INDIA    500.00 DR",
        "16/01/2026    CASHBACK CREDIT    25.50 CR",
        "20/01/2026    SWIGGY    320.75 DR",
    ]
    for line in lines:
        pdf.cell(0, 5, line, ln=1)

    pdf.output(str(out))
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
