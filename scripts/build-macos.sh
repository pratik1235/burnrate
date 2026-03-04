#!/usr/bin/env bash
# =============================================================================
# Burnrate — macOS native build script (PyInstaller fallback)
# For the recommended Tauri-based approach, see docs/macos-native.md
# Produces: dist/Burnrate.app (and optionally Burnrate.dmg)
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building React frontend..."
(cd frontend-neopop && npm ci --omit=dev && npm run build)

echo "==> Building macOS app with PyInstaller..."
python -m PyInstaller \
    --name Burnrate \
    --windowed \
    --onedir \
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
    --icon scripts/icon.icns 2>/dev/null || true \
    scripts/launch.py

# Ad-hoc code sign (allows running without Apple Developer ID)
echo "==> Ad-hoc signing..."
codesign -s - --force --deep "dist/Burnrate.app" 2>/dev/null || true

echo "==> Build complete: dist/Burnrate.app"

# Optionally create DMG
if command -v hdiutil &>/dev/null; then
    echo "==> Creating DMG..."
    hdiutil create \
        -volname "Burnrate" \
        -srcfolder "dist/Burnrate.app" \
        -ov \
        -format UDZO \
        "dist/Burnrate.dmg"
    echo "==> DMG created: dist/Burnrate.dmg"
fi
