# Burnrate Release Process

This document describes the release process for Burnrate, including pre-release checks, CI/CD pipeline behavior, and post-release steps.

---

## 1. Overview

Burnrate produces the following release artifacts:


| Artifact              | Platform                 | Description                                                                      |
| --------------------- | ------------------------ | -------------------------------------------------------------------------------- |
| **Docker image**      | linux/amd64, linux/arm64 | Multi-arch image pushed to Docker Hub                                            |
| **macOS DMG**         | Apple Silicon (aarch64)  | Native Tauri app with PyInstaller sidecar                                        |
| **macOS DMG**         | Intel (x86_64)           | Native Tauri app with PyInstaller sidecar                                        |
| **Windows installer** | x86_64                   | PyInstaller + Inno Setup `.exe`                                                  |
| **Homebrew formula**  | macOS                    | Auto-updated in `pratik1235/homebrew-burnrate` tap (no manual edits required)  |


---

## 2. Pre-release Checklist

Before creating a release, complete these steps:

- **Version bump** — Update version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `scripts/burnrate.iss` (see §6)
  - **Note:** Do NOT update `HomebrewFormula/burnrate.rb` — it's auto-updated by CI
- **Changelog** — Document notable changes for the release notes
- **Local testing** — Run the app locally; verify statement import, analytics, tags
- **macOS build** — Run `bash scripts/build-macos.sh` and test the DMG
- **Commit and push** — Ensure all changes are committed and pushed to `main`

---

## 3. Creating a Release

### Tag format

Use semantic versioning with a `v` prefix:

```
v0.2.1
v1.0.0
```

### Command

```bash
git tag v0.2.1
git push origin v0.2.1
```

### What triggers CI

Pushing a tag matching `v*` triggers the `.github/workflows/release.yml` workflow. The workflow:

1. Extracts the version from the tag (e.g. `v0.2.1` → `0.2.1`)
2. Runs Docker, macOS ARM, macOS Intel, and Windows builds in parallel
3. Creates a GitHub Release with generated notes and attached artifacts
4. Updates the Homebrew formula (if `HOMEBREW_TAP_TOKEN` is configured)

### Alternative: GitHub CLI

```bash
gh release create v0.2.1 --generate-notes
```

Note: `gh release create` with a new tag will create the tag and push it, which triggers the workflow. The workflow then builds artifacts and attaches them to the release. If you use `gh release create` before the workflow completes, the release may initially be empty; the workflow will populate it.

---

## 4. CI/CD Pipeline

The `release.yml` workflow runs four main jobs plus a release job.

### 4.1 Docker job

- **Runner:** `ubuntu-latest`
- **Steps:** Checkout → QEMU + Buildx → Docker Hub login → Build multi-arch image → Push
- **Tags:** `pratik1235/burnrate:<version>`, `pratik1235/burnrate:latest`
- **Platforms:** `linux/amd64`, `linux/arm64`

### 4.2 macOS ARM job (`build-macos-arm`)

- **Runner:** `macos-latest` (Apple Silicon)
- **Steps:**
  1. Install Rust, Node.js, Python
  2. Build React frontend (`npm run build`)
  3. Generate app icons
  4. Build Python sidecar with PyInstaller (includes `--collect-all pdfplumber`)
  5. Copy sidecar to `src-tauri/binaries/burnrate-server-<triple>`
  6. Codesign sidecar
  7. Build Tauri app (`cargo tauri build`)
  8. Prepare DMG (remove signature, clear xattr)
  9. Upload `Burnrate-macOS-arm64` artifact

### 4.3 macOS Intel job (`build-macos-intel`)

- **Runner:** `macos-15-intel`
- Same steps as ARM, produces `Burnrate-macOS-x86_64` artifact

### 4.4 Windows job (`build-windows`)

- **Runner:** `windows-latest`
- **Steps:**
  1. Build frontend
  2. Generate icons (Node script)
  3. Build PyInstaller `onedir` bundle
  4. Copy icon into dist
  5. Install Inno Setup
  6. Run `ISCC.exe scripts/burnrate.iss`
  7. Upload `Burnrate-Windows` artifact (`Burnrate-Setup.exe`)

### 4.5 Release job

- **Depends on:** All three build jobs (runs if at least one succeeds)
- **Steps:**
  1. Download macOS ARM, macOS Intel, Windows artifacts
  2. Rename DMGs to `Burnrate_aarch64.dmg`, `Burnrate_x86_64.dmg`
  3. Create GitHub Release with `softprops/action-gh-release`
  4. **Automatically update Homebrew formula** in `pratik1235/homebrew-burnrate`:
     - Clones the tap repository
     - Copies `HomebrewFormula/burnrate.rb` from main repo as a template
     - Downloads the release tarball and calculates its SHA256
     - Uses `sed` to replace the URL and SHA256 in the formula
     - Commits and pushes the updated formula to the tap
     - **No manual formula update required** — the version and SHA in the main repo's `HomebrewFormula/burnrate.rb` serve only as a template and do not need to match the release version

---

## 5. Post-release Steps

### 5.1 Update README.md

Update the release artifact references in the readme.md file.

### 5.2 Verify artifacts -- Optional

- Download and test the macOS DMG on Apple Silicon and/or Intel
- Download and test the Windows installer
- Pull and run the Docker image
- Run `brew upgrade burnrate` and verify the Homebrew formula

### 5.3 Homebrew formula distribution

**The Homebrew formula is updated automatically by the release workflow.** No manual action is required.

#### How it works

1. The `HomebrewFormula/burnrate.rb` file in the main repository serves as a **template**
2. When a release tag is pushed, the workflow (`.github/workflows/release.yml` lines 419-450):
   - Downloads the release tarball (`https://github.com/pratik1235/burnrate/archive/v{VERSION}.tar.gz`)
   - Calculates the actual SHA256 checksum
   - Clones `pratik1235/homebrew-burnrate` tap repository
   - Copies the template formula from the main repo
   - Replaces the URL and SHA256 using `sed` commands
   - Commits and pushes the updated formula to the tap
3. Users can then run `brew upgrade burnrate` to get the new version

#### Template approach

The version and SHA256 in `HomebrewFormula/burnrate.rb` in the main repo **do not need to match the current release**. They serve as placeholders that get replaced by the workflow. This means:

- You **do not** need to manually update `HomebrewFormula/burnrate.rb` when cutting a release
- The workflow calculates the correct SHA256 from the actual tarball
- The workflow fills in the correct version from the git tag

#### Requirements

- `HOMEBREW_TAP_TOKEN` secret must be set in repository secrets (already configured)
- The token must have write access to `pratik1235/homebrew-burnrate`

#### Manual update (emergency only)

If the workflow fails and you need to update manually:

```bash
VERSION="0.3.1"
TARBALL_URL="https://github.com/pratik1235/burnrate/archive/v${VERSION}.tar.gz"
SHA256=$(curl -sL "$TARBALL_URL" | sha256sum | awk '{print $1}')
# Clone tap, update Formula/burnrate.rb with new url and sha256, commit, push
```

---

## 6. Version Locations

Update the version in these files when cutting a release:


| File                          | Location                 | Notes                                                          |
| ----------------------------- | ------------------------ | -------------------------------------------------------------- |
| `src-tauri/tauri.conf.json`   | `"version": "0.2.1"`     | **Required** — Used by Tauri builds                            |
| `src-tauri/Cargo.toml`        | `version = "0.2.1"`      | **Required** — Used by Cargo and Tauri                         |
| `scripts/burnrate.iss`        | `AppVersion=0.2.1`       | **Required** — Used by Windows Inno Setup installer            |
| `HomebrewFormula/burnrate.rb` | `url` and `sha256`       | **Template only** — Auto-updated by CI, no manual edit needed  |


**Important:** The `HomebrewFormula/burnrate.rb` file is a template. The release workflow automatically updates the version, URL, and SHA256 when pushing to the Homebrew tap. You do not need to manually update this file.

The `frontend-neopop/package.json` uses `"version": "0.0.0"` (private package) and does not need to be updated.

---

## 7. Troubleshooting

### Code signing (macOS)

- **"Burnrate is damaged and can't be opened"** — The app is not signed with an Apple Developer ID. Users can run:
  ```bash
  xattr -cr /Applications/Burnrate.app
  ```
- **CI uses ad-hoc signing** — `codesign --force --sign -` signs with the default identity. For distribution outside the Mac App Store, an Apple Developer certificate is required for proper notarization.

### PyInstaller

- **Missing module errors** — Add `--hidden-import` for any dynamically imported modules. The workflow already includes uvicorn, parsers, and routers.
- **pdfplumber** — Use `--collect-all pdfplumber` to bundle all pdfplumber data files.
- **charset_normalizer** — **macOS and Windows release jobs** both run `pip uninstall charset-normalizer` and `pip install charset-normalizer --no-binary :all:` immediately before PyInstaller, then `--collect-all charset_normalizer`, to avoid mypyc/binary layouts that fail inside frozen apps. Windows PyInstaller jobs in `release.yml` and the optional `build.yml` Windows job fail CI if `__mypyc` appears under `charset_normalizer` in `dist/Burnrate/`. macOS release jobs run an additional check that the active `charset_normalizer` install contains no `__mypyc` artifacts before freezing the sidecar.

### Statement upload “internal error” / `ModuleNotFoundError: …__mypyc` (GitHub [#18](https://github.com/pratik1235/burnrate/issues/18))

- **Cause** — Desktop builds bundle Python with PyInstaller. Wheels of `charset-normalizer` can ship mypyc native modules that PyInstaller does not collect reliably, so statement upload fails with a generic API error while logs show a missing `*__mypyc` module.
- **Fix in tree** — Official builds use pure-Python `charset-normalizer` and `--collect-all charset_normalizer` (see [scripts/build-windows.bat](https://github.com/pratik1235/burnrate/blob/main/scripts/build-windows.bat), [scripts/build-macos.sh](https://github.com/pratik1235/burnrate/blob/main/scripts/build-macos.sh), and `release.yml`). Users on older installers should **upgrade** to a release built with the current pipeline.
- **If reports persist** — Ask for the **app version** and **install source** (GitHub Release `.exe` / `.dmg`, Homebrew, Docker, or `pip`/dev server). Only frozen desktop builds hit this failure mode; Docker and `uvicorn` from a normal venv use a regular Python import path and should not show `pyimod02_importers` in the traceback. Confirm local rebuilds run the charset steps above and do not use `pyinstaller burnrate-server.spec` without reinstalling `charset-normalizer` from source (see comment in [burnrate-server.spec](https://github.com/pratik1235/burnrate/blob/main/burnrate-server.spec)).

### Homebrew formula update fails

The workflow automatically updates the Homebrew tap at `pratik1235/homebrew-burnrate` by:
1. Using `HomebrewFormula/burnrate.rb` from the main repo as a template
2. Downloading the release tarball and calculating its SHA256
3. Replacing URL and SHA256 values using `sed` commands (lines 419-450 in `release.yml`)
4. Committing and pushing to the tap repository

**Common issues:**
- Ensure `HOMEBREW_TAP_TOKEN` is set in the repo secrets
- The token must have write access to `pratik1235/homebrew-burnrate`
- Check the "Update Homebrew formula" step in the release workflow logs
- The workflow skips the push if the formula is unchanged (same SHA256)

**Remember:** You never need to manually update `HomebrewFormula/burnrate.rb` before a release. The workflow handles everything automatically.

### Docker build fails

- Check Docker Hub credentials (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`).
- Multi-arch builds use QEMU for arm64 emulation; they can be slower and occasionally flaky.

### Windows build fails

- Inno Setup must be installed (`choco install innosetup`).
- The PyInstaller `onedir` output must exist at `dist/Burnrate/` before the installer runs.

---

*Last updated: March 2026*