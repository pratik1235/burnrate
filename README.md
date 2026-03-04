# Burnrate

**Privacy-first, local-only credit card spend analytics.**

Burnrate is a personal finance analytics app that runs entirely on your laptop. Your financial data never leaves your machine — no cloud, no servers, no tracking.

https://github.com/user-attachments/assets/burnrate-demo.mp4

<video src="assets/burnrate-demo.mp4" width="100%" autoplay loop muted></video>

## Features

- **Multi-bank support** — HDFC, ICICI, Axis, Federal Bank, Indian Bank, SBI, Amex, IDFC FIRST, IndusInd, Kotak, Standard Chartered, YES, AU, RBL
- **Auto-import** — Drop PDF statements or set up a watch folder for automatic processing
- **Smart categorization** — Transactions auto-categorized with customizable categories and keywords
- **Rich analytics** — Spend trends, category breakdowns, merchant insights, credit utilization
- **Multi-card filtering across transactions and metrics** — Filter by cards, categories, date range, amount, direction, and tags
- **Multiple Views** — Analyze transactions per statement, consolidate across multiple cards, or apply flexible filters for any custom combination
- **Transaction tagging** — Define and apply custom tags to transactions
- **CSV export** — Export filtered transactions for external analysis
- **Statement management** — Reparse or remove imported statements
- **Google Apps Script** — Auto-download statements from Gmail (optional)

> **Note:** Currently, only **HDFC**, **ICICI**, **Axis**, and **Indian Bank** credit cards are officially supported and tested. Other bank cards *may* work, but stability is not guaranteed at this time.  
Support for many more cards is coming soon!  
If you'd like to specifically request support for a new card, please [create a GitHub issue](https://github.com/pratik1235/burnrate/issues/new?title=Card%20support%20request:%20%3CYour%20Bank%3E&labels=enhancement).

## Privacy First

- All data stored locally in SQLite
- No network requests to external services
- No telemetry, analytics, or tracking
- Your statements and transactions stay on your machine

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11+, FastAPI, SQLAlchemy, SQLite |
| Frontend | React 18, TypeScript, Vite, styled-components |

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend-neopop
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### First Run

1. Complete the setup wizard (name, DOB, cards)
2. Set a watch folder or drag-and-drop statement PDFs
3. Explore your spend analytics

## Screenshots

| Dashboard | Transactions |
|-----------|-------------|
| ![](assets/screenshot_dashboard.png) | ![](assets/screenshot_transactions.png) |

| Analytics | Cards |
|-----------|-------|
| ![](assets/screenshot_analytics.png) | ![](assets/screenshot_cards.png) |

| Customize | Categories |
|-----------|-----------|
| ![](assets/screenshot_customize.png) | ![](assets/screenshot_categories_modal.png) |

| Setup |
|-------|
| ![](assets/screenshot_setup.png) |

## Project Structure

```
burnrate/
├── backend/              # FastAPI backend
│   ├── main.py           # App entry point
│   ├── models/           # SQLAlchemy models
│   ├── routers/          # API endpoints
│   ├── services/         # Business logic
│   ├── parsers/          # Bank-specific PDF parsers
│   └── data/             # SQLite DB & uploads
├── frontend-neopop/      # React frontend
│   ├── src/
│   │   ├── pages/        # Page components
│   │   ├── components/   # Shared components
│   │   ├── contexts/     # React contexts
│   │   ├── hooks/        # Custom hooks
│   │   └── lib/          # Types, utils, API
│   └── public/
├── apps-script/          # Gmail auto-download (optional)
├── tests/                # Integration test suite
├── scripts/              # Build scripts for native apps
├── docs/                 # Distribution documentation
└── assets/               # Screenshots and demo video
```

## Distribution

| Method | Docs | Status |
|--------|------|--------|
| Homebrew (macOS) | — | Available |
| Docker | [docs/docker.md](docs/docker.md) | Ready |
| macOS Native (.app) | [docs/macos-native.md](docs/macos-native.md) | Ready |
| Windows Native (.exe) | [docs/windows-native.md](docs/windows-native.md) | Ready |

## License

Apache 2.0 Open Source
