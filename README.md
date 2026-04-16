# Burnrate

**Privacy-first credit card and bank-account spend analytics.**

Burnrate is a personal finance app that keeps imported **statements and transactions in a local database** on your machine — no Burnrate-hosted cloud for your data, no telemetry. Optional **Gmail autosync** and **offers** syncing use the network only when you use those features (see **Privacy First** below).

**[→ Website & demo](https://pratik1235.github.io/burnrate)**

![Dashboard](assets/screenshot_dashboard.png)

## Features

- **Multi-bank support** — HDFC, ICICI, Axis, Federal Bank, Indian Bank, SBI, Amex, IDFC FIRST, IndusInd, Kotak, Standard Chartered, YES, AU, RBL
- **Auto-import** — Drop credit card statement PDFs or set up a watch folder for automatic processing
- **Bank account statements (CSV)** — Import savings/current account CSVs from major Indian banks (HDFC, ICICI, SBI, Axis, plus a generic auto-detect parser). Statements and transactions carry a **CC** vs **BANK** source so you can filter and review them separately. Credit card bill payments on bank statements are excluded from spend totals so they are not double-counted with card-side payments.
- **Statements hub** — Browse imported statements (card and bank), filter by bank and period, and manage uploads from one place
- **Offers & benefits** — Offers are fetched from public bank and aggregator pages, normalized, cached locally, and shown in a searchable catalog. Highlight offers that match your cards, hide noise, add your own manual offers, and refresh on demand. Always verify details with your issuer before relying on an offer.
- **Spending milestones** — Track progress toward fee waivers, bonus points, lounge access, and other card benefits. Set custom goals or sync predefined milestones from bank definitions. Filter by card and see how much more you need to spend to reach each milestone.
- **Gmail statement autosync (optional)** — Opt in to read-only Gmail OAuth (PKCE). Matching statement attachments (PDF, CSV, XLS/XLSX) are saved to your watch folder or default uploads and processed like manual drops. Configure OAuth in the backend; connect from **Customize** and monitor sync from the navbar.
- **Smart categorization** — Transactions auto-categorized with customizable categories and keywords
- **Rich analytics** — Spend trends, category breakdowns, merchant insights, credit utilization
- **Multi-card and multi-source filtering** — Filter transactions and metrics by cards, **bank accounts** (bank + last 4), **source** (credit card / bank / all), categories, date range, amount, direction, and tags
- **Multiple Views** — Analyze transactions per statement, consolidate across multiple cards, or apply flexible filters for any custom combination
- **Transaction tagging** — Define and apply custom tags to transactions
- **CSV export** — Export filtered transactions for external analysis
- **Statement management** — Reparse or remove imported statements; inline password entry for encrypted PDFs when needed
- **Google Apps Script** — Alternative workflow: auto-download statements from Gmail into a folder the app watches ([`apps-script/`](apps-script/))

## Privacy First

- All analytics and statement data live in a local **SQLite** database on your machine
- **No telemetry, analytics, or tracking** in the core product
- **Optional network features** (only if you enable or use them):
  - **Gmail autosync** uses Google’s **read-only** Gmail scope; tokens are stored encrypted. See [docs/plans/gmail-autosync.md](docs/plans/gmail-autosync.md).
  - **Offers** fetches public offer pages on a schedule for convenience; offers are cached locally. See [docs/plans/offers-benefits.md](docs/plans/offers-benefits.md).
- With those options turned off, routine spend analytics do not require outbound calls to third parties

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
docker pull pratik1235/burnrate:v0.3.0
docker run -p 8000:8000 -v burnrate_data:/data pratik1235/burnrate:v0.3.0
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
2. Set a watch folder or import files (credit card statement PDFs, bank account CSVs)
3. Explore your spend analytics — use **Customize** for bank CSV imports or optional Gmail autosync; use **Offers** in the nav for card benefits

## Screenshots

| Dashboard | Transactions | Analytics |
|-----------|--------------|-----------|
| ![](assets/screenshot_dashboard.png) | ![](assets/screenshot_transactions.png) | ![](assets/screenshot_analytics.png) |

| Cards | Offers | Milestones |
|-------|--------|------------|
| ![](assets/screenshot_cards.png) | ![](assets/screenshot_offers.png) | ![](assets/screenshot_milestones.png) |

| Customize | Categories | Setup |
|-----------|------------|-------|
| ![](assets/screenshot_customize.png) | ![](assets/screenshot_categories_modal.png) | ![](assets/screenshot_setup.png) |

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
| [Feature Plans](docs/plans/) | Index of feature specs |




## License

Apache 2.0 Open Source
