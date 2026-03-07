# Burnrate — Functional and Non-Functional Requirements

> **Version:** 2.0  
> **Last Updated:** March 2026  
> **Status:** Comprehensive requirements document for the browser-native Burnrate project.

---

## 1. Introduction

Burnrate is a **privacy-first, local-only** credit card spend analytics application. All data processing, storage, and analytics occur 100% in the user's browser or within the native desktop wrapper (Tauri). No financial data leaves the user's device.

---

## 2. Functional Requirements

### FR-001: Multi-Bank PDF Parsing

**Description:** The system shall parse credit card statement PDFs from multiple Indian banks entirely in JavaScript, extracting transactions, statement metadata, and card identifiers.

**Supported Banks:** HDFC, ICICI, Axis, Federal Bank, Indian Bank, and others via a generic fallback.

**Acceptance Criteria:**
- [x] FR-001.1: Browser-native parsers correctly extract transactions, period dates, and card identifiers.
- [x] FR-001.2: Generic parser handles banks without dedicated support using common patterns.
- [x] FR-001.3: Bank detection works via PDF content inspection and filename patterns.
- [x] FR-001.4: All parsing happens via PDF.js text extraction without a backend server.

---

### FR-002: Setup Wizard

**Description:** The system shall provide an initial setup wizard for first-time users to configure their profile and register credit cards.

**Acceptance Criteria:**
- [x] FR-002.1: User can enter full name and DOB (used for PDF unlock).
- [x] FR-002.2: User can register cards with bank selection and last 4 digits.
- [x] FR-002.3: Setup data is persisted in IndexedDB.

---

### FR-003: Statement Processing

**Description:** The system shall process PDF statements through a local pipeline: Detect → Unlock → Parse → Categorize → Persist.

**Acceptance Criteria:**
- [x] FR-003.1: Accepts local file uploads or dropped files.
- [x] FR-003.2: Deduplication using file content hash to prevent re-importing the same statement.
- [x] FR-003.3: Processing results are displayed via UI notifications.

---

### FR-004: Auto-Import (Watch Folder - Desktop Only)

**Description:** The native desktop version (Tauri) shall monitor a user-specified directory for new PDF statements and automatically process them.

**Acceptance Criteria:**
- [x] FR-004.1: Watch folder path is configurable via settings in the Tauri app.
- [x] FR-004.2: Uses native OS event monitoring (Rust `notify` crate).
- [x] FR-004.3: Automatically triggers the frontend import pipeline when a new PDF is detected.

---

### FR-005: PDF Unlock

**Description:** The system shall attempt to unlock password-protected PDFs using bank-specific formats derived from user profile data.

**Acceptance Criteria:**
- [x] FR-005.1: Attempts multiple auto-generated password candidates (e.g., NAME+DOB).
- [x] FR-005.2: Allows users to manually provide a password if auto-unlock fails.

---

### FR-006: Transaction Categorization

**Description:** The system shall categorize transactions using local keyword-based matching.

**Acceptance Criteria:**
- [x] FR-006.1: Supports prebuilt and custom categories.
- [x] FR-006.2: Categories have customizable keywords for automatic matching.

---

### FR-007: Analytics & Management

**Description:** The system shall provide spend visualization, filtering, and transaction management.

**Acceptance Criteria:**
- [x] FR-007.1: **Spend Summary** — Net spend calculations and category breakdowns.
- [x] FR-007.2: **Filtering** — Filter by card, date, category, tags, and search terms.
- [x] FR-007.3: **Local Storage** — All data persists in IndexedDB via Dexie.js.

---

## 3. Non-Functional Requirements

### NFR-001: Privacy (CRITICAL)

- [x] NFR-001.1: **Zero Server-side** — No financial data is ever sent to a server.
- [x] NFR-001.2: **No Telemetry** — No usage tracking or analytics scripts.

### NFR-002: Performance

- [x] NFR-002.1: UI remains responsive during PDF parsing and data indexing.
- [x] NFR-002.2: IndexedDB queries are optimized for fast filtering across thousands of transactions.

### NFR-003: Compatibility

- [x] NFR-003.1: Works in modern browsers (Chrome, Firefox, Safari, Edge).
- [x] NFR-003.2: Native desktop bundles for macOS and Windows via Tauri.
