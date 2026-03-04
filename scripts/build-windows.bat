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
python -m PyInstaller ^
    --name Burnrate ^
    --windowed ^
    --onedir ^
    --noconfirm ^
    --add-data "frontend-neopop\dist;static" ^
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
    --hidden-import backend.parsers.hdfc ^
    --hidden-import backend.parsers.icici ^
    --hidden-import backend.parsers.axis ^
    --hidden-import backend.parsers.federal ^
    --hidden-import backend.parsers.indian_bank ^
    --hidden-import backend.parsers.generic ^
    --hidden-import backend.parsers.detector ^
    --hidden-import backend.routers.analytics ^
    --hidden-import backend.routers.cards ^
    --hidden-import backend.routers.categories ^
    --hidden-import backend.routers.settings ^
    --hidden-import backend.routers.statements ^
    --hidden-import backend.routers.tags ^
    --hidden-import backend.routers.transactions ^
    --icon scripts\icon.ico ^
    scripts\launch.py

echo ==> Build complete: dist\Burnrate\
echo     Run: dist\Burnrate\Burnrate.exe
