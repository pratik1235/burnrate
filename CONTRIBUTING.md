# Contributing to Burnrate

Thank you for your interest in contributing to **Burnrate**! This document will help you get started and ensure your contributions align with the project's standards.

---

## 1. Welcome & Overview

**Burnrate** is a privacy-first, local-only credit card spend analytics application. Your financial data never leaves your machine — no cloud, no servers, no tracking. The app parses PDF statements from multiple Indian banks, categorizes transactions, and provides rich analytics — all running entirely in your browser or as a desktop app.

We welcome contributions from developers, designers, and anyone passionate about privacy-focused personal finance tools. Whether you're fixing a bug, adding a new bank parser, or improving the UI, your help makes Burnrate better for everyone.

For a high-level overview of features, installation options, and project structure, see the [README](README.md).

---

## 2. Getting Started

### Prerequisites

- **Node.js 18+** (frontend)
- **Rust** (for Tauri desktop builds)

### Clone the Repository

```bash
git clone https://github.com/pratik1235/burnrate.git
cd burnrate
```

### Development Setup

```bash
cd frontend-neopop
npm install
npm run dev
```

The frontend will be available at `http://localhost:5173`.

### Running Tauri (Desktop)

```bash
npm run tauri dev
```

---

## 3. Code Standards

### Frontend

- **NeoPOP design system** — All UI MUST use `@cred/neopop-web` components (`Typography`, `Button`, `ElevatedCard`, `Tag`, `InputField`, `Row`, `Column`, etc.)
- **Icons** — Use `lucide-react` only; no other icon libraries
- **Styling** — `styled-components` with NeoPOP tokens; dark theme with black backgrounds
- **TypeScript** — Strict mode enabled; proper types for all props and state
- **React patterns** — `useEffect` cleanup for subscriptions/async work; no `dangerouslySetInnerHTML`
- **Privacy** — No external network requests; no telemetry; all storage stays local in IndexedDB.

---

## 4. How to Contribute

### Workflow

1. **Fork** the repository on GitHub
2. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Implement** the feature following the project's standards
4. **Submit a PR** with a clear, descriptive title and summary of changes.

---

## 5. Adding a New Bank Parser

Adding support for a new bank is one of the most valuable contributions. In the new architecture, all parsing happens in the browser's JavaScript.

### Step 1: Create a Parser Function

Create a new file in `frontend-neopop/src/parsers/` (e.g., `sbi.js` or `sbi.ts`).

The parser should take the extracted lines and full text from a PDF and return a structured object:

```javascript
export function parseSBI(allLines, fullText) {
  // Logic to extract:
  // - bank: 'sbi'
  // - card_last4
  // - period_start / period_end
  // - transactions: [{ date, merchant, amount, type, description }]
  // - total_amount_due
  // - credit_limit
  ...
}
```

### Step 2: Register the Parser

In `frontend-neopop/src/services/statementProcessor.js`, add your parser to the `PARSERS` object:

```javascript
import { parseSBI } from '../parsers/sbi.js';

const PARSERS = {
  hdfc: parseHDFC,
  icici: parseICICI,
  axis: parseAxis,
  sbi: parseSBI, // Register yours here
  ...
};
```

### Step 3: Add Detector Logic

In `frontend-neopop/src/parsers/detector.js`, add logic to identify the bank from the PDF content or filename.

---

## 6. License

By contributing to Burnrate, you agree that your contributions will be licensed under the **Apache License 2.0**. See the [LICENSE](LICENSE) file for details.

---

Thank you for contributing to Burnrate. Your efforts help make privacy-first personal finance accessible to everyone.
