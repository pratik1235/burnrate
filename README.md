# Burnrate

**Privacy-first, local-only credit card spend analytics.**

Burnrate is a personal finance analytics app that runs entirely in your browser or as a desktop app. Your financial data never leaves your machine — no cloud, no servers, no tracking. All processing and storage (IndexedDB) happen locally.

![Dashboard](assets/screenshot_dashboard.png)

## Features

- **Multi-bank support** — HDFC, ICICI, Axis, Federal Bank, Indian Bank, SBI, Amex, IDFC FIRST, IndusInd, Kotak, Standard Chartered, YES, AU, RBL
- **Browser-Native Processing** — PDF parsing and data extraction happen entirely in JavaScript (no backend server required).
- **Auto-import (Desktop Only)** — Set up a native **Watch Folder** in the Tauri app for automatic processing of new statement PDFs.
- **Gmail Import** — Connect directly to Gmail via the browser to fetch and import statements securely.
- **Smart Categorization** — Transactions are auto-categorized locally with customizable categories and keywords.
- **Rich Analytics** — Spend trends, category breakdowns, merchant insights, and credit utilization.
- **Privacy First** — Data is stored in your browser's **IndexedDB**; nothing is ever uploaded.

## Privacy First

- **Zero Server-side** — No backend, no API calls to our servers.
- **Local Storage** — All data stored locally in your browser/desktop app via IndexedDB.
- **No Tracking** — No telemetry, analytics, or tracking scripts.
- **Offline Ready** — Works completely offline once loaded.

> **Note:** Currently, **HDFC**, **ICICI**, **Axis**, and **Indian Bank** credit cards are officially supported. Support for many more cards is being added. If you'd like to request support for a new card, please [create a GitHub issue](https://github.com/pratik1235/burnrate/issues/new).

## Getting Started

### Web App (Development)

```bash
cd frontend-neopop
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

### Desktop App (Tauri)

To run the native desktop version with **Watch Folder** support:

```bash
# Ensure you have Rust installed
npm run tauri dev
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, styled-components, NeoPOP UI |
| **Storage** | IndexedDB (managed via Dexie.js) |
| **Parsing** | PDF.js (client-side extraction) |
| **Desktop** | Tauri v2 (Rust-based native wrapper) |

## Project Structure

```
burnrate/
├── frontend-neopop/      # Pure React web app
│   ├── src/
│   │   ├── parsers/      # Client-side PDF parsers
│   │   ├── services/     # Business logic & statement processing
│   │   ├── lib/          # DB schema (Dexie) and API wrappers
│   │   ├── components/   # UI components (NeoPOP)
│   │   └── pages/        # Main application views
├── src-tauri/            # Tauri desktop wrapper & native file watcher
├── apps-script/          # Optional Google Apps Script for Gmail
└── assets/               # Screenshots and branding
```

## Contributing

We welcome contributions! Please read the [Contributing Guide](CONTRIBUTING.md) before submitting a pull request.

## License

Apache 2.0 Open Source
