# PDF Parsing Feature Plan

**Version:** 1.0  
**Last Updated:** March 2026

---

## Overview

PDF parsing extracts transactions and statement metadata from credit card statement PDFs. The system uses:

1. **Base interface** — Abstract `BaseParser` with `parse(file_path) -> ParsedStatement`
2. **Bank-specific parsers** — HDFC, ICICI, Axis, Federal, Indian Bank, IDFC FIRST
3. **Generic parser** — Fallback for unsupported banks
4. **Bank detector** — Identifies bank from filename, BIN patterns, PDF text

---

## Parser Interface

### BaseParser (Abstract)

**Location:** `backend/parsers/base.py`

**Method:** `parse(pdf_path: str) -> ParsedStatement`

### ParsedStatement (Dataclass)

| Field | Type | Description |
|-------|------|-------------|
| bank | str | Bank identifier |
| period_start | Optional[date] | Statement period start |
| period_end | Optional[date] | Statement period end |
| transactions | List[ParsedTransaction] | Extracted transactions |
| card_last4 | Optional[str] | Last 4 digits of card |
| total_amount_due | Optional[float] | Amount due from statement |
| credit_limit | Optional[float] | Credit limit from statement |
| currency | str | ISO-style code (default INR); set when inferrable from document text |

### ParsedTransaction (Dataclass)

| Field | Type | Description |
|-------|------|-------------|
| date | date | Transaction date |
| merchant | str | Merchant/description |
| amount | float | Amount |
| type | str | "debit" or "credit" |
| description | str | Raw description |

---

## Bank Detector

**Location:** `backend/parsers/detector.py`

**Function:** `detect_bank(pdf_path: str) -> Optional[str]`

### Detection Order

1. **Filename** — Case-insensitive substring match:
   - hdfc, icici, axis, sbi, amex, idfc_first, indusind, kotak, sc, yes, au, rbl, federal, indian_bank

2. **BIN (filename)** — Regex `(\d{4})[xX*]+\d{2,4}`:
   - HDFC: 5522, 4386, 4567, 5241, 4543, 5254, 4213
   - ICICI: 4568, 5243, 4998, 5236, 4389, 4315, 5270, 4329
   - Axis: 4108, 4178, 5269, 4021, 4717

3. **PDF text** — First page via pdfplumber:
   - Search for "hdfc", "icici bank", "axis bank", "sbi", "amex", etc.
   - IDFC FIRST: "idfc first" or word-boundary `idfc`
   - Federal: "federal bank" (exclude "south indian bank")
   - Indian Bank: "indian bank" (exclude "south indian bank")

**Returns:** Bank slug or None

---

## Bank-Specific Parsers

### HDFC Parser

**Location:** `backend/parsers/hdfc.py`

**Format:** Regalia/Infinia/Diners style. pdfplumber extracts:
- Transaction lines: `DD/MM/YYYY| HH:MM DESCRIPTION [+|- REWARDS] [+] C AMOUNT [l]`
- ₹ rendered as 'C'; colored dot as 'l'
- Credit: '+' before amount

**Extracts:**
- Period: "Billing Period DD Mon YYYY - DD Mon YYYY"
- Card: "Credit Card No. NNNNXX...XXNNNN"
- Total due, credit limit via regex
- Transactions: date, amount, direction from line patterns
- Multi-line: Fixup for "Unknown" merchant by looking backward for description

---

### ICICI Parser

**Location:** `backend/parsers/icici.py`

**Format:** Amazon Pay / Coral / Rubyx. ₹ as backtick (`).
- `DD/MM/YYYY SERIAL DESCRIPTION REWARD_PTS AMOUNT [CR]`

**Extracts:**
- Period: "Statement period: Mon DD, YYYY to Mon DD, YYYY"
- Card: `(\d{4})[Xx*]+(\d{3,4})`
- Total due: "Total Amount due" + backtick amount
- Credit limit: "Credit Limit (Including cash)" + max amount in window
- Transactions: CR suffix = credit

---

### Axis Parser

**Location:** `backend/parsers/axis.py`

**Format:** Payment Summary + transaction table:
- `DATE | TRANSACTION DETAILS | MERCHANT CATEGORY | AMOUNT Dr/Cr`

**Extracts:**
- Period: "Statement Period" + DD/MM/YYYY - DD/MM/YYYY
- Card: `(\d{4,6})\*+(\d{4})`
- Total due: "Total Payment Due"
- Credit limit: First "Credit Limit" (not "Available"); max amount in window
- Transactions: Dr/Cr suffix; strip known merchant category labels (MISC STORE, etc.)

---

### Federal Bank Parser

**Location:** `backend/parsers/federal.py`

**Format:** Celesta/Imperio/Signet/Scapia. Date formats: DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY.
- `DATE DESCRIPTION AMOUNT [Cr]`

**Extracts:**
- Period: "Statement Period" or "Billing Cycle"
- Card: "Card No" or "Credit Card" + masked number
- Total due, credit limit via regex
- Transactions: Cr suffix = credit; strip merchant category labels

---

### Indian Bank Parser

**Location:** `backend/parsers/indian_bank.py`

**Format:** OneCard. Title: "Indian Bank One Credit Card Statement (DD Mon YYYY - DD Mon YYYY)".
- Card: NNNN-NNXX-XXXX-NNNN
- Transaction table: Date | Merchant | Category | Mode | Reward Points | Amount
- Dates: "DD Mon" (year from period)
- Credits: Category keywords (repayment, refund, etc.)

**Extracts:**
- Period from title or "Statement Period"
- Card from dashed or generic pattern
- Total due, credit limit
- Transactions: Text and table extraction; credit from category keywords
- Short dates: Resolve year from period_end

---

### IDFC FIRST Parser

**Location:** `backend/parsers/idfc_first.py`

**Format:** Portal/email credit card PDF. Summary block: statement period `DD/Mon/YYYY - DD/Mon/YYYY`, card `(XX####)` or `XXXX ####`, Total Amount Due (often `Rs … DR`), Minimum Amount Due, Credit Limit, Payment Due Date.

**Extracts:**
- Period, card last4, total due, credit limit (regex over a bounded prefix of extracted text to avoid fragile cross-line matches)
- Transactions: Prefer `extract_tables()` when a header row contains "Transaction" + "Date" and an amount column; split table cells on newlines and zip date/description/amount rows
- Fallback: text lines matching `DD/MM/YYYY … amount DR|CR` (synthetic/smaller PDFs)
- Currency: `infer_currency_from_document_text` (₹ / INR in document)

**Encrypted PDFs:** There is no stable, publicly documented IDFC-specific password pattern in-repo. `pdf_unlock.generate_passwords` uses the **generic** candidate list for `idfc_first` (name/DOB/last4 variants). If auto-unlock fails, the user must use **Reparse** with a **manual password** (same flow as other banks). Do not log passwords (see Constitution §4.6). Add a dedicated `idfc_first` branch in `pdf_unlock.py` only after a verified format from official documentation or repeatable user reports.

---

## Generic Parser

**Location:** `backend/parsers/generic.py`

**Purpose:** Fallback for banks without dedicated parser (SBI, Amex, etc.).

**Logic:**
1. Extract all text from all pages via pdfplumber
2. Period: Regex for "Statement Period", "Billing Period", "From...To"
3. Card: `(\d{4,6})[Xx*]{4,}(\d{4})` → last 4
4. Total due: "Total Amount Due", "Amount Payable"
5. Credit limit: "Credit Limit"
6. Transactions: Line pattern `DD/MM/YYYY description amount [Dr/Cr]`
7. Date formats: DD/MM/YYYY, DD-MM-YYYY, DD/MM/YY, DD-MM/YY

---

## Parser Selection

**In statement_processor:**
- If `bank in PARSERS` (hdfc, icici, axis, federal, indian_bank, idfc_first): use dedicated parser
- Else: `GenericParser(bank=bank)`

---

## Edge Cases

### Invalid Input

| Scenario | Handling |
|---------|----------|
| Non-existent path | File open raises; caught by processor |
| Non-PDF file | pdfplumber may fail or return garbage |
| Empty PDF | pdf.pages empty; detector returns None |

### Duplicate Data

| Scenario | Handling |
|----------|----------|
| Duplicate transactions in PDF | Parsers use `seen` set with (date, merchant, amount, type) |
| Same transaction across pages | Dedup in parser |

### Missing Data

| Scenario | Handling |
|----------|----------|
| No period in PDF | period_start, period_end = None |
| No card in PDF | card_last4 = None |
| No total due | total_amount_due = None |
| No credit limit | credit_limit = None |
| No transactions | Empty list; processor may treat as parse_error |

### Corrupted/Unusual PDFs

| Scenario | Handling |
|----------|----------|
| Encrypted | Unlock before parse (`pikepdf`); IDFC uses generic password guesses or manual password via Reparse |
| Corrupted | pdfplumber may raise; exception propagates |
| Scanned/image PDF | pdfplumber extracts nothing; no OCR |
| Unusual layout | Parser regex may miss; generic fallback |

### Bank Detection Failures

| Scenario | Handling |
|----------|----------|
| Unknown bank in filename | Try PDF text |
| No text extractable | Return None; processor returns "Could not detect bank" |
| Ambiguous (e.g., "bank" in text) | First match wins |

### Parser-Specific Edge Cases

| Parser | Edge Case | Handling |
|--------|-----------|----------|
| HDFC | RuPay multi-line | Pass 2: fixup "Unknown" from preceding lines |
| HDFC | Reward points in line | Strip trailing `+ N` or `- N` |
| ICICI | Multiple card patterns | First match |
| Axis | Available vs Credit Limit | Skip "available"; take max amount |
| Federal | DD Mon YYYY | _parse_text_date |
| Indian Bank | DD Mon (no year) | Infer from period_end |
| IDFC FIRST | Table column drift | Text-line fallback; header row detection |
| Generic | Weak patterns | May extract little |

---

## Error Handling

| Error | Handling |
|-------|----------|
| pdfplumber open fail | Exception; processor returns error |
| Parser exception | Propagates; processor catches, returns error |
| No transactions + no period | parse_error status |

---

## Security Considerations

- **Path:** Caller ensures path is valid; parser does not validate
- **No external calls:** Parsing is local
- **Memory:** Full PDF loaded by pdfplumber; large PDFs may use significant memory

---

## Testing Strategy

### Existing Tests

- **test_parsers.py:** HDFC, Axis, ICICI, IDFC FIRST (synthetic fixture) — card, period, count, amounts, merchants
- **test_api.py:** Full upload flow exercises parsers

### Recommended Additional Tests

- Federal, Indian Bank parser unit tests
- Generic parser with sample PDF
- Bank detector: filename, BIN, PDF text
- Empty PDF
- Parser with missing period/card
- Merchant cleanup (gateway prefixes, ref numbers)

---

## Parser Comparison

| Parser | Period Format | Card Pattern | Amount Symbol |
|--------|---------------|--------------|---------------|
| HDFC | Billing Period DD Mon YYYY | NNNNXX...XXNNNN | C (rupee) |
| ICICI | Statement period Mon DD YYYY | NNNNXXXXNNNN | ` (backtick) |
| Axis | Statement Period DD/MM/YYYY | NNNN**NNNN | Rs. |
| Federal | Statement Period / Billing | Card No. NNNNXXNNNN | — |
| Indian Bank | Title (DD Mon YYYY) | NNNN-NNXX-XXXX-NNNN | — |
| IDFC FIRST | DD/Mon/YYYY (statement period) | XX#### / XXXX #### | Rs / ₹ |
| Generic | Statement/Billing/From-To | NNNNXXXXNNNN | — |

---

## Merchant Cleanup (Per Parser)

- **HDFC:** Strip EMI, PYU*, Ref#; trim to 512 chars
- **ICICI:** Strip " IN", " INDIA"; trim
- **Axis:** Strip known merchant category labels (MISC STORE, etc.)
- **Federal:** Strip category labels, " IN", " INDIA"
- **Indian Bank:** Strip mode codes (TOKEN_ECOM, POS, etc.), category labels, Ref#
- **IDFC FIRST:** Strip UPI / UPICC prefixes; trim to 512 chars
- **Generic:** Trim to 512; no special cleanup

---

## Date Parsing Formats

| Parser | Formats |
|--------|---------|
| HDFC | DD Mon YYYY, DD/MM/YYYY, DD-MM-YYYY |
| ICICI | Mon DD YYYY, DD/MM/YYYY |
| Axis | DD/MM/YYYY |
| Federal | DD/MM/YYYY, DD Mon YYYY |
| Indian Bank | DD Mon (no year), DD/MM/YYYY |
| IDFC FIRST | DD/Mon/YYYY (period), DD/MM/YYYY (txns) |
| Generic | DD/MM/YYYY, DD-MM-YYYY, DD/MM/YY |

---

## Credit Detection (Per Parser)

- **HDFC:** `+` before amount in line
- **ICICI:** `CR` suffix
- **Axis:** `Cr` in amount column
- **Federal:** `Cr` suffix
- **Indian Bank:** Category in (repayment, refund, etc.)
- **IDFC FIRST:** `CR` / `DR` suffix on amount
- **Generic:** `Cr` suffix; else debit

---

## Adding a New Bank Parser

1. Create `backend/parsers/{bank}.py` with class extending `BaseParser`
2. Implement `parse(pdf_path) -> ParsedStatement`
3. Add to `PARSERS` dict in `statement_processor.py`
4. Add bank to `SUPPORTED_BANKS` and detector in `detector.py`
5. Add password patterns in `pdf_unlock.py` if encrypted
6. Add unit test with fixture PDF

---

## pdfplumber Usage

- `pdfplumber.open(pdf_path)` — context manager
- `pdf.pages` — list of page objects
- `page.extract_text()` — full text (may be None)
- `page.extract_tables()` — table structures (list of row lists)
- Text extraction is heuristic; layout changes can break parsers

---

## ParsedStatement vs Statement Model

- **ParsedStatement:** In-memory result from parser; has `transactions` list
- **Statement:** DB model; has `transaction_count`; transactions in separate table
- Processor converts: creates Statement, then Transaction rows from ParsedTransaction list

---

## Appendix: BIN Ranges (Detector)

| Bank | First 4 Digits |
|------|----------------|
| HDFC | 5522, 4386, 4567, 5241, 4543, 5254, 4213 |
| ICICI | 4568, 5243, 4998, 5236, 4389, 4315, 4998, 5270, 4329 |
| Axis | 4108, 4178, 5269, 4021, 4717 |

---

## Appendix: Parser File Locations

- `backend/parsers/base.py` — BaseParser, ParsedStatement, ParsedTransaction
- `backend/parsers/detector.py` — detect_bank
- `backend/parsers/generic.py` — GenericParser
- `backend/parsers/hdfc.py` — HDFCParser
- `backend/parsers/icici.py` — ICICIParser
- `backend/parsers/axis.py` — AxisParser
- `backend/parsers/federal.py` — FederalBankParser
- `backend/parsers/indian_bank.py` — IndianBankParser
- `backend/parsers/idfc_first.py` — IDFCFirstBankParser

---

## Related Documentation

- **docs/plans/statement-processing.md** — Parser invocation and flow
