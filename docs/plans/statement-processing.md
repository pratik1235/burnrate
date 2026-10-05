# Statement Processing Feature Plan

**Version:** 1.0  
**Last Updated:** March 2026

---

## Overview

Statement processing is the core backend feature that ingests credit card statement PDFs, extracts transactions, categorizes them, and persists the data. The pipeline handles:

1. **Upload** — Validate PDF files, sanitize filenames, save to persistent storage
2. **Hash** — Compute SHA-256 for deduplication
3. **Bank Detection** — Identify bank from filename, BIN patterns, or PDF text content
4. **Unlock** — Decrypt password-protected PDFs using manual password or auto-generated candidates
5. **Parse** — Extract transactions and metadata via bank-specific or generic parser
6. **Card Resolution** — Match parsed `card_last4` to registered cards
7. **Categorization** — Keyword matching against `CategoryDefinition` keywords
8. **Persistence** — Create `Statement` and `Transaction` records

The processing pipeline is invoked by:
- **Single upload** — `POST /api/statements/upload` (synchronous)
- **Bulk upload** — `POST /api/statements/upload-bulk` (async via processing queue)
- **Watch folder** — Auto-import when PDFs appear in configured directory
- **Reparse** — `POST /api/statements/{id}/reparse` or `POST /api/statements/reparse-all`

---

## API Endpoints

### POST /api/statements/upload

**Purpose:** Accept a single PDF file upload and process it synchronously.

**Request:**
- **Content-Type:** `multipart/form-data`
- **Body:**
  - `file` (required): PDF file
  - `bank` (optional): Override bank detection (e.g., `hdfc`, `icici`)
  - `password` (optional): Manual password for encrypted PDFs

**Response (200):**
```json
{
  "status": "success",
  "count": 35,
  "period": {"start": "2026-01-01", "end": "2026-01-31"},
  "bank": "hdfc"
}
```

**Alternative responses:**
- `status: "duplicate"` — Same file already imported (by SHA-256 hash)
- `status: "card_not_found"` — No matching card registered
- `status: "parse_error"` — Parser could not extract transactions
- `status: "error"` — Generic error with `message` field

**Status Codes:**
- `200` — Processing completed (success or non-fatal status)
- `400` — Non-PDF file or missing filename
- `413` — File exceeds 50 MB limit

---

### POST /api/statements/upload-bulk

**Purpose:** Accept multiple PDF files; enqueue for processing via shared ThreadPoolExecutor (max 10 concurrent).

**Request:**
- **Content-Type:** `multipart/form-data`
- **Body:**
  - `files` (required): Array of PDF files
  - `bank` (optional): Override bank for all files
  - `password` (optional): Manual password for encrypted PDFs

**Response (200):**
```json
{
  "status": "ok",
  "total": 5,
  "success": 3,
  "failed": 0,
  "duplicate": 1,
  "card_not_found": 0,
  "parse_error": 1,
  "skipped": 0
}
```

**Status Codes:**
- `200` — All files processed (aggregate counts)
- `400` — No valid PDF files provided (all skipped)

---

### GET /api/statements

**Purpose:** List all imported statements.

**Response (200):**
```json
[
  {
    "id": "uuid",
    "bank": "hdfc",
    "card_last4": "8087",
    "period_start": "2026-01-01",
    "period_end": "2026-01-31",
    "transaction_count": 35,
    "total_spend": 45000.0,
    "total_amount_due": 45000.0,
    "credit_limit": 100000.0,
    "status": "success",
    "imported_at": "2026-03-01T12:00:00"
  }
]
```

---

### DELETE /api/statements/{statement_id}

**Purpose:** Delete a statement and cascade to its transactions and tags.

**Response (200):**
```json
{"status": "ok", "message": "Statement and transactions deleted"}
```

**Status Codes:**
- `404` — Statement not found

---

### POST /api/statements/{statement_id}/reparse

**Purpose:** Delete existing statement, reparse from stored `file_path`, and re-import.

**Response (200):** Same as upload success.

**Status Codes:**
- `404` — Statement not found
- `400` — Original PDF file not found on disk

---

### POST /api/statements/reparse-all

**Purpose:** Delete all statements, reparse each from stored file path, re-import with max 10 concurrent workers.

**Response (200):**
```json
{
  "status": "ok",
  "total": 5,
  "success": 4,
  "failed": 0,
  "skipped": 1
}
```

---

### GET /api/statements/processing-logs

**Purpose:** Return recent processing logs for frontend polling (e.g., watch folder results).

**Query Params:**
- `unread_only` (default: true): Only return unacknowledged logs

**Response (200):**
```json
[
  {
    "id": "uuid",
    "fileName": "hdfc_statement.pdf",
    "status": "success",
    "message": "",
    "bank": "hdfc",
    "transactionCount": 35,
    "createdAt": "2026-03-01T12:00:00"
  }
]
```

---

### POST /api/statements/processing-logs/{log_id}/ack

**Purpose:** Mark a processing log as acknowledged so it doesn't show in unread list.

**Response (200):**
```json
{"status": "ok"}
```

---

## Data Model

### Statement

| Column | Type | Constraints |
|--------|------|-------------|
| id | VARCHAR(36) | PK, uuid4 |
| bank | VARCHAR(50) | NOT NULL |
| card_last4 | VARCHAR(4) | |
| period_start | DATE | |
| period_end | DATE | |
| file_hash | VARCHAR(64) | NOT NULL (SHA-256) |
| file_path | VARCHAR(1024) | |
| transaction_count | INTEGER | default 0 |
| total_spend | FLOAT | default 0 |
| total_amount_due | FLOAT | |
| credit_limit | FLOAT | |
| status | VARCHAR(20) | default "success" |
| imported_at | DATETIME | default utcnow |

### Transaction

| Column | Type | Constraints |
|--------|------|-------------|
| id | VARCHAR(36) | PK |
| statement_id | VARCHAR(36) | FK → statements.id ON DELETE CASCADE |
| date | DATE | NOT NULL |
| merchant | VARCHAR(512) | NOT NULL |
| amount | FLOAT | NOT NULL |
| type | VARCHAR(20) | NOT NULL (debit/credit) |
| category | VARCHAR(50) | NOT NULL |
| description | TEXT | |
| card_id | VARCHAR(36) | FK → cards.id |
| bank | VARCHAR(50) | |
| card_last4 | VARCHAR(4) | |
| created_at | DATETIME | |

### ProcessingLog

| Column | Type | Constraints |
|--------|------|-------------|
| id | VARCHAR(36) | PK |
| file_name | VARCHAR(512) | NOT NULL |
| status | VARCHAR(20) | NOT NULL |
| message | TEXT | |
| bank | VARCHAR(50) | |
| transaction_count | INTEGER | default 0 |
| acknowledged | INTEGER | default 0 |
| created_at | DATETIME | |

---

## Implementation Details

### Upload Flow

1. **Validation:** Ensure `file.filename` is non-empty and ends with `.pdf` (case-insensitive).
2. **Filename sanitization:** Use `PurePosixPath(file.filename).name` to avoid path traversal; fallback to `upload.pdf`.
3. **Safe storage:** Save as `{uuid4().hex}_{basename}` in `UPLOADS_DIR` to prevent collisions.
4. **Size check:** Read up to `MAX_UPLOAD_SIZE + 1` bytes (50 MB); reject if exceeded.
5. **Processing:** Call `process_statement(pdf_path, bank, db_session, manual_password=password)`.

### Hash and Deduplication

- SHA-256 computed in 8KB chunks via `hashlib.sha256()`.
- Stored in `Statement.file_hash`.
- Before parsing, query `Statement` by `file_hash`; if found, return `{status: "duplicate"}` immediately.
- No file content is read after hash check for duplicates.

### Bank Detection

- **Order:** User-provided `bank` param → filename patterns → BIN number → PDF text.
- **Filename:** Case-insensitive substring match (e.g., `hdfc`, `icici`, `axis`, `federal`, `indian bank`).
- **BIN:** Regex `(\d{4})[xX*]+\d{2,4}` on filename; map first 4 digits to bank (e.g., 5522→HDFC).
- **PDF text:** Open PDF with pdfplumber; extract first page text; search for bank identifiers.
- **Supported banks:** hdfc, icici, axis, sbi, amex, idfc_first, indusind, kotak, sc, yes, au, rbl, federal, indian_bank.

### PDF Unlock

- **Check:** `is_encrypted(pdf_path)` via `pikepdf.open()` — if `PasswordError` or `pdf.is_encrypted`, treat as encrypted.
- **Manual password:** If provided, try first; on success, use unlocked path.
- **Auto-generated:** `generate_passwords(bank, name, dob_day, dob_month, card_last4s, dob_year)` produces bank-specific candidates:
  - HDFC: `NAME4+DDMM`, `NAME4+last4`, `NAME4+DDMMYY`, etc.
  - ICICI: `name4+ddmm` (lowercase)
  - Axis: `NAME4+DDMM`, `NAME4+DDMMYY`, etc.
  - Federal, Indian Bank: Similar patterns.
  - Generic: `NAME4+DDMM`, `name4+ddmm`, etc.
- **Unlock:** `unlock_pdf(pdf_path, passwords)` tries each password; on success saves `{stem}_unlocked{suffix}` and returns path.
  - *Rationale for Temp File:* We cannot pass a password dynamically to the user's default PDF viewer (e.g. macOS Preview) via the CLI `open` command due to process isolation. To bypass the system password prompt entirely, Burnrate must decrypt the file in memory via `pikepdf` and write it to a temporary unlocked file that the PDF viewer can read directly.
- **Cleanup:** Unlocked temp file deleted after parsing (or via a 5-minute background timer when explicitly opening the file from the UI).

### Card Resolution

- **Early check:** If no cards registered for detected bank, return `card_not_found` before parsing.
- **From parser:** Use `parsed.card_last4` if present.
- **Match:** `Card.filter(bank=bank, last4=card_last4).first()`.
- **Single card:** If parser returns no `card_last4` and exactly one card for bank, use that card.
- **Multiple cards, no parser last4:** Return `card_not_found` with message about multiple cards.

### Categorization

- For each parsed transaction: `category = categorize(pt.merchant, db_session)`.
- **Order:** Custom categories first (`is_prebuilt=0`), then prebuilt (`is_prebuilt=1`).
- **Matching:** Case-insensitive substring match of merchant against comma-separated keywords.
- **Fallback:** `"other"` if no match.

### Parse Error Handling

- If `len(transactions)==0` and `period_start is None` and `period_end is None`:
  - Create `Statement` with `status="parse_error"`; persist `file_hash` to prevent re-import.
  - Return `{status: "parse_error", message: "Could not extract transactions..."}`.

### Processing Queue

- **Shared pool:** `ThreadPoolExecutor(max_workers=10)` for bulk upload and watch folder.
- **Retries:** Up to 3 attempts on SQLite "database is locked" with backoff.
- **Session:** Each worker gets its own DB session via `SessionLocal` or provided factory.

---

## Edge Cases

### Invalid Input

| Scenario | Handling |
|---------|----------|
| Non-PDF file | HTTP 400 "PDF file required" |
| Empty filename | Treated as invalid; 400 |
| File > 50 MB | HTTP 413 "File too large (max 50 MB)" |
| Invalid bank param | Lowercased; used as override; if bank not in supported list, parser may fail |
| Invalid date in params | N/A for upload |

### Duplicate Data

| Scenario | Handling |
|---------|----------|
| Same file uploaded twice | SHA-256 hash match; return `duplicate`; no parse |
| Same content, different filename | Same hash; duplicate |
| Same period, different file (same bank/card) | Treated as separate statement if hash differs |

### Missing Data

| Scenario | Handling |
|----------|----------|
| File not found | `{status: "error", message: "File not found"}` |
| Bank not detected | `{status: "error", message: "Could not detect bank"}` |
| No settings (profile) | Unlock uses only manual password; if encrypted and no manual, tries all supported banks with empty profile |
| No cards registered | `card_not_found` before parse |
| Parser returns no card_last4, multiple cards | `card_not_found` |
| Parser returns no transactions, no period | `parse_error`; statement persisted with status |
| Original PDF missing on reparse | HTTP 400 with detail message |

### Concurrent Access

| Scenario | Handling |
|----------|----------|
| Multiple workers processing same file | Hash check is first; race possible but rare; first to commit wins |
| SQLite lock | Retry up to 3 times with backoff in processing_queue |
| Bulk upload + watch folder | Same queue; max 10 concurrent |

### Large Files/Datasets

| Scenario | Handling |
|----------|----------|
| Large PDF (many pages) | pdfplumber streams; memory may be high for large PDFs |
| Many transactions in one statement | All inserted in single transaction; batch commit |
| Large bulk upload | Files queued; processed 10 at a time |

### Encrypted/Corrupted Files

| Scenario | Handling |
|----------|----------|
| Encrypted, wrong password | Try all candidates; return error "Could not unlock PDF" |
| Corrupted PDF | pdfplumber may raise; caught as exception; `{status: "error", message: "An internal error occurred..."}` |
| Partially readable PDF | Parser may return partial data; no explicit handling |

### External Dependencies

| Scenario | Handling |
|----------|----------|
| pikepdf unavailable | Import error at startup |
| pdfplumber fails to open | Exception caught; returns error |
| Database unavailable | SQLAlchemy raises; returns error |

---

## Error Handling

| Error | HTTP | Response |
|-------|------|----------|
| Non-PDF | 400 | `{"detail": "PDF file required"}` |
| File too large | 413 | `{"detail": "File too large (max 50 MB)"}` |
| No valid PDFs (bulk) | 400 | `{"detail": "No valid PDF files provided"}` |
| Statement not found | 404 | `{"detail": "Statement not found"}` |
| File not found (reparse) | 400 | `{"detail": "Original PDF file not found on disk..."}` |
| Processing error | 200 | `{"status": "error", "message": "..."}` |
| Duplicate | 200 | `{"status": "duplicate", ...}` |
| Card not found | 200 | `{"status": "card_not_found", ...}` |
| Parse error | 200 | `{"status": "parse_error", ...}` |

---

## Security Considerations

- **Path traversal:** Filename sanitized with `PurePosixPath(file.filename).name`; stored with UUID prefix.
- **File size:** Hard limit 50 MB to prevent DoS.
- **Extension:** Only `.pdf` accepted.
- **Storage path:** `UPLOADS_DIR` is under `DATA_DIR`; not user-controlled.
- **Password:** Manual password passed in form; not logged.
- **Sensitive data:** DOB, name used only for password generation; never persisted in logs.

---

## Testing Strategy

### Existing Tests

- **test_api.py:** `TestStatementUpload` — single upload, duplicate, bulk upload
- **test_api.py:** `TestStatementListing` — list statements, field validation
- **test_api.py:** `TestStatementManagement` — reparse, delete cascade, re-upload after delete
- **test_parsers.py:** HDFC, Axis, ICICI parser unit tests with fixtures

### Recommended Additional Tests

- Upload non-PDF → 400
- Upload file > 50 MB → 413
- Upload with invalid bank override
- Encrypted PDF with wrong password
- Encrypted PDF with correct manual password
- Bank detection from filename, BIN, PDF text
- Parse error scenario (malformed PDF)
- Concurrent upload of same file
- Processing log ack and unread filtering

---

## Processing Flow Diagram

```
Upload (single/bulk) or Watch Folder
         │
         ▼
┌─────────────────────┐
│ Save to UPLOADS_DIR │
│ (uuid_basename.pdf) │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Compute SHA-256 hash │
└──────────┬──────────┘
           │
           ▼
    ┌──────┴──────┐
    │ Hash exists? │
    └──────┬──────┘
           │ Yes → Return duplicate
           │ No
           ▼
┌─────────────────────┐
│ Detect bank         │
│ (filename/BIN/text) │
└──────────┬──────────┘
           │
           ▼
    ┌──────┴──────┐
    │ Encrypted?  │
    └──────┬──────┘
           │ Yes → Unlock (manual or generated passwords)
           │ No  → Use original path
           ▼
┌─────────────────────┐
│ Cards registered    │
│ for bank?           │
└──────────┬──────────┘
           │ No → Return card_not_found
           │ Yes
           ▼
┌─────────────────────┐
│ Parse PDF           │
│ (bank parser or     │
│  GenericParser)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Resolve card        │
│ (bank + card_last4) │
└──────────┬──────────┘
           │ No match → Return card_not_found
           │ Match
           ▼
┌─────────────────────┐
│ Parse error?        │
│ (0 txns, no period) │
└──────────┬──────────┘
           │ Yes → Persist Statement(status=parse_error), return parse_error
           │ No
           ▼
┌─────────────────────┐
│ For each txn:      │
│   category =       │
│   categorize()     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Persist Statement   │
│ + Transactions     │
└──────────┬──────────┘
           │
           ▼
    Return success
```

---

## File Storage

- **Location:** `UPLOADS_DIR` = `DATA_DIR/uploads`
- **Naming:** `{uuid4().hex}_{original_basename}.pdf`
- **Persistence:** Files kept for reparse; no automatic cleanup
- **Deduplication:** By content hash, not filename

---

## Performance Considerations

- **Hash:** 8KB chunks; fast for typical statement size
- **Parse:** pdfplumber loads full PDF; memory scales with page count
- **Bulk:** Max 10 concurrent; avoids DB lock contention
- **Retries:** 3 attempts on SQLite lock with 0.5s, 1s, 1.5s backoff
