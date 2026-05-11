"""Statement API endpoints."""

import concurrent.futures
import json
import logging
import os
import platform
import re
import subprocess
from datetime import date
from enum import Enum
from pathlib import Path, PurePosixPath
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import or_
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB per file

from backend.models.database import SessionLocal, UPLOADS_DIR, get_db
from backend.models.models import ProcessingLog, Statement, Transaction

router = APIRouter(prefix="/statements", tags=["statements"])


ALLOWED_EXTENSIONS = {".pdf", ".csv"}


class BulkRejectReason(str, Enum):
    """Why a multipart file was not queued for processing."""

    missing_filename = "missing_filename"
    invalid_type = "invalid_type"
    file_too_large = "file_too_large"


class BulkRejectedItem(BaseModel):
    """Pre-queue rejection (validation before save)."""

    file_name: str
    reason: BulkRejectReason


class BulkOutcomeItem(BaseModel):
    """Result for one queued file (order follows pool completion)."""

    file_name: str
    status: str
    message: Optional[str] = None


class BulkUploadResponse(BaseModel):
    """Response for POST /statements/upload-bulk."""

    status: str = "ok"
    input_total: int
    total: int = Field(description="Files queued for processing")
    success: int = 0
    failed: int = 0
    duplicate: int = 0
    card_not_found: int = 0
    parse_error: int = 0
    password_needed: int = 0
    skipped: int = Field(description="Count of pre-queue rejections; equals len(rejected)")
    rejected: List[BulkRejectedItem] = Field(default_factory=list)
    outcomes: List[BulkOutcomeItem] = Field(default_factory=list)


ORIGINAL_PATH_MAX_LEN = 2048
_UUID_FILENAME_PREFIX = re.compile(r"^[0-9a-fA-F]{32}_")


def _normalize_original_path(raw: Optional[str]) -> Optional[str]:
    if not raw or not isinstance(raw, str):
        return None
    s = raw.strip()
    if not s:
        return None
    return s[:ORIGINAL_PATH_MAX_LEN]


def _coerce_original_upload_path(raw: Optional[str], persistent_path: str) -> Optional[str]:
    """Drop client-reported original path when it is the same file as the persisted upload copy."""
    norm = _normalize_original_path(raw)
    if not norm:
        return None
    try:
        if Path(norm).resolve() == Path(persistent_path).resolve():
            return None
    except OSError:
        pass
    return norm


def _parse_original_paths_for_files(raw: Optional[str], num_files: int) -> List[Optional[str]]:
    if not raw or not str(raw).strip() or num_files <= 0:
        return [None] * num_files
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return [None] * num_files
    if not isinstance(data, list) or len(data) != num_files:
        return [None] * num_files
    out: List[Optional[str]] = []
    for item in data:
        if item is None:
            out.append(None)
        elif isinstance(item, str):
            out.append(_normalize_original_path(item))
        else:
            return [None] * num_files
    return out


def statement_display_path(
    file_path: Optional[str],
    original_upload_path: Optional[str],
) -> Optional[str]:
    """Path string suitable for UI: client path for manual uploads, else watch path or basename."""
    ou = (original_upload_path or "").strip()
    if ou:
        return ou
    if not file_path:
        return None
    try:
        p = Path(file_path).resolve()
        uploads = UPLOADS_DIR.resolve()
        if p.parent == uploads:
            name = p.name
            m = _UUID_FILENAME_PREFIX.match(name)
            if m:
                return name[m.end() :]
            return name
    except OSError:
        pass
    return file_path


def _get_file_ext(filename: str) -> str:
    return os.path.splitext(filename.lower())[1]


@router.post("/upload")
def upload_statement(
    file: UploadFile = File(...),
    bank: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
    source: Optional[str] = Form("CC"),
    original_path: Optional[str] = Form(None),
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
        original_upload_path=_coerce_original_upload_path(original_path, persistent_path),
    )
    return result


@router.post("/upload-bulk", response_model=BulkUploadResponse)
async def upload_bulk(
    files: List[UploadFile] = File(...),
    bank: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
    source: Optional[str] = Form("CC"),
    original_paths: Optional[str] = Form(None),
) -> BulkUploadResponse:
    """Accept multiple PDF/CSV files. Files are queued and processed with
    max 10 concurrently via the shared processing pool."""
    from backend.services import processing_queue

    input_total = len(files)
    rejected: List[BulkRejectedItem] = []
    jobs: List[tuple[str, str, Optional[str]]] = []
    path_by_index = _parse_original_paths_for_files(original_paths, input_total)

    for idx, f in enumerate(files):
        if not f.filename:
            rejected.append(
                BulkRejectedItem(file_name="unknown", reason=BulkRejectReason.missing_filename)
            )
            continue
        display_name = PurePosixPath(f.filename).name or "unknown"
        ext = _get_file_ext(f.filename)
        if ext not in ALLOWED_EXTENSIONS:
            rejected.append(
                BulkRejectedItem(file_name=display_name, reason=BulkRejectReason.invalid_type)
            )
            continue
        basename = display_name or f"upload{ext}"
        safe_name = f"{uuid4().hex}_{basename}"
        persistent_path = str(UPLOADS_DIR / safe_name)
        content = await f.read()
        if len(content) > MAX_UPLOAD_SIZE:
            rejected.append(
                BulkRejectedItem(file_name=display_name, reason=BulkRejectReason.file_too_large)
            )
            continue
        with open(persistent_path, "wb") as out:
            out.write(content)
        jobs.append((persistent_path, display_name, path_by_index[idx]))

    if not jobs:
        raise HTTPException(status_code=400, detail="No valid PDF or CSV files provided")

    stmt_source = (source or "CC").upper()
    if stmt_source not in ("CC", "BANK"):
        stmt_source = "CC"

    bank_lower = bank.lower() if bank else None
    future_to_name: Dict[concurrent.futures.Future, str] = {}
    for path, display_name, orig_upload in jobs:
        fut = processing_queue.submit(
            pdf_path=path,
            bank=bank_lower,
            manual_password=password,
            source=stmt_source,
            original_upload_path=_coerce_original_upload_path(orig_upload, path),
        )
        future_to_name[fut] = display_name

    results = {
        "total": len(jobs),
        "success": 0,
        "failed": 0,
        "duplicate": 0,
        "card_not_found": 0,
        "parse_error": 0,
        "password_needed": 0,
    }
    outcomes: List[BulkOutcomeItem] = []

    for future in concurrent.futures.as_completed(future_to_name):
        display_name = future_to_name[future]
        try:
            result = future.result()
            status = result.get("status", "error")
            msg = result.get("message")
            if isinstance(msg, str):
                msg = msg.strip() or None
            else:
                msg = None
            outcomes.append(
                BulkOutcomeItem(file_name=display_name, status=status, message=msg)
            )
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
            logger.exception("Bulk upload processing failed for file=%s", display_name)
            outcomes.append(
                BulkOutcomeItem(
                    file_name=display_name,
                    status="error",
                    message="Processing failed",
                )
            )
            results["failed"] += 1

    return BulkUploadResponse(
        status="ok",
        input_total=input_total,
        total=results["total"],
        success=results["success"],
        failed=results["failed"],
        duplicate=results["duplicate"],
        card_not_found=results["card_not_found"],
        parse_error=results["parse_error"],
        password_needed=results["password_needed"],
        skipped=len(rejected),
        rejected=rejected,
        outcomes=outcomes,
    )


def _process_one_statement(
    statement_id: str, file_path: str, bank: Optional[str], source: str = "CC", original_upload_path: Optional[str] = None, override_manual: bool = False
) -> Dict[str, Any]:
    """Process a single statement file in a worker thread."""
    from backend.services.statement_processor import process_statement

    session = SessionLocal()
    try:
        stmt = session.query(Statement).filter(Statement.id == statement_id).first()
        preserved_manual_categories = {}
        if stmt:
            if not override_manual:
                for tx in stmt.transactions:
                    if getattr(tx, "is_manually_categorized", 0) == 1:
                        key = f"{tx.date.isoformat()}_{tx.merchant}_{float(tx.amount):.2f}_{tx.type}"
                        if key not in preserved_manual_categories:
                            preserved_manual_categories[key] = []
                        preserved_manual_categories[key].append(tx.category)
            session.delete(stmt)
            
        result = process_statement(
            pdf_path=file_path, bank=bank, db_session=session, source=source,
            original_upload_path=original_upload_path, reparse_mode=True,
            preserved_manual_categories=preserved_manual_categories,
        )
        
        if result.get("status") != "success":
            session.rollback()
            
        return result
    finally:
        session.close()


class ReparseAllPayload(BaseModel):
    override_manual: bool = False

@router.post("/reparse-all")
def reparse_all_statements(payload: Optional[ReparseAllPayload] = None, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Queue all statements for reparsing with max 10 concurrent."""
    override_manual = payload.override_manual if payload else False
    stmts = db.query(Statement).all()
    if not stmts:
        return {"status": "ok", "total": 0, "queued": 0, "skipped": 0}

    results = {"total": len(stmts), "success": 0, "failed": 0, "skipped": 0}

    valid_entries = [
        (s.id, s.file_path, s.bank, getattr(s, "source", None) or "CC", getattr(s, "original_upload_path", None))
        for s in stmts
        if s.file_path and os.path.isfile(s.file_path)
    ]

    results["skipped"] = len(stmts) - len(valid_entries)

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = {
            executor.submit(_process_one_statement, sid, path, bank, source, orig, override_manual): path
            for sid, path, bank, source, orig in valid_entries
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
    banks: Optional[str] = Query(
        None,
        description="Comma-separated bank slugs (e.g. hdfc,icici)",
    ),
    from_date: Optional[date] = Query(None, alias="from", description="Filter by period overlap"),
    to_date: Optional[date] = Query(None, alias="to"),
    parse_failed_only: Optional[bool] = Query(
        None,
        description="When true, only statements that failed to parse (could not extract data).",
    ),
    non_zero_txn_count: Optional[bool] = Query(
        None,
        description="When true, only return statements with transaction_count > 0.",
    ),
    search: Optional[str] = Query(None, description="Search text"),
    sort_by: Optional[str] = Query("default", description="Field to sort by"),
    sort_order: Optional[str] = Query("desc", description="Sort direction: asc or desc"),
    limit: Optional[int] = Query(None, description="Max statements to return"),
    offset: Optional[int] = Query(0, description="Offset for pagination"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """List all imported statements, optionally filtered by source, bank, date range, and parse outcome."""
    q = db.query(Statement)
    if source:
        q = q.filter(Statement.source == source.upper())
    if banks and banks.strip():
        bank_list = [b.strip().lower() for b in banks.split(",") if b.strip()]
        if bank_list:
            q = q.filter(Statement.bank.in_(bank_list))
    if from_date:
        q = q.filter(
            or_(Statement.period_end.is_(None), Statement.period_end >= from_date)
        )
    if to_date:
        q = q.filter(
            or_(Statement.period_start.is_(None), Statement.period_start <= to_date)
        )
    if parse_failed_only is True:
        q = q.filter(Statement.parse_failed == 1)
    if non_zero_txn_count is True:
        q = q.filter(Statement.transaction_count > 0)
        
    if search:
        search_term = f"%{search}%"
        q = q.filter(
            or_(
                Statement.bank.ilike(search_term),
                Statement.card_last4.ilike(search_term),
                Statement.source.ilike(search_term),
                Statement.file_path.ilike(search_term),
                Statement.original_upload_path.ilike(search_term),
                Statement.status.ilike(search_term),
                Statement.status_message.ilike(search_term),
            )
        )
        
    total = q.count()

    from sqlalchemy import case, desc, asc, func
    from decimal import Decimal, ROUND_HALF_UP

    filtered_ids = q.with_entities(Statement.id)
    by_cur = (
        db.query(
            Statement.currency,
            func.sum(Statement.total_amount_due).label("sum_amt")
        )
        .filter(Statement.id.in_(filtered_ids))
        .group_by(Statement.currency)
        .all()
    )

    totals_by_currency = []
    for r in by_cur:
        amt = float(Decimal(str(r.sum_amt or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        totals_by_currency.append({
            "currency": (r.currency or "INR").upper()[:3],
            "amount": amt,
        })
    totals_by_currency.sort(key=lambda x: x["currency"])

    if len(totals_by_currency) == 0:
        total_amount = 0.0
    elif len(totals_by_currency) == 1:
        total_amount = totals_by_currency[0]["amount"]
    else:
        total_amount = None

    priority_expr = case(
        (Statement.status == 'password_needed', 0),
        (Statement.status == 'parse_error', 1),
        else_=2
    )
    
    order_func = desc if sort_order == "desc" else asc
    
    if sort_by == "amount_due":
        q = q.order_by(priority_expr, order_func(Statement.total_amount_due).nullslast())
    elif sort_by == "due_date":
        q = q.order_by(priority_expr, order_func(Statement.payment_due_date).nullslast())
    elif sort_by == "txn_count":
        q = q.order_by(priority_expr, order_func(Statement.transaction_count))
    else:
        q = q.order_by(priority_expr, desc(Statement.imported_at))
        
    if limit is not None:
        q = q.limit(limit)
    if offset is not None:
        q = q.offset(offset)

    statements = q.all()
    out: List[Dict[str, Any]] = []
    for s in statements:
        fp = s.file_path
        orig = getattr(s, "original_upload_path", None)
        out.append(
            {
                "id": s.id,
                "bank": s.bank,
                "card_last4": s.card_last4,
                "period_start": s.period_start.isoformat() if s.period_start else None,
                "period_end": s.period_end.isoformat() if s.period_end else None,
                "transaction_count": s.transaction_count,
                "total_spend": s.total_spend,
                "total_amount_due": s.total_amount_due,
                "payment_due_date": s.payment_due_date.isoformat() if getattr(s, "payment_due_date", None) else None,
                "credit_limit": s.credit_limit,
                "currency": (getattr(s, "currency", None) or "INR").upper()[:3],
                "source": getattr(s, "source", None) or "CC",
                "status": getattr(s, "status", None) or "success",
                "parse_failed": int(getattr(s, "parse_failed", 0) or 0),
                "imported_at": s.imported_at.isoformat() if s.imported_at else None,
                "file_path": fp,
                "file_name": os.path.basename(fp) if fp else None,
                "display_path": statement_display_path(fp, orig),
                "original_upload_path": orig,
                "status_message": getattr(s, "status_message", None),
            }
        )
    return {
        "statements": out,
        "total": total,
        "totalAmountDue": total_amount,
        "totalsByCurrency": totals_by_currency,
        "mixedCurrency": len(totals_by_currency) > 1,
    }


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
        
    file_hash = stmt.file_hash
        
    db.delete(stmt)
    db.commit()
    
    other_stmt = db.query(Statement).filter(Statement.file_hash == file_hash).first()
    if not other_stmt:
        from backend.services.keychain import delete_statement_password
        delete_statement_password(file_hash)
        
    return {"status": "ok", "message": "Statement and transactions deleted"}


class ReparseWithPasswordPayload(BaseModel):
    password: str
    override_manual: bool = False

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
    preserved_orig = getattr(stmt, "original_upload_path", None)

    # Fetch manual categories before delete
    preserved_manual_categories = {}
    if not payload.override_manual:
        for tx in stmt.transactions:
            if getattr(tx, "is_manually_categorized", 0) == 1:
                key = f"{tx.date.isoformat()}_{tx.merchant}_{float(tx.amount):.2f}_{tx.type}"
                if key not in preserved_manual_categories:
                    preserved_manual_categories[key] = []
                preserved_manual_categories[key].append(tx.category)

    db.delete(stmt)
    db.commit()

    result = process_statement(
        pdf_path=file_path,
        db_session=db,
        manual_password=payload.password,
        source=stmt_source,
        original_upload_path=preserved_orig,
        reparse_mode=True,
        preserved_manual_categories=preserved_manual_categories,
    )
    
    return result


@router.post("/{statement_id}/reparse")
def reparse_statement(
    statement_id: str,
    override_manual: bool = False,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
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
    preserved_orig = getattr(stmt, "original_upload_path", None)

    # Fetch manual categories before delete
    preserved_manual_categories = {}
    if not override_manual:
        for tx in stmt.transactions:
            if getattr(tx, "is_manually_categorized", 0) == 1:
                key = f"{tx.date.isoformat()}_{tx.merchant}_{float(tx.amount):.2f}_{tx.type}"
                if key not in preserved_manual_categories:
                    preserved_manual_categories[key] = []
                preserved_manual_categories[key].append(tx.category)

    db.delete(stmt)
    db.commit()

    result = process_statement(
        pdf_path=file_path,
        bank=stmt_bank,
        db_session=db,
        source=stmt_source,
        original_upload_path=preserved_orig,
        reparse_mode=True,
        preserved_manual_categories=preserved_manual_categories,
    )
    
    return result


@router.post("/{statement_id}/open")
def open_statement_file(statement_id: str, db: Session = Depends(get_db)) -> Dict[str, str]:
    """Open the statement file on the host device."""
    stmt = db.query(Statement).filter(Statement.id == statement_id).first()
    if not stmt:
        raise HTTPException(status_code=404, detail="Statement not found")

    file_path = getattr(stmt, "original_upload_path", None) or stmt.file_path
    if not file_path or not os.path.isfile(file_path):
        raise HTTPException(status_code=400, detail="File not found on disk")

    from backend.services.pdf_unlock import _validate_pdf_path, allowed_roots_for_statements
    if not _validate_pdf_path(file_path, allowed_roots_for_statements(db)):
        raise HTTPException(status_code=400, detail="File path is not within allowed directories")

    ext = _get_file_ext(file_path)
    if ext not in {".pdf", ".xls", ".xlsx", ".csv", ".txt"}:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    try:
        if platform.system() == "Darwin":
            subprocess.run(["open", file_path], check=True)
        elif platform.system() == "Windows":
            os.startfile(file_path)
        else:
            subprocess.run(["xdg-open", file_path], check=True)
        return {"status": "ok", "message": "File opened"}
    except Exception as e:
        logger.exception("Failed to open file: %s", file_path)
        raise HTTPException(status_code=500, detail=f"Failed to open file: {str(e)}")
