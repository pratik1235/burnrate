@echo off
REM =============================================================================
REM Burnrate — Windows native build script
REM Produces: dist\Burnrate\ (portable folder) or dist\Burnrate.exe (onefile)
REM =============================================================================

cd /d "%~dp0\.."

echo ==> Building React frontend...
cd frontend-neopop
call npm ci --omit=dev
call npm run build
cd ..

echo ==> Building Windows app with PyInstaller...
set PYTHONPATH=.
python -m PyInstaller ^
    --name Burnrate ^
    --windowed ^
    --onedir ^
    --noconfirm ^
    --add-data "frontend-neopop\dist;static" ^
    --paths . ^
    --hidden-import uvicorn.logging ^
    --hidden-import uvicorn.loops ^
    --hidden-import uvicorn.loops.auto ^
    --hidden-import uvicorn.protocols ^
    --hidden-import uvicorn.protocols.http ^
    --hidden-import uvicorn.protocols.http.auto ^
    --hidden-import uvicorn.protocols.websockets ^
    --hidden-import uvicorn.protocols.websockets.auto ^
    --hidden-import uvicorn.lifespan ^
    --hidden-import uvicorn.lifespan.on ^
    --collect-all backend ^
    --collect-all pdfplumber ^
    --collect-all charset_normalizer ^
    --icon scripts\icon.ico ^
    scripts\launch.py

echo ==> Build complete: dist\Burnrate\
echo     Run: dist\Burnrate\Burnrate.exe
