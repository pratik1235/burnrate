# Gmail statement autosync (optional)

## Purpose

Let users **opt in** to read-only Gmail access so statement attachments (PDF, CSV, XLS/XLSX) matching heuristics are saved to the watch folder (or default uploads) and processed like manually dropped files.

## Privacy and constitution

This feature is **explicitly user-authorized** and scoped to Gmail’s readonly scope. It is allowed under [CONSTITUTION.md](../CONSTITUTION.md) §1.1 and §8.1. Core transaction analytics do not require the network.

## Configuration

| Variable | Purpose |
|----------|---------|
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth client ID (required to enable the feature). |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Optional; empty for public / desktop-style clients where allowed. |
| `GMAIL_OAUTH_REDIRECT_URI` | Default `http://127.0.0.1:8000/api/gmail/oauth/callback` — must match Google Cloud console. |
| `GMAIL_OAUTH_SUCCESS_REDIRECT` | Browser redirect after success (default dev: `http://localhost:5173/customize?gmail=connected`). |
| `GMAIL_OAUTH_ERROR_REDIRECT` | Browser redirect on failure. |
| `BURNRATE_OAUTH_FERNET_KEY` | Optional base64 Fernet key; otherwise a key file is created under the data directory. |

## Flow

1. **Customize** → Autosync card → modal → **Connect Gmail** → `POST /api/gmail/auth/start` → browser opens Google with PKCE.
2. **Callback** → `GET /api/gmail/oauth/callback` exchanges code, stores encrypted refresh/access tokens in `oauth_credentials`.
3. **Startup** → background thread runs sync if connected (skipped if last run was within 1 hour unless manual).
4. **Navbar** → `SyncStatus` shows last sync time and manual refresh → `POST /api/gmail/sync`.

## Data model

- `settings.last_gmail_sync` — last successful scan timestamp.
- `oauth_credentials` — one row per provider (`google_gmail`), encrypted tokens.
- `oauth_pending` — short-lived PKCE `state` → `code_verifier` mapping.

## Implementation files

- `backend/routers/gmail.py` — HTTP API and OAuth callback.
- `backend/services/gmail_sync.py` — Gmail API list/get, attachment save, `processing_queue.submit`.
- `backend/services/oauth_tokens.py` — Fernet helpers.
- `frontend-neopop/src/components/SyncStatus.tsx`
- `frontend-neopop/src/pages/Customize.tsx` — card + modal.
