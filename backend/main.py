"""FastAPI entry point for burnrate credit card analytics backend."""

import logging
import os
import sys
from pathlib import Path

# Ensure project root is in path for backend imports
_project_root = Path(__file__).resolve().parent.parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from backend.models.database import SessionLocal, init_db
from backend.models.models import CategoryDefinition, Settings
from backend.routers import analytics, cards, categories, gmail, milestones, offers, settings, statements, tags, transactions

logger = logging.getLogger(__name__)


def seed_categories(db) -> None:
    """Seed prebuilt categories if not present."""
    PREBUILT = [
        {"name": "Food & Dining", "slug": "food", "keywords": "swiggy,zomato,mcdonald,starbucks,restaurant,cafe,dominos,kfc,subway,pizza hut,burger king,haldiram,barbeque nation", "color": "#F97316", "icon": "UtensilsCrossed"},
        {"name": "Shopping", "slug": "shopping", "keywords": "amazon,flipkart,myntra,ajio,meesho,nykaa,tatacliq,croma,reliance digital,infiniti retail,aptronix,indivinity", "color": "#8B5CF6", "icon": "ShoppingBag"},
        {"name": "Travel", "slug": "travel", "keywords": "uber,ola,makemytrip,irctc,cleartrip,goibibo,airline,railway,indigo,air india,vistara,yatra,agoda,ibibo,lounge", "color": "#3B82F6", "icon": "Car"},
        {"name": "Bills & Utilities", "slug": "bills", "keywords": "jio,airtel,vodafone,bsnl,electricity,gas,insurance,broadband,tata power,adani,bharti,life insurance,lic", "color": "#6B7280", "icon": "Receipt"},
        {"name": "Entertainment", "slug": "entertainment", "keywords": "netflix,spotify,hotstar,prime video,inox,pvr,youtube,apple,google play,bundl", "color": "#EC4899", "icon": "Film"},
        {"name": "Fuel", "slug": "fuel", "keywords": "hp,bharat petroleum,iocl,shell,indian oil,bpcl,hindustan petroleum", "color": "#EAB308", "icon": "Fuel"},
        {"name": "Health", "slug": "health", "keywords": "apollo,pharmeasy,1mg,hospital,medplus,netmeds,practo,lenskart", "color": "#10B981", "icon": "Heart"},
        {"name": "Groceries", "slug": "groceries", "keywords": "bigbasket,blinkit,zepto,dmart,jiomart,swiggy instamart,instamart,nature basket,more", "color": "#14B8A6", "icon": "ShoppingCart"},
        {"name": "CC Bill Payment", "slug": "cc_payment", "keywords": "cc payment,cc pymt,bppy cc payment,bbps payment,neft payment,imps payment,repayment,repayments,bbps,bill payment received", "color": "#6B7280", "icon": "CreditCard"},
        {"name": "Cashback", "slug": "cashback", "keywords": "cashback,cash back", "color": "#06C270", "icon": "Coins"},
        {"name": "Other", "slug": "other", "keywords": "", "color": "#9CA3AF", "icon": "MoreHorizontal"},
    ]
    for cat_data in PREBUILT:
        existing = db.query(CategoryDefinition).filter(CategoryDefinition.slug == cat_data["slug"]).first()
        if not existing:
            db.add(CategoryDefinition(is_prebuilt=1, **cat_data))
        elif existing.is_prebuilt and existing.keywords != cat_data["keywords"]:
            existing.keywords = cat_data["keywords"]
    db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    import threading

    init_db()

    db = SessionLocal()
    watch_folder = None
    try:
        seed_categories(db)
        s = db.query(Settings).first()
        if s and s.watch_folder:
            watch_folder = s.watch_folder
        else:
            logger.info("No watch_folder configured, skipping folder watcher")
    finally:
        db.close()

    # Start folder watcher in a background thread so it doesn't block startup.
    # On macOS, accessing TCC-protected directories (~/Documents etc.) triggers
    # a system permission dialog that would otherwise block until the user responds,
    # preventing "Application startup complete" from firing and keeping the splash
    # screen visible indefinitely.
    if watch_folder:
        def _start_watcher_deferred() -> None:
            from backend.services.folder_watcher import start_watcher
            from backend.routers.settings import set_watcher_observer

            try:
                observer = start_watcher(watch_folder, db_session_factory=SessionLocal)
                if observer:
                    set_watcher_observer(observer)
                    logger.info("Folder watcher started on %s", watch_folder)
                else:
                    logger.warning("Failed to start folder watcher for %s", watch_folder)
            except Exception:
                logger.exception("Error starting folder watcher")

        threading.Thread(
            target=_start_watcher_deferred,
            name="watcher-init",
            daemon=True,
        ).start()

    def _gmail_startup_sync() -> None:
        import time

        time.sleep(2)
        db = SessionLocal()
        try:
            from backend.models.models import OAuthCredential

            if not db.query(OAuthCredential).filter(OAuthCredential.provider == "google_gmail").first():
                return
            from backend.services import gmail_sync as _gs

            _gs.run_gmail_sync(db, force=False)
        except Exception:
            logger.exception("Gmail startup sync failed")
        finally:
            db.close()

    threading.Thread(target=_gmail_startup_sync, name="gmail-startup-sync", daemon=True).start()

    # Offer sync background loop
    def _offer_sync_loop() -> None:
        import time

        from backend.config import OFFER_SYNC_ENABLED, OFFER_SYNC_INTERVAL

        time.sleep(5)  # let app fully start
        while True:
            if OFFER_SYNC_ENABLED:
                session = SessionLocal()
                try:
                    from backend.services.offer_fetcher import sync_offers
                    sync_offers(session)
                    logger.info("Offer sync completed")
                except Exception:
                    logger.exception("Offer sync failed")
                finally:
                    session.close()
            time.sleep(OFFER_SYNC_INTERVAL)

    threading.Thread(target=_offer_sync_loop, name="offer-sync", daemon=True).start()

    # Milestone sync background loop
    def _milestone_sync_loop() -> None:
        import time

        from backend.config import MILESTONE_SYNC_ENABLED, MILESTONE_SYNC_INTERVAL

        time.sleep(8)  # let app fully start, after offer sync begins
        while True:
            if MILESTONE_SYNC_ENABLED:
                session = SessionLocal()
                try:
                    from backend.services.milestone_fetcher import sync_milestone_definitions
                    sync_milestone_definitions(session)
                    logger.info("Milestone sync completed")
                except Exception:
                    logger.exception("Milestone sync failed")
                finally:
                    session.close()
            time.sleep(MILESTONE_SYNC_INTERVAL)

    threading.Thread(target=_milestone_sync_loop, name="milestone-sync", daemon=True).start()

    # Browser auto-open for Homebrew distribution only
    def _open_browser_on_startup() -> None:
        """Open browser when server starts up (Homebrew only)."""
        import time
        import webbrowser

        # Only open browser if running from Homebrew
        if os.environ.get("BURNRATE_HOMEBREW") != "true":
            return

        port = int(os.environ.get("BURNRATE_PORT", "8000"))
        time.sleep(2)  # Wait for server startup
        try:
            webbrowser.open(f"http://localhost:{port}")
            logger.info("Browser opened at http://localhost:%s", port)
        except Exception:
            logger.exception("Failed to open browser")

    threading.Thread(target=_open_browser_on_startup, name="browser-opener", daemon=True).start()

    yield

    from backend.routers.settings import get_watcher_observer
    from backend.services.folder_watcher import stop_watcher
    from backend.services import processing_queue

    observer = get_watcher_observer()
    if observer:
        stop_watcher(observer)
    processing_queue.shutdown(wait=True)


app = FastAPI(title="Burnrate Credit Card Analytics", lifespan=lifespan)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:6006",
        "http://localhost:6007",
        "tauri://localhost",
        "https://tauri.localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(settings.router, prefix="/api")
app.include_router(cards.router, prefix="/api")
app.include_router(statements.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(categories.router, prefix="/api")
app.include_router(tags.router, prefix="/api")
app.include_router(gmail.router, prefix="/api")
app.include_router(offers.router, prefix="/api")
app.include_router(milestones.router, prefix="/api")

_project_root_for_static = Path(__file__).resolve().parent.parent
_static_candidates = [
    os.environ.get("BURNRATE_STATIC_DIR", ""),
    str(_project_root_for_static / "frontend-neopop" / "dist"),
    str(_project_root_for_static / "frontend" / "dist"),
]
_static_dir: Optional[str] = None
for _candidate in _static_candidates:
    if _candidate and Path(_candidate).is_dir():
        _static_dir = _candidate
        app.mount("/assets", StaticFiles(directory=str(Path(_candidate) / "assets")), name="static-assets")
        logger.info("Serving static files from %s", _candidate)
        break

if _static_dir:
    from starlette.responses import FileResponse

    _index_html = Path(_static_dir) / "index.html"

    _static_root_resolved = Path(_static_dir).resolve()

    @app.get("/{full_path:path}")
    async def _spa_fallback(full_path: str):
        """Serve index.html for all non-API, non-asset routes (SPA routing)."""
        if ".." in full_path.split("/"):
            return FileResponse(_index_html)
        requested = (_static_root_resolved / full_path).resolve()
        if (
            requested.is_file()
            and requested.is_relative_to(_static_root_resolved)
        ):
            return FileResponse(str(requested))
        return FileResponse(_index_html)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("BURNRATE_PORT", "8000"))
    uvicorn.run(app, host="127.0.0.1", port=port)
