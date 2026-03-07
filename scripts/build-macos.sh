#!/usr/bin/env bash
# =============================================================================
# Burnrate — macOS native build (Tauri + PyInstaller sidecar)
# Produces: src-tauri/target/release/bundle/dmg/Burnrate_<version>_<arch>.dmg
#           src-tauri/target/release/bundle/macos/Burnrate.app
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ---- Pre-flight checks ----
for cmd in node npm python3 rustc cargo; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: $cmd is not installed." >&2
    exit 1
  fi
done

TRIPLE=$(rustc -vV | grep host | awk '{print $2}')
echo "==> Build target: ${TRIPLE}"
echo ""

# ---- Step 1: Frontend ----
echo "==> [1/5] Building React frontend..."
(cd frontend-neopop && npm ci && npm run build)
echo ""

# ---- Step 2: Python sidecar ----
echo "==> [2/5] Building Python sidecar with PyInstaller..."

VENV_DIR="${ROOT}/.venv-build"
if [ ! -d "$VENV_DIR" ]; then
  echo "    Creating build virtualenv..."
  python3 -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

pip install --quiet --upgrade pip
pip install --quiet pyinstaller
pip install --quiet -r requirements.txt

# Force charset_normalizer to be pure Python to prevent PyInstaller mypyc bundling errors
pip uninstall -y charset-normalizer || true
pip install charset-normalizer --no-binary :all:

python -m PyInstaller \
    --name burnrate-server \
    --onefile \
    --noconfirm \
    --add-data "frontend-neopop/dist:static" \
    --hidden-import uvicorn.logging \
    --hidden-import uvicorn.loops \
    --hidden-import uvicorn.loops.auto \
    --hidden-import uvicorn.protocols \
    --hidden-import uvicorn.protocols.http \
    --hidden-import uvicorn.protocols.http.auto \
    --hidden-import uvicorn.protocols.websockets \
    --hidden-import uvicorn.protocols.websockets.auto \
    --hidden-import uvicorn.lifespan \
    --hidden-import uvicorn.lifespan.on \
    --hidden-import backend.parsers.hdfc \
    --hidden-import backend.parsers.icici \
    --hidden-import backend.parsers.axis \
    --hidden-import backend.parsers.federal \
    --hidden-import backend.parsers.indian_bank \
    --hidden-import backend.parsers.generic \
    --hidden-import backend.parsers.detector \
    --hidden-import backend.routers.analytics \
    --hidden-import backend.routers.cards \
    --hidden-import backend.routers.categories \
    --hidden-import backend.routers.settings \
    --hidden-import backend.routers.statements \
    --hidden-import backend.routers.tags \
    --hidden-import backend.routers.transactions \
    --collect-all pdfplumber \
    --collect-all charset_normalizer \
    scripts/launch.py

mkdir -p src-tauri/binaries
cp "dist/burnrate-server" "src-tauri/binaries/burnrate-server-${TRIPLE}"

echo "    Signing sidecar binary..."
codesign --force --sign - "src-tauri/binaries/burnrate-server-${TRIPLE}"
echo ""

# ---- Step 3: Icons ----
echo "==> [3/5] Generating app icons..."
if [ -f scripts/generate-icons.sh ]; then
  bash scripts/generate-icons.sh
else
  echo "    Icon script not found, using existing icons"
fi
echo ""

# ---- Step 4: Tauri CLI ----
echo "==> [4/5] Ensuring Tauri CLI is installed..."
if ! command -v cargo-tauri &>/dev/null; then
  cargo install tauri-cli --version "^2"
fi
echo ""

# ---- Step 5: Build Tauri app ----
echo "==> [5/5] Building Tauri native app..."
CI=false cargo tauri build --bundles app
echo ""

# ---- Prepare artifacts ----
APP_PATH=$(find src-tauri/target/release/bundle/macos -name "*.app" -type d 2>/dev/null | head -1)
if [ -n "$APP_PATH" ]; then
  echo "==> Deep signing the app bundle to prevent 'damaged' errors..."
  codesign --force --deep --sign - "$APP_PATH"
  echo "==> Clearing quarantine attributes on ${APP_PATH}..."
  xattr -cr "$APP_PATH" 2>/dev/null || true
fi

DMG_PATH=$(find src-tauri/target/release/bundle/dmg -name "*.dmg" 2>/dev/null | head -1)
if [ -n "$DMG_PATH" ]; then
  echo "==> Preparing DMG for distribution..."
  codesign --remove-signature "$DMG_PATH" 2>/dev/null || true
  xattr -cr "$DMG_PATH" 2>/dev/null || true
fi

# ---- Done ----
echo ""
echo "============================================"
echo "  Build complete!"
echo "============================================"
if [ -n "$APP_PATH" ]; then
  echo "  App:  ${APP_PATH}"
fi
if [ -n "$DMG_PATH" ]; then
  echo "  DMG:  ${DMG_PATH}"
fi
echo ""
echo "  To install: open the DMG and drag Burnrate to Applications."
echo ""
echo "  If macOS blocks the DMG from opening:"
echo "    1. Right-click the DMG → Open → click Open in the dialog"
echo "    2. Or run: xattr -cr ${DMG_PATH:-/path/to/Burnrate.dmg}"
echo ""
echo "  If macOS blocks the app after installation:"
echo "    1. Right-click Burnrate in Applications → Open → click Open"
echo "    2. Or run: xattr -cr /Applications/Burnrate.app"
echo "============================================"
