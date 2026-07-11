# New Bank Parser: SBI Card

## Feature Description

Add PDF statement parsing support for **SBI Card** credit card statements.
SBI Card (State Bank of India Cards & Payment Services) is one of India's
largest credit card issuers. SBI Card issues multiple products: Prime, Elite,
SimplySAVE, SimplyCLICK, Cashback, etc. — all share the same statement layout.

This parser enables Burnrate users who hold SBI Cards to upload and analyse
their monthly PDF statements.

## Statement Layout (observed from sample)

```
SBI CARD PRIME                          Monthly Statement

Credit Card Number: XXXX XXXX XXXX XX20
*Total Amount Due (₹): <amount>
**Minimum Amount Due (₹): 0.00

Credit Limit (₹) (Including cash): 2,12,000.00
Cash Limit (₹): 63,600.00
Statement Date: 17 Jan 2026
Payment Due Date: NO PAYMENT REQUIRED | <DD Month YYYY>

                    ACCOUNT SUMMARY
Previous Balance | Payments, Reversals & other Credits | Purchases & Other Debits | Fees | Total Outstanding (₹)

         TRANSACTION TABLE
Date | Transaction Details | Amount (₹)
     | for Statement Period: 18 Dec 25 to 17 Jan 26 |
05 Jan 26  PAYMENT RECEIVED 000DP0...  3,539.00 C
```

## Key Parsing Rules

| Field | Pattern |
|---|---|
| Statement period | `for Statement Period: DD MMM YY to DD MMM YY` |
| Transaction date | `DD MMM YY` (e.g. `05 Jan 26`) — 2-digit year |
| Credit marker | Suffix `C` or `Cr` on amount = credit; absent/`D`/`Dr` = debit |
| Amount format | Indian comma notation: `2,12,000.00` (lakhs) |
| Card number | `XXXX XXXX XXXX NNNN` — last 4 digits extracted |
| Payment due | `NO PAYMENT REQUIRED` text → `None`; otherwise date |

## API Contracts

No new API endpoints. Parser output conforms to the existing `ParsedStatement`
and `ParsedTransaction` dataclasses defined in `backend/parsers/base.py`.

## Data Model Changes

None. The `bank` field on `Card` and `Statement` models will store `"sbi"`,
which is already detected by `detector.py`.

## Edge Cases

- **Password-protected PDFs:** SBI Card typically uses `NAME4DDMM` or DOB
  variants. Added to `generate_passwords()` in `pdf_unlock.py`.
- **Zero Total Amount Due / "NO PAYMENT REQUIRED":** Statement shows a zero
  due and `NO PAYMENT REQUIRED` for fully paid accounts. Parser sets
  `total_amount_due = 0.0` and `payment_due_date = None`.
- **Indian lakh formatting:** `2,12,000.00` is valid; `replace(",", "")` before
  `float()` conversion handles it.
- **2-digit years:** `05 Jan 26` → 2026. Handled by `%d %b %y` strptime format.
- **Statement with no transactions:** Zero-spend period statements must still
  parse metadata correctly and return `transactions = []`.
- **Multi-page statements:** Parser accumulates lines and tables across all pages.
- **Card variant:** SBI CARD PRIME / ELITE / etc. detected from page 1 header
  and stored in `card_variant`.

## Sample Statement

Synthetic fixture will be generated at:
`tests/fixtures/sbi_9999_synthetic.pdf`

Real statement fixture (if provided by contributor) must be fully redacted:
- Replace card number with `XXXX XXXX XXXX 9999`
- Replace name/DOB/address with dummy data
- Replace transaction descriptions with generic text

## Verification Plan

```bash
python -m pytest tests/test_parsers.py::TestSBICardParser -v
python -m pytest tests/ -v --ignore=tests/test_browser.py
```
