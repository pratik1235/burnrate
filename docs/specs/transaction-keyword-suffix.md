# Transaction Keyword Suffix Feature Spec

## Overview
Implement a feature allowing users to attach a 10-character string (keyword) to the merchant name for a transaction. This string helps users easily identify and search for specific transactions. 

## Database & Models (Backend)
- Add `txn_keyword` (String(10), nullable) to the `transactions` table in `backend/models/models.py`.
- Generate and run the SQLAlchemy Alembic migration to add this column to the local SQLite database. make sure this migration is present so that it does not break existing user app.

## API Changes (Backend)
- Update Pydantic schemas (e.g., in `backend/routers/data.py` or `backend/schemas/` depending on architecture) to include `txn_keyword`.
- Update the Update Transaction endpoint (e.g., `PUT /api/transactions/{id}`) to accept and update `txn_keyword`.
- Update the transaction search functionality to search within `txn_keyword` as well as the existing `merchant` name using `LIKE` queries (escaped properly as per the constitution).

## UI/Frontend Changes (Frontend)
- **Data Types**: Update the `Transaction` type/interface in `frontend-neopop/src/lib/types.ts` to include `txn_keyword?: string`.
- **TransactionRow Component**:
  - Update the rendering to conditionally show ` - {txn_keyword}` if it is set.
  - Implement a hover state that reveals a text input field (using NeoPOP `InputField`) next to the merchant name.
  - Apply `maxLength={10}` on the input.
  - When the user types and hits Enter (or blurs), trigger the API call to update the transaction's `txn_keyword`.
  - Handle loading/error states properly (using NeoPOP elements and handling React async cleanup).
- **Search**: The search bar (e.g. `CommandSearch.tsx`) will be able to search transactions via this string (since the backend query will be updated to match `txn_keyword`).

## Compliance with Constitution
- **Privacy/Local-First**: Handled entirely locally in SQLite.
- **Tech Stack Rules**: Uses NeoPOP components, SQLite WAL, parameterized SQLAlchemy queries, and React cleanup rules.
- **Testing**: A new integration test will be added for the backend endpoint updating and searching the `txn_keyword`. do an end to end test as well for a few transactions. in test make sure to first add a string to one transaction , then search for it using the search endpoint then remove the string and search again to make sure that the removal also works.
