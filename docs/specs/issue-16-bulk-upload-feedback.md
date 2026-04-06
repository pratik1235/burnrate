# Spec: Bulk upload feedback (issue #16)

**Status:** Implemented  
**Related:** [GitHub issue #16](https://github.com/pratik1235/burnrate/issues/16)

## Goal

Batch PDF (and CSV) uploads must **never fail silently**. Users see how many files were selected, how many were queued, per-file pre-reject reasons, and per-file processing outcomes with safe, generic messages.

## API: `POST /api/statements/upload-bulk`

Backward-compatible: existing aggregate fields remain. New fields are additive.

### Response fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"ok"` on success |
| `input_total` | int | Multipart file parts received |
| `total` | int | Files queued for processing (after validation) |
| `success`, `failed`, `duplicate`, `card_not_found`, `parse_error`, `password_needed` | int | Aggregates (unchanged semantics) |
| `skipped` | int | Count of pre-queue rejects; equals `len(rejected)` |
| `rejected` | array | Pre-queue items only |
| `outcomes` | array | One entry per queued file (completion order) |

### `rejected[]`

| Field | Type | Description |
|-------|------|-------------|
| `file_name` | string | Basename only (sanitized) |
| `reason` | enum | `missing_filename` \| `invalid_type` \| `file_too_large` |

### `outcomes[]`

| Field | Type | Description |
|-------|------|-------------|
| `file_name` | string | Original upload basename |
| `status` | string | Same vocabulary as single-upload (`success`, `duplicate`, `parse_error`, …) |
| `message` | string? | Optional user-facing line from processor; generic on unexpected errors |

### Privacy / errors

- Responses must not include server filesystem paths (CONSTITUTION §4.4).
- Full tracebacks and paths are logged server-side only; client gets generic copy where needed.

### Edge cases

| Case | Behavior |
|------|----------|
| All parts invalid | `400` with existing message; no body with new fields |
| Some valid | `200` with `rejected` populated, `outcomes` for queued files |
| Worker exception | Outcome `status: "error"`, generic message; `failed` incremented |

## Frontend

- Shared types in `api.ts` match the contract.
- `summarizeBulkUpload` / detail rows drive NeoPOP summary UI (`ElevatedCard`, `Typography`, `Column`).
- Dashboard, Statements, Customize, and `StatUpload` use the same notification + inline summary pattern.

## Testing

- Integration: multipart with one invalid + one valid fixture → `input_total`, `rejected`, `outcomes` length and names.
