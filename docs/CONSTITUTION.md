# Burnrate Project Constitution

> **Authoritative guidelines and standards for the Burnrate project.**  
> All contributors must adhere to this document. Amendments require team consensus.

---

## 1. Project Philosophy

Burnrate is a **privacy-first, local-only** credit card spend analytics application. The following principles are non-negotiable:

### 1.1 Privacy-First

- **Financial data never leaves the machine.** All processing, storage, and analytics occur locally.
- **No telemetry.** The application does not collect usage statistics, crash reports, or any form of analytics.
- **No external network calls.** The application does not make outbound requests to third-party services, APIs, or cloud infrastructure (except for direct Gmail sync authorized by the user).

### 1.2 Local-Only

- All data resides in the user's browser (IndexedDB) or within the native desktop app shell.
- No cloud sync, no remote backups, no SaaS dependencies.
- Users retain full ownership and control of their financial data.

---

## 2. Code Quality Standards

### 2.1 General Principles

- **Industry best practices** — Follow established patterns for the given technology stack.
- **Type safety** — Leverage static typing (TypeScript) to catch errors at development time.
- **Comprehensive error handling** — Anticipate failure modes; handle errors gracefully and explicitly.

### 2.2 Frontend & Design System (NeoPOP)

**All UI components MUST use the NeoPOP design system** (`@cred/neopop-web`). 
- **Icons:** Use `lucide-react` only.
- **Styling:** `styled-components` with NeoPOP tokens; dark theme as default.

### 2.3 Storage (IndexedDB)

- **Dexie.js** is the mandated library for IndexedDB interactions.
- All database operations must be transactional where consistency is required.

---

## 3. Security Standards

- **No hardcoded secrets** or API keys in source code.
- **Input validation** on all file handling and user inputs.
- **No `dangerouslySetInnerHTML`** — Prohibited.
- **Tauri Security**: Production builds must disable devtools and restrict filesystem access to necessary scopes.

---

## 4. Tech Stack Reference

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite, styled-components, @cred/neopop-web |
| **Storage** | IndexedDB (managed via Dexie.js) |
| **Parsing** | PDF.js (browser-native extraction) |
| **Desktop** | Tauri v2 (native wrap with Rust) |
| **Watcher** | Rust `notify` crate (Tauri side) |

---

*Last updated: March 2026*
