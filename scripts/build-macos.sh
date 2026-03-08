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
echo "==> [1/6] Building React frontend..."
(cd frontend-neopop && npm ci && npm run build)
echo ""

# ---- Step 2: Python sidecar ----
echo "==> [2/6] Building Python sidecar with PyInstaller..."

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
    --collect-all backend \
    --collect-all pdfplumber \
    --collect-all charset_normalizer \
    scripts/launch.py

mkdir -p src-tauri/binaries
cp "dist/burnrate-server" "src-tauri/binaries/burnrate-server-${TRIPLE}"

echo "    Signing sidecar binary..."
codesign --force --sign - "src-tauri/binaries/burnrate-server-${TRIPLE}"
echo ""

# ---- Step 3: Icons ----
echo "==> [3/6] Generating app icons..."
if [ -f scripts/generate-icons.sh ]; then
  bash scripts/generate-icons.sh
else
  echo "    Icon script not found, using existing icons"
fi

echo "==> [3b/6] Applying black backgrounds to icons..."
source "$VENV_DIR/bin/activate"
pip install --quiet Pillow
python3 - "$ROOT" << 'PYEOF'
import os
import shutil
import subprocess
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("    ERROR: Pillow required. Run: pip install Pillow", file=sys.stderr)
    sys.exit(1)

root = Path(sys.argv[1])
icon_dir = root / "src-tauri" / "icons"
black = (0, 0, 0, 255)

def blacken_png(path: Path):
    img = Image.open(path).convert("RGBA")
    bg = Image.new("RGBA", img.size, black)
    bg.paste(img, mask=img.split()[3])
    return bg.convert("RGBA")

for name in ["32x32.png", "128x128.png", "128x128@2x.png", "icon.png"]:
    p = icon_dir / name
    if p.exists():
        blacken_png(p).save(p)
        print(f"    Blackened {name}")

# Regenerate .icns
iconset = icon_dir / "icon.iconset"
iconset.mkdir(exist_ok=True)
try:
    base = Image.open(icon_dir / "icon.png").convert("RGBA")
    for s in [16, 32, 64, 128, 256, 512]:
        resized = base.resize((s, s), Image.Resampling.LANCZOS)
        resized.save(iconset / f"icon_{s}x{s}.png")
        if s * 2 <= 1024:
            resized = base.resize((s * 2, s * 2), Image.Resampling.LANCZOS)
            resized.save(iconset / f"icon_{s}x{s}@2x.png")
    subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(icon_dir / "icon.icns")], check=True)
    shutil.rmtree(iconset)
    print("    Regenerated icon.icns")
except Exception as e:
    print(f"    icon.icns skipped: {e}")

# Regenerate .ico
try:
    img = Image.open(icon_dir / "icon.png").convert("RGBA")
    img.save(icon_dir / "icon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])
    print("    Regenerated icon.ico")
except Exception as e:
    print(f"    icon.ico skipped: {e}")

print("==> Icon blackening complete")
PYEOF
echo ""

# ---- Step 4: Tauri CLI ----
echo "==> [4/6] Ensuring Tauri CLI is installed..."
if ! command -v cargo-tauri &>/dev/null; then
  cargo install tauri-cli --version "^2"
fi
echo ""

# ---- Step 5: Build Tauri app ----
echo "==> [5/6] Building Tauri native app..."
CI=false cargo tauri build --bundles app,dmg
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
