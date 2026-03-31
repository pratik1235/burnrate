"""Fetch statement attachments from Gmail and enqueue them for parsing."""

from __future__ import annotations

import base64
import logging
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session

from backend.models.database import UPLOADS_DIR
from backend.models.models import OAuthCredential, Settings
from backend.services import processing_queue
from backend.services.oauth_tokens import decrypt_secret, encrypt_secret

logger = logging.getLogger(__name__)

GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly"
MIN_AUTO_SYNC_SECONDS = 3600
MAX_MESSAGES_PER_SYNC = 40

_GMAIL_QUERY = (
    "has:attachment newer_than:120d "
    "(filename:pdf OR filename:csv OR filename:xlsx OR filename:xls) "
    "(subject:statement OR subject:e-statement OR subject:STMT OR subject:SOA OR "
    "subject:credit OR subject:card OR subject:account OR "
    "from:hdfcbank OR from:icicibank OR from:axisbank OR from:sbi OR from:hsbc OR "
    "from:kotak OR from:yesbank OR from:idfc)"
)

_ALLOWED_EXT = {".pdf", ".csv", ".xls", ".xlsx"}


def _iter_parts(part: dict) -> List[dict]:
    if part.get("parts"):
        out: List[dict] = []
        for c in part["parts"]:
            out.extend(_iter_parts(c))
        return out
    return [part]


def _source_for_suffix(suffix: str) -> str:
    return "BANK" if suffix == ".csv" else "CC"


def _credentials_from_row(row: OAuthCredential) -> Credentials:
    refresh = decrypt_secret(row.encrypted_refresh_token)
    access: Optional[str] = None
    if row.encrypted_access_token:
        access = decrypt_secret(row.encrypted_access_token)
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
    if not client_id:
        raise RuntimeError("GOOGLE_OAUTH_CLIENT_ID is not set")
    return Credentials(
        token=access,
        refresh_token=refresh,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET") or None,
        scopes=[GMAIL_READONLY],
    )


def _persist_token_refresh(db: Session, row: OAuthCredential, creds: Credentials) -> None:
    row.encrypted_access_token = encrypt_secret(creds.token) if creds.token else None
    if creds.expiry:
        row.access_token_expires_at = datetime.utcfromtimestamp(creds.expiry)
    else:
        row.access_token_expires_at = None
    db.commit()


def _save_attachments_for_message(service, msg_id: str, dest: Path) -> int:
    msg = service.users().messages().get(userId="me", id=msg_id, format="full").execute()
    payload = msg.get("payload") or {}
    n = 0
    for part in _iter_parts(payload):
        fn = part.get("filename") or ""
        if not fn:
            continue
        ext = Path(fn).suffix.lower()
        if ext not in _ALLOWED_EXT:
            continue
        body = part.get("body") or {}
        raw: Optional[bytes] = None
        if body.get("data"):
            raw = base64.urlsafe_b64decode(body["data"].encode())
        else:
            att_id = body.get("attachmentId")
            if not att_id:
                continue
            att = (
                service.users()
                .messages()
                .attachments()
                .get(userId="me", messageId=msg_id, id=att_id)
                .execute()
            )
            raw = base64.urlsafe_b64decode(att["data"].encode())
        if not raw:
            continue
        safe = re.sub(r"[^a-zA-Z0-9._-]+", "_", fn)[:120]
        out = dest / f"gmail_{msg_id[:12]}_{uuid.uuid4().hex[:8]}_{safe}"
        out.write_bytes(raw)
        processing_queue.submit(str(out.resolve()), source=_source_for_suffix(ext))
        n += 1
    return n


def run_gmail_sync(db: Session, *, force: bool = False) -> Dict[str, Any]:
    """List recent statement-like messages, save attachments, enqueue processing."""
    if not os.environ.get("GOOGLE_OAUTH_CLIENT_ID"):
        return {"status": "error", "message": "Gmail OAuth is not configured"}

    settings_row = db.query(Settings).first()
    if settings_row and settings_row.last_gmail_sync and not force:
        last = settings_row.last_gmail_sync
        if last.tzinfo is not None:
            last = last.replace(tzinfo=None)
        age = datetime.utcnow() - last
        if age.total_seconds() < MIN_AUTO_SYNC_SECONDS:
            return {
                "status": "skipped",
                "reason": "min_interval",
                "seconds_remaining": int(MIN_AUTO_SYNC_SECONDS - age.total_seconds()),
            }

    cred_row = db.query(OAuthCredential).filter(OAuthCredential.provider == "google_gmail").first()
    if not cred_row:
        return {"status": "error", "message": "Gmail is not connected"}

    try:
        creds = _credentials_from_row(cred_row)
    except Exception as e:
        logger.exception("Failed to build Gmail credentials")
        return {"status": "error", "message": str(e)}

    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            _persist_token_refresh(db, cred_row, creds)
        except Exception as e:
            logger.warning("Gmail token refresh failed: %s", e)
            return {"status": "error", "message": "Token refresh failed; reconnect Gmail."}

    dest = Path(settings_row.watch_folder).expanduser().resolve() if settings_row and settings_row.watch_folder else UPLOADS_DIR
    dest.mkdir(parents=True, exist_ok=True)

    try:
        service = build("gmail", "v1", credentials=creds, cache_discovery=False)
        lst = (
            service.users()
            .messages()
            .list(userId="me", q=_GMAIL_QUERY, maxResults=MAX_MESSAGES_PER_SYNC)
            .execute()
        )
        ids = [m["id"] for m in lst.get("messages", [])]
    except HttpError as e:
        logger.warning("Gmail API list failed: %s", e)
        return {"status": "error", "message": f"Gmail API error: {e}"}
    except Exception as e:
        logger.exception("Gmail sync failed")
        return {"status": "error", "message": str(e)}

    total = 0
    for mid in ids:
        try:
            total += _save_attachments_for_message(service, mid, dest)
        except HttpError as e:
            logger.warning("Skip message %s: %s", mid, e)
        except Exception:
            logger.exception("Failed message %s", mid)

    if settings_row:
        settings_row.last_gmail_sync = datetime.utcnow()
        db.commit()

    return {"status": "ok", "messages_scanned": len(ids), "attachments_queued": total}
