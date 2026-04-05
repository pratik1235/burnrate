"""Optional Gmail OAuth and statement attachment sync."""

import base64
import hashlib
import json
import logging
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from backend.models.database import get_db
from backend.models.models import OAuthCredential, OAuthPending, Settings
from backend.services import gmail_sync
from backend.services.oauth_tokens import encrypt_secret

router = APIRouter(prefix="/gmail", tags=["gmail"])
logger = logging.getLogger(__name__)

_DEFAULT_FRONTEND_OK = "http://localhost:5173/customize?gmail=connected"
_DEFAULT_FRONTEND_ERR = "http://localhost:5173/customize?gmail=error"


def _allowed_oauth_redirect_hosts() -> set[str]:
    raw = os.environ.get("BURNRATE_OAUTH_REDIRECT_ALLOWED_HOSTS", "")
    return {h.strip().lower() for h in raw.split(",") if h.strip()}


def _validated_browser_redirect(raw: str | None, default: str) -> str:
    """Allow http(s) to localhost / 127.0.0.1 / ::1, or hosts in BURNRATE_OAUTH_REDIRECT_ALLOWED_HOSTS."""
    if not raw or not str(raw).strip():
        return default
    url = str(raw).strip()
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        logger.warning("Rejected OAuth browser redirect: invalid scheme")
        return default
    host = (parsed.hostname or "").lower()
    if host in ("localhost", "127.0.0.1", "::1"):
        return url
    if host in _allowed_oauth_redirect_hosts():
        return url
    logger.warning("Rejected OAuth browser redirect for disallowed host")
    return default


def _redirect_with_reason(base: str, key: str, value: str) -> str:
    parsed = urllib.parse.urlparse(base)
    pairs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    pairs = [(k, v) for k, v in pairs if k != key]
    pairs.append((key, value))
    new_query = urllib.parse.urlencode(pairs)
    return urllib.parse.urlunparse(parsed._replace(query=new_query))


REDIRECT_URI = os.environ.get(
    "GMAIL_OAUTH_REDIRECT_URI",
    "http://127.0.0.1:8000/api/gmail/oauth/callback",
)
FRONTEND_OK = _validated_browser_redirect(
    os.environ.get("GMAIL_OAUTH_SUCCESS_REDIRECT"),
    _DEFAULT_FRONTEND_OK,
)
FRONTEND_ERR = _validated_browser_redirect(
    os.environ.get("GMAIL_OAUTH_ERROR_REDIRECT"),
    _DEFAULT_FRONTEND_ERR,
)

GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    return verifier, challenge


@router.get("/status")
def gmail_status(db: Session = Depends(get_db)):
    client_id = bool(os.environ.get("GOOGLE_OAUTH_CLIENT_ID"))
    row = db.query(OAuthCredential).filter(OAuthCredential.provider == "google_gmail").first()
    s = db.query(Settings).first()
    last = s.last_gmail_sync.isoformat() if s and s.last_gmail_sync else None
    return {
        "configured": client_id,
        "connected": row is not None,
        "last_sync": last,
    }


@router.post("/auth/start")
def gmail_auth_start(db: Session = Depends(get_db)):
    if not os.environ.get("GOOGLE_OAUTH_CLIENT_ID"):
        raise HTTPException(
            status_code=503,
            detail="Gmail is not configured (set GOOGLE_OAUTH_CLIENT_ID).",
        )
    verifier, challenge = _pkce_pair()
    state = secrets.token_urlsafe(32)
    cutoff = datetime.utcnow() - timedelta(hours=1)
    db.query(OAuthPending).filter(OAuthPending.created_at < cutoff).delete(synchronize_session=False)
    db.merge(OAuthPending(state=state, code_verifier=verifier))
    db.commit()
    client_id = os.environ["GOOGLE_OAUTH_CLIENT_ID"]
    params = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": REDIRECT_URI,
            "response_type": "code",
            "scope": GMAIL_SCOPE,
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "access_type": "offline",
            "prompt": "consent",
        }
    )
    return {"auth_url": f"https://accounts.google.com/o/oauth2/v2/auth?{params}"}


@router.get("/oauth/callback")
def gmail_oauth_callback(
    code: str,
    state: str,
    db: Session = Depends(get_db),
):
    pending = db.query(OAuthPending).filter(OAuthPending.state == state).first()
    if not pending:
        return RedirectResponse(FRONTEND_ERR)
    verifier = pending.code_verifier
    db.delete(pending)
    db.commit()

    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
    if not client_id:
        return RedirectResponse(FRONTEND_ERR)
    client_secret = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET") or ""
    data = urllib.parse.urlencode(
        {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": REDIRECT_URI,
            "grant_type": "authorization_code",
            "code_verifier": verifier,
        }
    ).encode()
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=data,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            tok = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        logger.warning("OAuth token exchange failed: %s", e.read())
        return RedirectResponse(FRONTEND_ERR)

    refresh = tok.get("refresh_token")
    if not refresh:
        return RedirectResponse(
            _redirect_with_reason(FRONTEND_ERR, "reason", "no_refresh"),
        )

    access = tok.get("access_token")
    expires_in = int(tok.get("expires_in", 3600))
    exp_at = datetime.utcnow() + timedelta(seconds=expires_in)

    row = db.query(OAuthCredential).filter(OAuthCredential.provider == "google_gmail").first()
    if row:
        db.delete(row)
        db.commit()

    db.add(
        OAuthCredential(
            provider="google_gmail",
            encrypted_refresh_token=encrypt_secret(refresh),
            encrypted_access_token=encrypt_secret(access) if access else None,
            access_token_expires_at=exp_at,
        )
    )
    db.commit()
    return RedirectResponse(FRONTEND_OK)


@router.post("/disconnect")
def gmail_disconnect(db: Session = Depends(get_db)):
    row = db.query(OAuthCredential).filter(OAuthCredential.provider == "google_gmail").first()
    if row:
        db.delete(row)
        db.commit()
    return {"status": "ok"}


@router.post("/sync")
def gmail_sync_now(db: Session = Depends(get_db)):
    result = gmail_sync.run_gmail_sync(db, force=True)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message", "sync failed"))
    return result
