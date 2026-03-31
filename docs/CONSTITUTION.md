# Burnrate Project Constitution

> **Authoritative guidelines and standards for the Burnrate project.**  
> All contributors must adhere to this document. Amendments require team consensus.

---

## 1. Project Philosophy

Burnrate is a **privacy-first, local-first** credit card and bank statement analytics application. The following principles are non-negotiable:

### 1.1 Privacy-First

- **Financial data never leaves the machine** for core spend analytics. Processing, storage, and analytics for transactions and statements occur locally unless a **documented, feature-scoped** integration explicitly requires otherwise (and only for that feature’s purpose).
- **No telemetry.** The application does not collect usage statistics, crash reports, or any form of analytics.
- **Feature-scoped network access is allowed** where the product intentionally integrates with online services. Examples include **milestones**, **offers and benefits fetching**, **Gmail (or similar email) integration**, and comparable features that users opt into or clearly expect to use the network. Such features must be called out in specs/plans, minimize data sent, and must not weaken the local-first guarantee for unrelated core financial flows.

### 1.2 Local-Only

- Core financial data resides on the user's device or within their controlled infrastructure.
- No cloud sync, remote backups, or SaaS dependencies **for core spend/statement analytics**; **documented network features** (§1.1, §8.1) may use external services only as specified for those features.
- Users retain full ownership and control of their financial data.

### 1.3 Trust Through Transparency

- Open source with clear, auditable code paths for data handling.
- No obfuscation of data flows or processing logic.

---

## 2. Code Quality Standards

### 2.1 General Principles

- **Industry best practices** — Follow established patterns for the given technology stack.
- **Type safety** — Leverage static typing (TypeScript, Python type hints) to catch errors at development time.
- **Comprehensive error handling** — Anticipate failure modes; handle errors gracefully and explicitly.
- **Security-first development** — Security considerations are integrated into design, not bolted on afterward.

### 2.2 Code Organization

- Clear separation of concerns (routing, services, models).
- Single responsibility principle for modules and functions.
- Meaningful naming; avoid abbreviations unless widely understood.

### 2.3 Documentation

- Public APIs must have docstrings/TSDoc comments.
- Complex logic must include explanatory comments.
- Architecture decisions are documented (see §7).

---

## 3. Frontend Guidelines

### 3.1 Design System — NeoPOP (Mandatory)

**All UI components MUST use the NeoPOP design system** (`@cred/neopop-web`). Custom UI primitives that duplicate NeoPOP functionality are prohibited.

#### Required Components

Use these NeoPOP components for all UI:

| Component | Usage |
|-----------|--------|
| `Typography` | All text rendering |
| `Button` | All buttons and CTAs |
| `ElevatedCard` | Cards, panels, containers |
| `Tag` | Labels, badges, chips |
| `InputField` | Form inputs |
| `Row` | Horizontal layouts |
| `Column` | Vertical layouts |

#### Colors and Typography

- **Colors:** Import `mainColors` and `colorPalette` from `@cred/neopop-web/lib/primitives`
- **Typography:** Use `FontType` and `FontWeights` from `@cred/neopop-web/lib/components/Typography/types`

#### Icons

- Use **lucide-react** for all icons. Do not introduce other icon libraries.

### 3.2 Styling

- **styled-components** for custom styling
- Dark theme with black backgrounds as the default aesthetic
- Extend NeoPOP tokens rather than hardcoding colors

### 3.3 React Patterns

- **useEffect cleanup:** All `useEffect` hooks that set up subscriptions, listeners, or async work **must** return cleanup functions.
- **Async cancellation:** Use cancelled flags or `AbortController` for async operations to prevent state updates after unmount.
- **No `dangerouslySetInnerHTML`** — Prohibited. Use safe rendering patterns only.

### 3.4 Performance

- Avoid unnecessary re-renders.
- Use `useCallback` for callbacks passed to child components.
- Use `useMemo` for expensive computations and derived state.

---

## 4. Backend Guidelines

### 4.1 Framework

- **FastAPI** with proper dependency injection via `Depends()`
- Use Pydantic models for request/response validation
- Document endpoints with OpenAPI (automatic via FastAPI)

### 4.2 Database

- **SQLAlchemy 2.x** ORM
- **Parameterized queries only** — Never concatenate user input or variables into raw SQL strings. Use SQLAlchemy's parameter binding.
- **SQLite** with WAL mode for concurrent reads

### 4.3 File Operations

- **Path validation:** All file operations must validate that paths stay within intended directories. Prevent path traversal (`../`, symlinks).
- **Upload filenames:** Must be sanitized — strip path components (e.g., `os.path.basename()`); reject or sanitize dangerous characters.

### 4.4 Error Handling

- **Client-facing errors:** Must be generic. Never expose internal details, file paths, stack traces, or implementation specifics.
- **Logging:** Log errors server-side with full context; return sanitized messages to clients.

### 4.5 Resource Management

- Use **context managers** for file handles and database connections.
- Ensure resources are released even when exceptions occur.

### 4.6 Logging

- Use the Python `logging` module.
- **Never log** passwords, API keys, PII, or sensitive financial data.
- Use appropriate log levels (DEBUG, INFO, WARNING, ERROR).

---

## 5. Security Standards

### 5.1 Secrets and Credentials

- **No hardcoded secrets**, API keys, or credentials in source code.
- Use environment variables or secure configuration for any required secrets (e.g., development-only).

### 5.2 Input Validation

- Validate and sanitize all inputs on every endpoint.
- Reject malformed or unexpected input early.

### 5.3 Path Traversal Prevention

- All file operations must prevent path traversal.
- Validate resolved paths against allowed base directories.

### 5.4 Search and Query Safety

- **LIKE wildcard escaping:** Escape `%` and `_` in user-provided search queries to prevent unintended pattern matching.

### 5.5 File Uploads

- Enforce **file upload size limits** on all upload endpoints.
- Validate file types where applicable.

### 5.6 Network Binding

- **Bind to `127.0.0.1` by default** for non-Docker deployments. Do not bind to `0.0.0.0` unless explicitly required (e.g., Docker).

### 5.7 HTTP Security Headers

- Apply security headers on all HTTP responses (e.g., `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy` where applicable).

### 5.8 Docker

- Containers must **run as non-root** user.
- Use minimal base images; avoid unnecessary privileges.

### 5.9 Tauri

- **No devtools** in production builds.
- Follow Tauri security best practices for IPC and permissions.

---

## 6. Testing Standards

### 6.1 Coverage Requirements

- **All new features must include integration tests.**
- Critical paths (auth, data processing, file handling) must have test coverage.

### 6.2 Test Isolation

- Tests use **isolated temporary databases**. No shared state between tests.
- Use fixtures (e.g., pytest fixtures) for setup and teardown.

### 6.3 Resource Handling in Tests

- File handles in tests must use `try/finally` or context managers to ensure cleanup.
- HTTP responses in tests must be **properly closed** (e.g., use context managers or explicit `.close()`).

### 6.4 Test Quality

- Tests should be deterministic and fast.
- Avoid flaky tests; mock external dependencies where appropriate.

---

## 7. Spec-Driven Development

### 7.1 Planning Before Implementation

- **All features must have a spec/plan document before implementation.**
- Specs are stored in the repository (e.g., `docs/specs/` or similar).
- Any major changes in existing feature must either update th existing plans or create a new one.

### 7.2 Spec Contents

Plans must include:

- **Edge cases** — Error conditions, boundary values, failure modes
- **API contracts** — Request/response shapes, status codes, error formats
- **Data models** — Schema changes, migrations, relationships

### 7.3 Architecture Decisions

- Significant architecture decisions are documented (e.g., ADRs — Architecture Decision Records).
- Rationale and alternatives considered should be captured.

---

## 8. Code Constraints

### 8.1 Network

- **Default: local-first.** Core transaction and statement handling must not depend on the internet; privacy guarantees for that data remain as in §1.
- **Exceptions:** Outbound requests are permitted only for **explicit, documented features** that require online services—e.g. **milestones**, **offers/benefits fetching**, **Gmail (or email) integration**, and similar integrations. Implementations must stay within the scope of each feature’s spec, avoid telemetry, and must not exfiltrate bulk financial datasets except where the feature’s contract requires it and the user understands that flow.

### 8.2 Database

- **SQLite only.** No remote databases (PostgreSQL, MySQL, etc.). Local-first by design.

### 8.3 PDF Processing

- Must **handle encrypted PDFs gracefully**. Do not crash; inform the user or attempt decryption with user-provided credentials where supported.
- Use `pdfplumber` and `pikepdf` (qpdf) for parsing.

### 8.4 Bank Parsers

- **All bank parsers must extend the base parser interface.**
- Consistent structure for adding new bank support.

### 8.5 Category Slugs

- **Category slugs must be stable.** They are used as keys in the database and API.
- Do not rename slugs without migration logic; they may be referenced externally.

### 8.6 Currency and analytics

- **No outbound FX or exchange-rate APIs** in the default build. Combined totals across currencies require **user-maintained local rates** (future); until then the product must not silently merge unlike ISO 4217 codes.
- **Per-row truth:** `transactions.currency` (and optional `statements.currency`) store the statement-native code (default INR for legacy rows).
- **Analytics contract:** When filters span **more than one** currency, list endpoints return **per-currency splits** (`totalSpendByCurrency`, `totalsByCurrency`, `byCurrency`, etc.) and omit a single combined scalar where it would be misleading. Single-currency views keep backward-compatible numeric totals.
- **Settings `display_currency`:** Optional UI preference only (e.g. ordering or copy); it does **not** convert stored amounts.

---

## 9. Performance

### 9.1 Backend

- **Statement processing:** Use a thread pool with a maximum of **10 concurrent** workers.
- **SQLite WAL mode** for concurrent reads and better write performance.

### 9.2 Frontend

- Avoid unnecessary re-renders.
- Use `useCallback` and `useMemo` where appropriate.
- Lazy-load heavy components where feasible.

---

## 10. Tech Stack Reference

| Layer | Technology |
|-------|------------|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.x, SQLite (WAL), Uvicorn |
| Frontend | React 18, TypeScript, Vite 6, styled-components, @cred/neopop-web, lucide-react, recharts |
| Desktop | Tauri v2 (macOS DMG, Windows via PyInstaller + Inno Setup) |
| PDF Parsing | pdfplumber, pikepdf (qpdf) |
| Testing | pytest, Playwright |
| CI/CD | GitHub Actions (Docker, Tauri, PyInstaller) |
| Deployment | Docker, Homebrew packaging |

---

## Appendix: Amendment Process

1. Propose changes via pull request to this document.
2. Document rationale and impact.
3. Obtain team consensus before merging.
4. Update version/date if maintaining change history.

---

*Last updated: March 2026*
