# Spec: Manual folder upload (issue #17)

**Status:** Implemented  
**Related:** [GitHub issue #17](https://github.com/pratik1235/burnrate/issues/17)

## Goal

Let users run a **one-shot batch import** by choosing a **local folder** from the manual upload UI (`StatUpload`), ingesting all **supported** files under that tree via the existing `POST /api/statements/upload-bulk` pipeline. This complements the **watch folder** feature (continuous monitoring), which already supports any local path in settings.

## UX

- **Dropzone** (unchanged): drag-and-drop files, or **click** empty area / icon / primary text → OS **file** dialog (`multiple` files).
- **Choose folder** (NeoPOP secondary button, **inside** the dashed dropzone when `onBulkUpload` is set): opens the browser **directory** dialog (`webkitdirectory` + `multiple`). Only this control opens the folder picker; **`click` must not bubble** to the dropzone root (`stopPropagation`).
- **Subtitle** explains: click outside the button for files vs **Choose folder** for a whole directory (subfolders follow browser behavior).

## Supported files

- Client filters the `FileList` using the same logical extensions as `acceptTypes` (default: `.pdf`). If settings also allow CSV via `acceptTypes`, those are included.
- Server still validates extension and size; non-matching files may be counted as `skipped` if sent—client filtering reduces noise.

## Edge cases

| Case | Behavior |
|------|----------|
| Folder contains no PDF/CSV (after filter) | Brief error state: message that no supported files were found; no API call |
| Mixed files | Only allowed extensions uploaded; others omitted on client |
| Duplicate leaf names in subfolders | OK: server stores with unique UUID prefix per file |
| Password-protected PDFs in bulk | Unchanged bulk behavior (single optional password not applied per file from this UI) |
| Browser without directory input | Button may be no-op or unsupported; Chromium-based browsers and modern Safari generally support `webkitdirectory` |

## API

No new endpoints. Uses existing bulk upload and request shape.

## Testing

- Unit tests: `filterFilesByAcceptTypes` (see `frontend-neopop/src/lib/statUploadFilter.test.ts`).
- Manual QA: click dropzone (not button) → file dialog; click **Choose folder** → directory dialog; drop PDFs → bulk path.
