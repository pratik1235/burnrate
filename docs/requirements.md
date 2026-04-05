# Burnrate — Functional and Non-Functional Requirements

> **Version:** 1.0  
> **Last Updated:** March 2025  
> **Status:** Comprehensive requirements document for the Burnrate project.

---

## 1. Introduction

Burnrate is a **privacy-first, local-only** credit card spend analytics application. All data processing, storage, and analytics occur on the user's device. No financial data, telemetry, or analytics are transmitted to external services.

This document defines the functional requirements (FR) and non-functional requirements (NFR) for the Burnrate project, with acceptance criteria for each requirement.

---

## 2. Functional Requirements

### FR-001: Multi-Bank PDF Parsing

**Description:** The system shall parse credit card statement PDFs from multiple Indian banks, extracting transactions, statement metadata, and card identifiers.

**Supported Banks:**

| Bank | Parser Type | Notes |
|------|-------------|-------|
| HDFC | Dedicated | Full format support |
| ICICI | Dedicated | Full format support |
| Axis | Dedicated | Full format support |
| Federal Bank | Dedicated | Full format support |
| Indian Bank | Dedicated | OneCard statements |
| SBI, Amex, IDFC FIRST, IndusInd, Kotak, Standard Chartered, YES, AU, RBL | Generic | Fallback parser |

**Acceptance Criteria:**

- [ ] FR-001.1: Dedicated parsers correctly extract transactions, period dates, credit limit, total amount due, and card last4 for HDFC, ICICI, Axis, Federal Bank, and Indian Bank.
- [ ] FR-001.2: Generic parser handles banks without dedicated parsers using common Indian bank statement patterns.
- [ ] FR-001.3: Bank detection works via filename patterns and PDF content inspection.
- [ ] FR-001.4: All parsers extend a common base parser interface for consistent structure.
- [ ] FR-001.5: Parsed output includes: date, merchant, amount, type (debit/credit), description, bank, card_last4.

---

### FR-002: Setup Wizard

**Description:** The system shall provide an initial setup wizard for first-time users to configure profile and register credit cards.

**Acceptance Criteria:**

- [ ] FR-002.1: User can enter full name (used for PDF password generation).
- [ ] FR-002.2: User can enter date of birth as separate day, month, and year fields.
- [ ] FR-002.3: User can register one or more credit cards with bank selection and last 4 digits.
- [ ] FR-002.4: Bank + last4 combination must be unique across cards.
- [ ] FR-002.5: Setup data is persisted and used for PDF unlock and statement-card matching.
- [ ] FR-002.6: Setup wizard is shown only when profile or cards are not configured.

---

### FR-003: Statement Upload

**Description:** The system shall accept PDF statement uploads (single and bulk) and process them through unlock, parse, categorize, and persist pipeline.

**Acceptance Criteria:**

- [ ] FR-003.1: Single file upload via `POST /api/statements/upload` accepts `.pdf` files only.
- [ ] FR-003.2: Bulk upload via `POST /api/statements/upload-bulk` accepts multiple PDFs.
- [ ] FR-003.3: Uploaded files are saved to a designated uploads directory with sanitized filenames.
- [ ] FR-003.4: Processing pipeline executes in order: unlock → parse → categorize → persist.
- [ ] FR-003.5: Optional `bank` and `password` parameters may be provided to assist unlock.
- [ ] FR-003.6: Invalid or non-PDF files are rejected with appropriate error messages.
- [ ] FR-003.7: Processing results are recorded in ProcessingLog for user visibility.

---

### FR-004: Auto-Import (Watch Folder)

**Description:** The system shall monitor a user-specified directory for new PDF statements and automatically queue them for processing.

**Acceptance Criteria:**

- [ ] FR-004.1: Watch folder path is configurable via settings.
- [ ] FR-004.2: Uses watchdog to monitor the directory for new and modified files.
- [ ] FR-004.3: Initial scan of watch folder runs on application startup.
- [ ] FR-004.4: Files must stabilize (size stops changing) before processing to avoid partial reads.
- [ ] FR-004.5: Only `.pdf` files are queued for processing.
- [ ] FR-004.6: Watcher starts automatically when watch folder is configured and app starts.
- [ ] FR-004.7: Watcher stops gracefully on application shutdown.

---

### FR-005: PDF Unlock

**Description:** The system shall unlock password-protected PDF statements using bank-specific password formats derived from user profile and card data.

**Acceptance Criteria:**

- [ ] FR-005.1: Uses pikepdf (qpdf) for PDF decryption.
- [ ] FR-005.2: Manual password is tried first when provided by user.
- [ ] FR-005.3: Auto-generated candidates follow bank-specific formats (e.g., NAME4+DDMM for HDFC, DDMM+NAME4 for ICICI).
- [ ] FR-005.4: Password generation uses: name, DOB (day/month/year), card last4 where applicable.
- [ ] FR-005.5: For unknown bank, tries all supported banks' password formats until one succeeds.
- [ ] FR-005.6: Unlock failures are reported with actionable messages (e.g., "Could not unlock PDF - tried all bank password formats").
- [ ] FR-005.7: Unencrypted PDFs are processed without unlock attempt.

---

### FR-006: Transaction Categorization

**Description:** The system shall categorize transactions using keyword-based matching against category definitions.

**Acceptance Criteria:**

- [ ] FR-006.1: Ten prebuilt categories: Food, Shopping, Travel, Bills, Entertainment, Fuel, Health, Groceries, CC Payment, Other.
- [ ] FR-006.2: Up to 20 custom categories may be defined by the user.
- [ ] FR-006.3: Matching is keyword-based against merchant/description text (case-insensitive).
- [ ] FR-006.4: CC Payment (slug: `cc_payment`) transactions are excluded from spend calculations.
- [ ] FR-006.5: Unmatched transactions default to "Other".
- [ ] FR-006.6: Recategorization endpoint allows bulk re-run of categorization logic.
- [ ] FR-006.7: Categories have: name, slug, keywords, color, icon, is_prebuilt.

---

### FR-007: Analytics

**Description:** The system shall provide spend analytics including summary, category breakdown, trends, top merchants, and statement periods.

**Acceptance Criteria:**

- [ ] FR-007.1: **Summary** — Total spend, credit limit, card breakdown; net spend = sum(debits) - sum(credits) excluding cc_payment.
- [ ] FR-007.2: **Category breakdown** — Spend by category with amounts and percentages.
- [ ] FR-007.3: **Monthly trends** — Spend over time (e.g., by month).
- [ ] FR-007.4: **Top merchants** — Highest-spend merchants within filtered scope.
- [ ] FR-007.5: **Statement periods** — List of statement billing periods with metadata.
- [ ] FR-007.6: All analytics endpoints support filters: cards, date range, categories, tags, direction, amount range.
- [ ] FR-007.7: Endpoints: `GET /api/analytics/summary`, `GET /api/analytics/categories`, `GET /api/analytics/trends`, `GET /api/analytics/merchants`, `GET /api/analytics/statement-periods`.

---

### FR-008: Transaction Management

**Description:** The system shall provide listing, filtering, pagination, and export of transactions.

**Acceptance Criteria:**

- [ ] FR-008.1: List transactions via `GET /api/transactions` with filters: card, date range, category, search (merchant/description), tags, direction, amount range.
- [ ] FR-008.2: Pagination via `limit` and `offset` parameters; max 500 per page.
- [ ] FR-008.3: CSV export of filtered transactions.
- [ ] FR-008.4: Net spend calculation excludes cc_payment category.
- [ ] FR-008.5: Search uses LIKE with proper wildcard escaping for safety.
- [ ] FR-008.6: Response includes transaction metadata: id, date, merchant, amount, type, category, bank, card_last4, statement_id.

---

### FR-009: Transaction Tagging

**Description:** The system shall allow users to define tags and apply up to 3 tags per transaction.

**Acceptance Criteria:**

- [ ] FR-009.1: Up to 20 tag definitions; each tag name max 12 characters.
- [ ] FR-009.2: Maximum 3 tags per transaction.
- [ ] FR-009.3: Tags are user-defined via `POST /api/tags`, `GET /api/tags`, `DELETE /api/tags/{id}`.
- [ ] FR-009.4: Transaction tags managed via `GET /api/transactions/{id}/tags`, `PUT /api/transactions/{id}/tags`.
- [ ] FR-009.5: Tags can be used as filters in transaction list and analytics.

---

### FR-010: Card Management

**Description:** The system shall support CRUD operations for credit cards (bank + last4).

**Acceptance Criteria:**

- [ ] FR-010.1: List cards via `GET /api/cards`.
- [ ] FR-010.2: Create card via `POST /api/cards` with bank and last4.
- [ ] FR-010.3: Delete card via `DELETE /api/cards/{id}`.
- [ ] FR-010.4: Bank + last4 must be unique.
- [ ] FR-010.5: Cards are linked to statements and transactions; deletion may require handling of orphaned data per product rules.
- [ ] FR-010.6: Response includes: id, bank, last4.

---

### FR-011: Statement Management

**Description:** The system shall allow users to list, reparse, and delete statements.

**Acceptance Criteria:**

- [ ] FR-011.1: List statements via `GET /api/statements` with relevant filters.
- [ ] FR-011.2: Reparse single statement via `POST /api/statements/{id}/reparse`.
- [ ] FR-011.3: Reparse all statements via `POST /api/statements/reparse-all`.
- [ ] FR-011.4: Delete statement via `DELETE /api/statements/{id}`; cascades to associated transactions.
- [ ] FR-011.5: Processing logs available via `GET /api/statements/processing-logs`; acknowledge via `POST /api/statements/processing-logs/{id}/ack`.
- [ ] FR-011.6: Statement metadata includes: bank, card_last4, period_start, period_end, file_hash, transaction_count, total_spend, credit_limit, status, imported_at.

---

### FR-012: Settings

**Description:** The system shall provide settings for user profile, watch folder, and folder browser.

**Acceptance Criteria:**

- [ ] FR-012.1: Get settings via `GET /api/settings`.
- [ ] FR-012.2: Initial setup via `POST /api/settings/setup` (name, DOB, cards).
- [ ] FR-012.3: Update settings via `PUT /api/settings` (name, DOB, watch_folder).
- [ ] FR-012.4: Folder browser via `GET /api/settings/browse-folder` returns native OS dialog path (osascript on macOS, zenity on Linux, etc.).
- [ ] FR-012.5: Settings include: id, name, dob_day, dob_month, dob_year, watch_folder.

---

### FR-013: Statement delivery automation (Optional)

**Description:** Users may automate statement ingestion via **user-deployed** Google Apps Script ([`apps-script/`](../apps-script/)) and/or via **opt-in in-app Gmail OAuth** (read-only scope; see [docs/plans/gmail-autosync.md](plans/gmail-autosync.md)). Both paths are optional; core analytics remain local-first.

**Acceptance Criteria:**

- [ ] FR-013.1: Script is deployable separately from main application.
- [ ] FR-013.2: Script identifies statement emails by bank-specific patterns.
- [ ] FR-013.3: Downloaded PDFs are saved to a user-configurable location (e.g., watch folder).
- [ ] FR-013.4: Integration is optional; default install has no dependency on Gmail until the user connects an account or deploys Apps Script.
- [ ] FR-013.5: Documentation exists for deployment and configuration.
- [ ] FR-013.6: In-app Gmail uses OAuth 2.0 with PKCE; tokens are stored encrypted in SQLite (`oauth_credentials`).
- [ ] FR-013.7: Attachments are written to the configured watch folder or default uploads and processed via the existing statement queue.
- [ ] FR-013.8: API surface includes status, connect, disconnect, and manual sync (`/api/gmail/*`).

---

### FR-014: Desktop App

**Description:** The system shall provide a native desktop application wrapper that spawns the backend and serves the frontend.

**Acceptance Criteria:**

- [ ] FR-014.1: Tauri v2 wrapper provides native window, menu, and system integration.
- [ ] FR-014.2: Python backend is built via PyInstaller and bundled as sidecar.
- [ ] FR-014.3: Backend spawns automatically when desktop app launches.
- [ ] FR-014.4: Frontend is served from backend or embedded in Tauri webview.
- [ ] FR-014.5: App closes backend process on exit.
- [ ] FR-014.6: Distribution formats: macOS DMG (ARM), Windows installer (Inno Setup).

---

## 3. Data Model

The following entities support the functional requirements. Schema details are authoritative in the codebase; this section provides a reference.

| Entity | Key Fields |
|--------|------------|
| **Settings** | id, name, dob_day, dob_month, dob_year, watch_folder, last_gmail_sync |
| **Card** | id, bank, last4 |
| **Statement** | id, bank, card_last4, period_start, period_end, file_hash, file_path, transaction_count, total_spend, total_amount_due, credit_limit, status, imported_at |
| **Transaction** | id, statement_id, date, merchant, amount, type, category, description, bank, card_last4, card_id |
| **TransactionTag** | id, transaction_id, tag |
| **CategoryDefinition** | id, name, slug, keywords, color, icon, is_prebuilt |
| **TagDefinition** | id, name |
| **ProcessingLog** | id, file_name, status, message, bank, transaction_count, acknowledged, created_at |

---

## 4. API Endpoints Reference

| Domain | Method | Endpoint |
|--------|--------|----------|
| Settings | GET | `/api/settings` |
| Settings | POST | `/api/settings/setup` |
| Settings | PUT | `/api/settings` |
| Settings | GET | `/api/settings/browse-folder` |
| Cards | GET | `/api/cards` |
| Cards | POST | `/api/cards` |
| Cards | DELETE | `/api/cards/{id}` |
| Statements | POST | `/api/statements/upload` |
| Statements | POST | `/api/statements/upload-bulk` |
| Statements | GET | `/api/statements` |
| Statements | DELETE | `/api/statements/{id}` |
| Statements | POST | `/api/statements/{id}/reparse` |
| Statements | POST | `/api/statements/reparse-all` |
| Statements | GET | `/api/statements/processing-logs` |
| Statements | POST | `/api/statements/processing-logs/{id}/ack` |
| Transactions | GET | `/api/transactions` |
| Transactions | GET | `/api/transactions/{id}/tags` |
| Transactions | PUT | `/api/transactions/{id}/tags` |
| Analytics | GET | `/api/analytics/summary` |
| Analytics | GET | `/api/analytics/categories` |
| Analytics | GET | `/api/analytics/trends` |
| Analytics | GET | `/api/analytics/merchants` |
| Analytics | GET | `/api/analytics/statement-periods` |
| Categories | GET | `/api/categories/all` |
| Categories | POST | `/api/categories/custom` |
| Categories | PUT | `/api/categories/{id}` |
| Categories | DELETE | `/api/categories/custom/{id}` |
| Categories | POST | `/api/categories/recategorize` |
| Tags | GET | `/api/tags` |
| Tags | POST | `/api/tags` |
| Tags | DELETE | `/api/tags/{id}` |
| Gmail | GET | `/api/gmail/status` |
| Gmail | POST | `/api/gmail/auth/start` |
| Gmail | GET | `/api/gmail/oauth/callback` |
| Gmail | POST | `/api/gmail/disconnect` |
| Gmail | POST | `/api/gmail/sync` |

---

## 5. Non-Functional Requirements

### NFR-001: Privacy

**Description:** The application shall operate in a privacy-first manner with all data remaining local.

**Acceptance Criteria:**

- [ ] NFR-001.1: No financial data, PII, or transaction details are transmitted to external services.
- [ ] NFR-001.2: No telemetry, analytics, crash reporting, or usage tracking.
- [ ] NFR-001.3: No outbound network requests for core analytics; optional, user-authorized flows (in-app Gmail OAuth read-only, user-deployed Apps Script) are documented and scoped ([CONSTITUTION.md](CONSTITUTION.md) §1.1, §8.1).
- [ ] NFR-001.4: All processing, storage, and analytics occur on the user's device or within their controlled infrastructure.
- [ ] NFR-001.5: Data ownership and control remain entirely with the user.

---

### NFR-002: Performance

**Description:** The application shall meet performance targets for concurrent processing and database operations.

**Acceptance Criteria:**

- [ ] NFR-002.1: Statement processing uses a thread pool with maximum 10 concurrent workers.
- [ ] NFR-002.2: SQLite operates in WAL (Write-Ahead Logging) mode for concurrent reads and improved write performance.
- [ ] NFR-002.3: Bulk upload and reparse operations process statements concurrently where applicable.
- [ ] NFR-002.4: Analytics and transaction list queries complete within acceptable latency (e.g., &lt; 2s for typical datasets).
- [ ] NFR-002.5: Frontend avoids unnecessary re-renders; uses useCallback and useMemo where appropriate.

---

### NFR-003: Security

**Description:** The application shall implement security controls for input validation, file handling, and HTTP responses.

**Acceptance Criteria:**

- [ ] NFR-003.1: Path traversal prevention — all file operations validate paths stay within intended directories; reject `../`, symlinks to external paths.
- [ ] NFR-003.2: Input sanitization — all user inputs validated and sanitized; parameterized queries only (no string concatenation in SQL).
- [ ] NFR-003.3: Upload size limits enforced on all upload endpoints.
- [ ] NFR-003.4: Security headers applied: `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy` where applicable.
- [ ] NFR-003.5: LIKE wildcard escaping for user-provided search queries (`%`, `_`).
- [ ] NFR-003.6: Upload filenames sanitized (e.g., `os.path.basename()`); reject or sanitize dangerous characters.
- [ ] NFR-003.7: Bind to `127.0.0.1` by default for non-Docker deployments.
- [ ] NFR-003.8: Client-facing errors are generic; never expose internal paths, stack traces, or implementation details.
- [ ] NFR-003.9: No hardcoded secrets, API keys, or credentials in source code.
- [ ] NFR-003.10: Docker containers run as non-root user.

---

### NFR-004: Deployment

**Description:** The application shall be distributable via multiple deployment methods.

**Acceptance Criteria:**

- [ ] NFR-004.1: **Docker** — Container image available; runs with volume mount for data persistence.
- [ ] NFR-004.2: **Homebrew** — macOS formula for `brew install burnrate`.
- [ ] NFR-004.3: **macOS DMG** — Native app bundle for ARM (Apple Silicon).
- [ ] NFR-004.4: **Windows installer** — Inno Setup or equivalent for Windows.
- [ ] NFR-004.5: **From source** — Clear instructions for running backend (uvicorn) and frontend (Vite dev server) locally.
- [ ] NFR-004.6: Documentation exists for each deployment method.

---

### NFR-005: Compatibility

**Description:** The application shall support specified operating systems and architectures.

**Acceptance Criteria:**

- [ ] NFR-005.1: **macOS** — ARM64 (Apple Silicon) supported for native app; x86_64 for Docker/Homebrew where applicable.
- [ ] NFR-005.2: **Windows** — Supported via native installer and Docker.
- [ ] NFR-005.3: **Linux** — Supported via Docker; native packaging optional.
- [ ] NFR-005.4: Python 3.11+ for backend.
- [ ] NFR-005.5: Modern browsers for web UI (Chrome, Firefox, Safari, Edge).

---

### NFR-006: Data Integrity

**Description:** The application shall ensure data consistency and prevent duplicates.

**Acceptance Criteria:**

- [ ] NFR-006.1: SHA-256 file hash used for statement deduplication; duplicate files not re-imported.
- [ ] NFR-006.2: Database operations use transactions; atomic commits for multi-step operations.
- [ ] NFR-006.3: Category slugs are stable; not renamed without migration logic.
- [ ] NFR-006.4: Unique constraints enforced (e.g., card bank+last4, statement file_hash where applicable).
- [ ] NFR-006.5: Resource cleanup (file handles, DB connections) via context managers; no leaks on exceptions.

---

### NFR-007: Code Quality

**Description:** The codebase shall adhere to project standards defined in CONSTITUTION.md.

**Acceptance Criteria:**

- [ ] NFR-007.1: Type safety — TypeScript for frontend, Python type hints for backend.
- [ ] NFR-007.2: Frontend uses NeoPOP design system (`@cred/neopop-web`); lucide-react for icons.
- [ ] NFR-007.3: Backend uses FastAPI, Pydantic, SQLAlchemy 2.x.
- [ ] NFR-007.4: All new features include integration tests; critical paths have test coverage.
- [ ] NFR-007.5: Tests use isolated temporary databases; no shared state.
- [ ] NFR-007.6: No `dangerouslySetInnerHTML`; useEffect cleanup for subscriptions/async work.
- [ ] NFR-007.7: Public APIs have docstrings/TSDoc; complex logic has explanatory comments.

---

## 6. Traceability

| Requirement | Primary Implementation |
|-------------|------------------------|
| FR-001 | `backend/parsers/` |
| FR-002 | `backend/routers/settings.py` (setup), frontend setup wizard |
| FR-003 | `backend/routers/statements.py`, `backend/services/statement_processor.py` |
| FR-004 | `backend/services/folder_watcher.py` |
| FR-005 | `backend/services/pdf_unlock.py` |
| FR-006 | `backend/services/statement_processor.py`, `backend/routers/categories.py` |
| FR-007 | `backend/routers/analytics.py`, `backend/services/analytics.py` |
| FR-008 | `backend/routers/transactions.py` |
| FR-009 | `backend/routers/tags.py`, TransactionTag model |
| FR-010 | `backend/routers/cards.py` |
| FR-011 | `backend/routers/statements.py` |
| FR-012 | `backend/routers/settings.py` |
| FR-013 | `apps-script/`, `docs/plans/gmail-autosync.md`, `/api/gmail/*` |
| FR-014 | `src-tauri/` |
| NFR-001 | CONSTITUTION.md, scoped network for documented opt-in features |
| NFR-002 | `backend/services/statement_processor.py`, `backend/models/database.py` |
| NFR-003 | `backend/main.py`, routers, config |
| NFR-004 | `Dockerfile`, `scripts/`, `docs/` |
| NFR-005 | CI/CD, Tauri config |
| NFR-006 | Models, `statement_processor.py` |
| NFR-007 | CONSTITUTION.md, codebase |

---

## 7. Amendment Process

1. Propose changes via pull request to this document.
2. Document rationale and impact on existing requirements.
3. Obtain team consensus before merging.
4. Update version and date in the header.

---

*This document should be read in conjunction with [CONSTITUTION.md](./CONSTITUTION.md) for project philosophy and coding standards.*
