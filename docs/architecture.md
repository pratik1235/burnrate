# Burnrate Architecture

Burnrate is a **privacy-first, local-only** credit card spend analytics application. It operates as a 100% client-side application, ensuring no sensitive financial data ever leaves the user's machine.

## 1. High-Level Architecture

Burnrate can be deployed as a static web application or as a native desktop application via Tauri.

### 1.1 Tech Stack

| Layer | Technology |
|-------|-------------|
| **Frontend** | React 18, TypeScript, Vite, NeoPOP UI, styled-components |
| **Storage** | IndexedDB (abstracted via **Dexie.js**) |
| **Parsing** | **PDF.js** for browser-native PDF text extraction |
| **Desktop** | **Tauri v2** (native Rust shell for macOS/Windows/Linux) |
| **Watcher** | Rust `notify` crate (Tauri-only) for native folder watching |

### 1.2 Data Flow (Auto-Import)

1. **Native Watcher (Rust)**: Detects a new `.pdf` file in the user-selected watch folder.
2. **Event Emission**: Emits a `watch-folder-new-pdf` event to the React frontend.
3. **File Reading**: The frontend uses `tauri-plugin-fs` to read the file into memory.
4. **Statement Processing**:
   - PDF.js extracts raw text/lines.
   - Bank-specific JavaScript parsers extract transactions and metadata.
   - Transactions are persisted into **IndexedDB**.
5. **UI Update**: Dashboard and Analytics screens automatically refresh via live queries.

## 2. Project Structure

```
burnrate/
├── frontend-neopop/      # Pure React web app
│   ├── src/
│   │   ├── parsers/      # Client-side bank PDF parsers
│   │   ├── services/     # Statement processing, category analysis, Gmail sync
│   │   ├── lib/          # Dexie.js DB schema and data access layer
│   │   ├── components/   # UI components built with NeoPOP
│   │   └── pages/        # Dashboard, Analytics, etc.
├── src-tauri/            # Tauri project (Rust code for desktop features)
├── apps-script/          # Optional helper for Gmail statement fetching
└── assets/               # Visual assets and documentation images
```

## 3. Storage Layer (IndexedDB)

Burnrate uses **IndexedDB** for all persistent data. Dexie.js provides a clean, observable API for querying transactions and settings. 

**Schema Overview:**
- `settings`: User profile, watch folder path, categories.
- `cards`: Registered credit cards (bank, last4).
- `statements`: Imported statement metadata (file_hash, period, bank).
- `transactions`: Individual spend items linked to cards and statements.

## 4. Privacy & Security

- **Encryption**: No cloud bypass. Data is only accessible to the browser instance on the user's machine.
- **Network**: The application makes zero outbound requests to 3rd party servers for data processing. All bank parsing is local.
- **Gmail**: OAuth tokens for Gmail import are handled via browser-native flows (no persistent backend storage of tokens).
