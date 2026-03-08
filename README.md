# Burnrate

**Privacy-first, local-only credit card spend analytics.**

Burnrate is a personal finance analytics app that runs entirely on your laptop. Your financial data never leaves your machine — no cloud, no servers, no tracking.

![Dashboard](assets/screenshot_dashboard.png)

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

## Privacy First

- All data stored locally in SQLite
- No network requests to external services
- No telemetry, analytics, or tracking
- Your statements and transactions stay on your machine

> **Note:** Currently, only **HDFC**, **ICICI**, **Axis**, and **Indian Bank** credit cards are officially supported and tested. Other bank cards *may* work, but stability is not guaranteed at this time. Support for many more cards is coming soon! If you'd like to request support for a new card, please [create a GitHub issue](https://github.com/pratik1235/burnrate/issues/new?title=Card%20support%20request:%20%3CYour%20Bank%3E&labels=enhancement).

## Installation

### Homebrew (macOS)

```bash
brew tap pratik1235/burnrate
brew install burnrate
burnrate
```

Then open http://localhost:8000 in your browser.

### Docker

```bash
docker pull pratik1235/burnrate:v0.2.3
docker run -p 8000:8000 -v burnrate_data:/data pratik1235/burnrate:v0.2.3
```

### macOS — Homebrew

```bash
brew install pratik1235/burnrate/burnrate
```

### macOS — DMG

Download the DMG for your architecture from [GitHub Releases](https://github.com/pratik1235/burnrate/releases/latest):

| Chip | Download |
|------|----------|
| Apple Silicon (M1/M2/M3/M4) | `Burnrate_aarch64.dmg` |
| Intel | `Burnrate_x86_64.dmg` |

Open the DMG and drag Burnrate to Applications.

> **"Burnrate is damaged and can't be opened"?**
> This happens because the app is not signed with an Apple Developer ID certificate. To fix it, run:
> ```bash
> xattr -cr /Applications/Burnrate.app
> ```
> Then open the app normally. This only needs to be done once.

### Windows Native App

Download `Burnrate-Setup.exe` from [GitHub Releases](https://github.com/pratik1235/burnrate/releases/latest) and run the installer.

### From Source

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000

# Frontend (in a separate terminal)
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

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11+, FastAPI, SQLAlchemy, SQLite |
| Frontend | React 18, TypeScript, Vite, styled-components |
| Desktop | Tauri v2 (native macOS/Windows wrapper) |

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
├── src-tauri/            # Tauri native app shell
├── apps-script/          # Gmail auto-download (optional)
├── tests/                # Integration test suite
├── scripts/              # Build scripts
├── docs/                 # Distribution documentation
└── assets/               # Screenshots
```

## Distribution

| Method | Install | Guide |
|--------|---------|-------|
| **Homebrew** (macOS) | `brew tap pratik1235/burnrate && brew install burnrate` | [docs/homebrew-installation.md](docs/homebrew-installation.md) |
| **Docker** | `docker pull pratik1235/burnrate` | [docs/docker-installation.md](docs/docker-installation.md) |
| **macOS Native** (.dmg) | [Download from Releases](https://github.com/pratik1235/burnrate/releases/latest) | [docs/macos-installation.md](docs/macos-installation.md) |
| **Windows Native** (.exe) | [Download from Releases](https://github.com/pratik1235/burnrate/releases/latest) | [docs/windows-installation.md](docs/windows-installation.md) |

## Contributing

We welcome contributions! Please read the [Contributing Guide](CONTRIBUTING.md) before submitting a pull request.

Burnrate follows **spec-driven development** — all new features require a spec document before implementation. See the project documentation for reference:

| Document | Description |
|----------|-------------|
| [Contributing Guide](CONTRIBUTING.md) | How to contribute, code standards, workflow |
| [Project Constitution](docs/CONSTITUTION.md) | Project guidelines, code constraints, security standards |
| [Requirements](docs/requirements.md) | Functional and non-functional requirements |
| [Architecture](docs/architecture.md) | System architecture, data models, API docs, diagrams |
| [Feature Plans](docs/plans/) | Detailed plans for each backend feature |

## License

Apache 2.0 Open Source
