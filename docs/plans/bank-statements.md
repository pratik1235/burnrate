# Bank Account Statements Feature Spec

## Overview

Add support for importing and analyzing bank account statements (CSV) alongside existing credit card statements. Bank statements introduce a `source` dimension (`CC` or `BANK`) across the data model, new parsers for CSV formats, dedicated UI pages, and spend-calculation adjustments to prevent double-counting CC bill payments.

## Data Model Changes

### Statement table additions
- `source` (String, default `"CC"`) — `"CC"` for credit card, `"BANK"` for bank account

### Transaction table additions
- `source` (String, default `"CC"`) — mirrors parent statement source

### Design decision
- Reuse `card_last4` for bank account last 4 digits rather than creating a separate column.
- `card_id` is NULL for BANK statements since bank accounts are not registered as cards.
- Bank account management (a dedicated `bank_accounts` table) deferred to a follow-up.

## CSV Parser Architecture

All CSV bank parsers extend `BaseBankCSVParser` which itself extends `BaseParser`. Each parser:
1. Detects column mapping from header row using known column name variants
2. Iterates rows, extracts date, description/narration, debit, credit, and balance
3. Computes period_start/end from min/max transaction dates
4. Returns `ParsedStatement` with `bank` and transaction list

### Supported Banks (CSV)

| Bank | Column Headers | Date Format |
|------|---------------|-------------|
| HDFC | Date, Narration, Chq./Ref.No., Value Dt, Withdrawal Amt., Deposit Amt., Closing Balance | DD/MM/YY |
| ICICI | Transaction Date, Value Date, Description/Remarks, Withdrawal/Debit, Deposit/Credit, Balance | DD/MM/YYYY or DD-Mon-YYYY |
| SBI | Txn Date, Value Date, Description, Ref No./Cheque No., Debit, Credit, Balance | DD Mon YYYY or DD/MM/YYYY |
| Axis | Tran Date, CHQNO, PARTICULARS, DR, CR, BAL, SOL | DD-MM-YYYY |
| Generic | Auto-detected from common header patterns | Multiple formats |

### Bank Detection for CSV
- Filename-based detection (e.g. "hdfc_statement.csv" → hdfc)
- Header-row analysis as fallback (column names unique to each bank)

## Statement Processor Changes

- Accept `.csv` files in addition to `.pdf`
- Skip PDF-specific logic (encryption check, pdfplumber parsing) for CSV files
- Use `detect_bank_csv()` for bank detection from CSV content
- Skip card registration check for BANK source statements
- Set `source="BANK"` on created Statement and Transaction records

## API Changes

### `POST /api/statements/upload`
- Accept `.csv` files alongside `.pdf`
- New optional form field: `source` ("CC" or "BANK", default "CC")

### `POST /api/statements/upload-bulk`
- Accept `.csv` files alongside `.pdf`
- New optional form field: `source`

### `GET /api/statements`
- Include `source` field in response

### `GET /api/transactions`
- Include `source` field in response
- New query param: `source` (filter by CC/BANK)

## Analytics Adjustments

- CC Bill Payment transactions from BANK source are excluded from all spend calculations
- This prevents double-counting when a bank statement shows a CC bill payment that also appears as a payment on the CC statement

## UI Changes

### Navbar
- Add "Bank Statements" tab between "Cards" and "Transactions"

### Bank Statements Page (`/bank-statements`)
- Lists all imported bank statements with source=BANK
- Columns: Bank Name, Account Last 4, Period, Transaction Count
- Filter by bank name and date range

### Customize Page
- Add "Drop Bank Statement CSVs" upload component
- Move existing StatUpload and rename to "Drop Card Statement PDFs"

### Dashboard
- Remove StatUpload component (moved to Customize)

### Transaction Row
- Add source label ("CC" or "BANK") next to bank/card info

### Filter Modal
- Add "Source" filter section: CC / BANK / All

### Statement Password Handling
- Statements that failed to unlock show "Enter password for this statement to be processed"
- Password input inline on the statement row
- On submit, reprocess statement with provided password (not stored)

## Edge Cases

- CSV files with BOM (byte order mark) — strip before parsing
- Empty CSV / header-only CSV — return parse_error
- Mixed date formats within a single CSV — attempt multiple format parsers
- Commas within quoted fields — use Python csv module (handles RFC 4180)
- Bank detection failure — use generic parser with auto-detect column mapping
- Duplicate hash check applies equally to CSV files

## Security

- CSV file path validation same as PDF
- Input sanitization on all parsed text fields
- File size limit (50MB) applies to CSV uploads
- No raw SQL — all queries via SQLAlchemy ORM
