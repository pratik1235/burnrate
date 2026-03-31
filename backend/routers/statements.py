"""Statement API endpoints."""

import concurrent.futures
import os
from pathlib import Path, PurePosixPath
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB per file

from backend.models.database import SessionLocal, UPLOADS_DIR, get_db
from backend.models.models import ProcessingLog, Statement, Transaction

router = APIRouter(prefix="/statements", tags=["statements"])


ALLOWED_EXTENSIONS = {".pdf", ".csv"}


def _get_file_ext(filename: str) -> str:
    return os.path.splitext(filename.lower())[1]


@router.post("/upload")
def upload_statement(
    file: UploadFile = File(...),
    bank: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
    source: Optional[str] = Form("CC"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Accept a single PDF or CSV file upload with optional bank, password, and source params."""
    from backend.services.statement_processor import process_statement

    if not file.filename:
        raise HTTPException(status_code=400, detail="File required")

    ext = _get_file_ext(file.filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="PDF or CSV file required")

    basename = PurePosixPath(file.filename).name or f"upload{ext}"
    safe_name = f"{uuid4().hex}_{basename}"
    persistent_path = str(UPLOADS_DIR / safe_name)
    content = file.file.read(MAX_UPLOAD_SIZE + 1)
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")
    with open(persistent_path, "wb") as f:
        f.write(content)

    stmt_source = (source or "CC").upper()
    if stmt_source not in ("CC", "BANK"):
        stmt_source = "CC"

    result = process_statement(
        pdf_path=persistent_path,
        bank=bank.lower() if bank else None,
        db_session=db,
        manual_password=password,
        source=stmt_source,
    )
    return result


@router.post("/upload-bulk")
async def upload_bulk(
    files: List[UploadFile] = File(...),
    bank: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
    source: Optional[str] = Form("CC"),
) -> Dict[str, Any]:
    """Accept multiple PDF/CSV files. Files are queued and processed with
    max 10 concurrently via the shared processing pool."""
    from backend.services import processing_queue

    saved: List[str] = []
    skipped: List[str] = []

    for f in files:
        if not f.filename:
            skipped.append("<unknown>")
            continue
        ext = _get_file_ext(f.filename)
        if ext not in ALLOWED_EXTENSIONS:
            skipped.append(f.filename)
            continue
        basename = PurePosixPath(f.filename).name or f"upload{ext}"
        safe_name = f"{uuid4().hex}_{basename}"
        persistent_path = str(UPLOADS_DIR / safe_name)
        content = await f.read()
        if len(content) > MAX_UPLOAD_SIZE:
            skipped.append(f.filename)
            continue
        with open(persistent_path, "wb") as out:
            out.write(content)
        saved.append(persistent_path)

    if not saved:
        raise HTTPException(status_code=400, detail="No valid PDF or CSV files provided")

    stmt_source = (source or "CC").upper()
    if stmt_source not in ("CC", "BANK"):
        stmt_source = "CC"

    bank_lower = bank.lower() if bank else None
    futures = [
        processing_queue.submit(
            pdf_path=path,
            bank=bank_lower,
            manual_password=password,
            source=stmt_source,
        )
        for path in saved
    ]

    results = {
        "total": len(saved), "success": 0, "failed": 0,
        "duplicate": 0, "card_not_found": 0, "parse_error": 0,
        "password_needed": 0,
        "skipped": len(skipped),
    }
    for future in concurrent.futures.as_completed(futures):
        try:
            result = future.result()
            status = result.get("status", "error")
            if status == "success":
                results["success"] += 1
            elif status == "duplicate":
                results["duplicate"] += 1
            elif status == "card_not_found":
                results["card_not_found"] += 1
            elif status == "parse_error":
                results["parse_error"] += 1
            elif status == "password_needed":
                results["password_needed"] += 1
            else:
                results["failed"] += 1
        except Exception:
            results["failed"] += 1

    return {"status": "ok", **results}


def _process_one_statement(
    file_path: str, bank: Optional[str], source: str = "CC",
) -> Dict[str, Any]:
    """Process a single statement file in a worker thread."""
    from backend.services.statement_processor import process_statement

    session = SessionLocal()
    try:
        return process_statement(
            pdf_path=file_path, bank=bank, db_session=session, source=source,
        )
    finally:
        session.close()


@router.post("/reparse-all")
def reparse_all_statements(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Queue all statements for reparsing with max 10 concurrent."""
    stmts = db.query(Statement).all()
    if not stmts:
        return {"status": "ok", "total": 0, "queued": 0, "skipped": 0}

    results = {"total": len(stmts), "success": 0, "failed": 0, "skipped": 0}

    valid_entries = [
        (s.file_path, s.bank, getattr(s, "source", None) or "CC")
        for s in stmts
        if s.file_path and os.path.isfile(s.file_path)
    ]

    for stmt in stmts:
        if not stmt.file_path or not os.path.isfile(stmt.file_path):
            results["skipped"] += 1
            continue
        db.delete(stmt)
    db.commit()

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = {
            executor.submit(_process_one_statement, path, bank, source): path
            for path, bank, source in valid_entries
        }
        for future in concurrent.futures.as_completed(futures):
            try:
                result = future.result()
                if result.get("status") == "success":
                    results["success"] += 1
                else:
                    results["failed"] += 1
            except Exception:
                results["failed"] += 1

    return {"status": "ok", **results}


@router.get("")
def list_statements(
    source: Optional[str] = Query(None, description="Filter by source: CC or BANK"),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """List all imported statements, optionally filtered by source."""
    q = db.query(Statement).order_by(Statement.imported_at.desc())
    if source:
        q = q.filter(Statement.source == source.upper())
    statements = q.all()
    return [
        {
            "id": s.id,
            "bank": s.bank,
            "card_last4": s.card_last4,
            "period_start": s.period_start.isoformat() if s.period_start else None,
            "period_end": s.period_end.isoformat() if s.period_end else None,
            "transaction_count": s.transaction_count,
            "total_spend": s.total_spend,
            "total_amount_due": s.total_amount_due,
            "credit_limit": s.credit_limit,
            "source": getattr(s, "source", None) or "CC",
            "status": getattr(s, "status", None) or "success",
            "imported_at": s.imported_at.isoformat() if s.imported_at else None,
        }
        for s in statements
    ]


@router.get("/processing-logs")
def get_processing_logs(
    unread_only: bool = True,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Return recent processing logs for frontend polling."""
    q = db.query(ProcessingLog).order_by(ProcessingLog.created_at.desc())
    if unread_only:
        q = q.filter(ProcessingLog.acknowledged == 0)
    logs = q.limit(20).all()
    return [
        {
            "id": log.id,
            "fileName": log.file_name,
            "status": log.status,
            "message": log.message,
            "bank": log.bank,
            "transactionCount": log.transaction_count,
            "createdAt": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]


@router.post("/processing-logs/{log_id}/ack")
def acknowledge_log(log_id: str, db: Session = Depends(get_db)) -> Dict[str, str]:
    """Mark a processing log as acknowledged so it doesn't show again."""
    log = db.query(ProcessingLog).filter(ProcessingLog.id == log_id).first()
    if log:
        log.acknowledged = 1
        db.commit()
    return {"status": "ok"}


@router.delete("/{statement_id}")
def delete_statement(statement_id: str, db: Session = Depends(get_db)) -> Dict[str, str]:
    """Delete a statement and cascade to its transactions and their tags."""
    stmt = db.query(Statement).filter(Statement.id == statement_id).first()
    if not stmt:
        raise HTTPException(status_code=404, detail="Statement not found")
    db.delete(stmt)
    db.commit()
    return {"status": "ok", "message": "Statement and transactions deleted"}


class ReparseWithPasswordPayload(BaseModel):
    password: str


@router.post("/{statement_id}/reparse-with-password")
def reparse_with_password(
    statement_id: str,
    payload: ReparseWithPasswordPayload,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Reparse a statement that failed due to password, using a user-provided password."""
    stmt = db.query(Statement).filter(Statement.id == statement_id).first()
    if not stmt:
        raise HTTPException(status_code=404, detail="Statement not found")

    file_path = stmt.file_path
    if not file_path or not os.path.isfile(file_path):
        raise HTTPException(status_code=400, detail="Original file not found on disk")

    from backend.services.statement_processor import process_statement

    stmt_source = getattr(stmt, "source", None) or "CC"
    db.delete(stmt)
    db.commit()

    result = process_statement(
        pdf_path=file_path,
        db_session=db,
        manual_password=payload.password,
        source=stmt_source,
    )
    return result


@router.post("/{statement_id}/reparse")
def reparse_statement(statement_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Reparse a statement from its stored file_path."""
    stmt = db.query(Statement).filter(Statement.id == statement_id).first()
    if not stmt:
        raise HTTPException(status_code=404, detail="Statement not found")

    file_path = stmt.file_path
    if not file_path or not os.path.isfile(file_path):
        detail = (
            "Original file not found on disk. "
            "This can happen if the statement was uploaded via the API before "
            "persistent file storage was enabled, or if the source file was moved/deleted."
        )
        raise HTTPException(status_code=400, detail=detail)

    from backend.services.statement_processor import process_statement

    stmt_source = getattr(stmt, "source", None) or "CC"
    stmt_bank = stmt.bank
    db.delete(stmt)
    db.commit()

    result = process_statement(
        pdf_path=file_path,
        bank=stmt_bank,
        db_session=db,
        source=stmt_source,
    )
    return result
