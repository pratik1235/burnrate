#!/usr/bin/env python3
"""Generate tests/fixtures/sbi_xx20_synthetic.pdf (synthetic SBI Card-style layout).

This fixture specifically exercises the SBI partial card number scenario where
only the last 2 digits are visible in the statement: "XXXX XXXX XXXX XX20".
The parser should return "20" (raw visible digits, not zero-padded) and the
statement_processor should resolve the correct registered card via suffix match.

Requires: pip install fpdf2
Run from repo root: python scripts/generate_sbi_fixture_pdf.py
"""

from pathlib import Path

from fpdf import FPDF


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    out = root / "tests" / "fixtures" / "sbi_xx20_synthetic.pdf"

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", size=9)

    lines = [
        # Header
        "SBI CARD PRIME                          Monthly Statement",
        # Card number: only last 2 digits visible — the SBI partial-digit scenario
        "Credit Card Number",
        "XXXX XXXX XXXX XX20",
        "",
        "*Total Amount Due (Rs) 1,234.56",
        "**Minimum Amount Due (Rs) 123.00",
        "",
        "Credit Limit (Rs) (Including cash)",
        "2,12,000.00",
        "Cash Limit (Rs)",
        "63,600.00",
        "Statement Date",
        "17 Jan 2026",
        "Payment Due Date",
        "05 Feb 2026",
        "",
        # Account summary (summary rows should NOT parse as transactions)
        "ACCOUNT SUMMARY",
        "Previous Balance  Payments, Reversals & other Credits  Purchases & Other Debits  Total Outstanding",
        "3,538.82  1,234.56  1,234.56  1,234.56",
        "",
        # Transaction table
        "Date     Transaction Details                           Amount (Rs)",
        "         for Statement Period: 18 Dec 25 to 17 Jan 26",
        "05 Jan 26  PAYMENT RECEIVED 000DP016005192525C494pG    3539.00 C",
        "10 Jan 26  AMAZON INDIA PVTE                           750.00",
        "12 Jan 26  SWIGGY ORDER 12345                          320.00",
        "15 Jan 26  REFUND FLIPKART ORDER                       200.00 C",
        "",
    ]
    for line in lines:
        pdf.cell(0, 5, line, new_x="LMARGIN", new_y="NEXT")

    pdf.output(str(out))
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
