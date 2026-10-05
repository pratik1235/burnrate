# Burnrate v0.5.0

## What's New
- **In-App Feedback**: Submit feedback directly from the app (securely proxied through the backend to protect the API).
- **Encrypted Password Storage**: Statement PDF passwords are now stored in an AES-encrypted local SQLite database, and the automatic PDF unlock flow has been significantly optimized.
- **Dynamic Configuration**: Environment variables and configurations are now securely managed via `pydantic-settings` (e.g. `.env.production`).

## Notice: macOS Intel and Windows Builds Dropped
Due to a lack of resources and time, we have made the difficult decision to drop the official macOS Intel and Windows builds as part of this release. The application can still be built from source on those platforms.
