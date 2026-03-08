# Burnrate Release Process

This document describes the release process for Burnrate, including pre-release checks, CI/CD pipeline behavior, and post-release steps.

---

## 1. Overview

Burnrate produces the following release artifacts:


| Artifact              | Platform                 | Description                                        |
| --------------------- | ------------------------ | -------------------------------------------------- |
| **Docker image**      | linux/amd64, linux/arm64 | Multi-arch image pushed to Docker Hub              |
| **macOS DMG**         | Apple Silicon (aarch64)  | Native Tauri app with PyInstaller sidecar          |
| **macOS DMG**         | Intel (x86_64)           | Native Tauri app with PyInstaller sidecar          |
| **Windows installer** | x86_64                   | PyInstaller + Inno Setup `.exe`                    |
| **Homebrew formula**  | macOS                    | Auto-updated in `pratik1235/homebrew-burnrate` tap |


---

## 2. Pre-release Checklist

Before creating a release, complete these steps:

- **Version bump** — Update version in all locations (see §6)
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
  4. Update Homebrew formula in `pratik1235/homebrew-burnrate` (clone, update version + SHA, commit, push)

---

## 5. Post-release Steps

### 5.1 Update README.md

Update the release artifact references in the readme.md file.

### 5.2 Verify artifacts -- Optional

- Download and test the macOS DMG on Apple Silicon and/or Intel
- Download and test the Windows installer
- Pull and run the Docker image
- Run `brew upgrade burnrate` and verify the Homebrew formula

### 5.3 Homebrew formula SHA

The CI automatically updates the Homebrew formula with the correct tarball URL and SHA256. If `HOMEBREW_TAP_TOKEN`(it is already set) is not set, this step is skipped. To update manually:

```bash
VERSION="0.2.1"
TARBALL_URL="https://github.com/pratik1235/burnrate/archive/v${VERSION}.tar.gz"
SHA256=$(curl -sL "$TARBALL_URL" | sha256sum | awk '{print $1}')
# Update HomebrewFormula/burnrate.rb: url and sha256
```

---

## 6. Version Locations

Update the version in these files when cutting a release:


| File                          | Location                                                          |
| ----------------------------- | ----------------------------------------------------------------- |
| `src-tauri/tauri.conf.json`   | `"version": "0.2.1"`                                              |
| `src-tauri/Cargo.toml`        | `version = "0.2.1"`                                               |
| `scripts/burnrate.iss`        | `AppVersion=0.2.1`                                                |
| `HomebrewFormula/burnrate.rb` | `url "https://github.com/.../archive/v0.2.1.tar.gz"` and `sha256` |


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
- **charset_normalizer** — On some builds, use `--no-binary :all:` to avoid mypyc bundling issues.

### Homebrew formula update fails

- Ensure `HOMEBREW_TAP_TOKEN` is set in the repo secrets.
- The token must have write access to `pratik1235/homebrew-burnrate`.
- If the formula has no changes (e.g. SHA matches), the workflow exits successfully without pushing.

### Docker build fails

- Check Docker Hub credentials (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`).
- Multi-arch builds use QEMU for arm64 emulation; they can be slower and occasionally flaky.

### Windows build fails

- Inno Setup must be installed (`choco install innosetup`).
- The PyInstaller `onedir` output must exist at `dist/Burnrate/` before the installer runs.

---

*Last updated: March 2025*