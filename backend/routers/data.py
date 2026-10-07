import os
import shutil
import tempfile
import zipfile
import csv
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
import pyzipper

from backend.models.database import DATA_DIR, UPLOADS_DIR, engine, DATABASE_URL
from backend.models.models import Settings

router = APIRouter(tags=["data"])

def cleanup_tmp(path: str):
    try:
        shutil.rmtree(path, ignore_errors=True)
    except Exception:
        pass

def check_csv_safe(filepath: Path) -> bool:
    """Basic check to prevent CSV injection by scanning for malicious prefixes."""
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            reader = csv.reader(f)
            for row in reader:
                for cell in row:
                    cell_stripped = cell.strip()
                    import re
                    if cell_stripped.startswith(('=', '@')):
                        return False
                    if cell_stripped.startswith(('+', '-')):
                        if not re.match(r'^[+-]?\s*\d*\.?\d+$', cell_stripped):
                            return False
        return True
    except Exception:
        return False

@router.post("/data/export")
def export_data(background_tasks: BackgroundTasks, password: Optional[str] = Form(None)):
    """Export tuesday.db and uploads directory as a ZIP, optionally AES encrypted."""
    tmp_dir = tempfile.mkdtemp()
    background_tasks.add_task(cleanup_tmp, tmp_dir)
    zip_path = Path(tmp_dir) / "burnrate_backup.zip"
    
    if password:
        zf = pyzipper.AESZipFile(zip_path, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES)
        zf.setpassword(password.encode('utf-8'))
    else:
        zf = zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED)
        
    with zf:
        db_file = DATA_DIR / "tuesday.db"
        if db_file.exists():
            zf.write(db_file, "tuesday.db")
            
        if UPLOADS_DIR.exists():
            for root, _, files in os.walk(UPLOADS_DIR):
                for f in files:
                    file_path = Path(root) / f
                    arcname = Path("statements") / file_path.relative_to(UPLOADS_DIR)
                    zf.write(file_path, str(arcname))
                    
    return FileResponse(
        path=zip_path, 
        filename="burnrate_backup.zip", 
        media_type="application/zip"
    )

@router.post("/data/import")
def import_data(request: Request, file: UploadFile = File(...), password: Optional[str] = Form(None)):
    """Import a ZIP backup containing tuesday.db and optional statements/."""
    origin = request.headers.get("origin") or request.headers.get("referer") or ""
    if origin and not origin.lower().startswith(("http://localhost", "http://127.0.0.1", "tauri://localhost")):
        raise HTTPException(status_code=403, detail="Cross-Site Request Forgery attempt detected")
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Must be a .zip file")
        
    tmp_dir = tempfile.mkdtemp()
    try:
        MAX_EXTRACT_SIZE = 1024 * 1024 * 1024 # 1 GB
        total_extracted_size = [0]
        
        def copy_with_limit(src, dst, initial_chunk=None):
            if initial_chunk:
                total_extracted_size[0] += len(initial_chunk)
                if total_extracted_size[0] > MAX_EXTRACT_SIZE:
                    raise HTTPException(status_code=400, detail="Zip bomb detected: Extraction size exceeds 1GB limit")
                dst.write(initial_chunk)
                
            while True:
                chunk = src.read(64 * 1024)
                if not chunk:
                    break
                total_extracted_size[0] += len(chunk)
                if total_extracted_size[0] > MAX_EXTRACT_SIZE:
                    raise HTTPException(status_code=400, detail="Zip bomb detected: Extraction size exceeds 1GB limit")
                dst.write(chunk)

        upload_path = Path(tmp_dir) / "uploaded.zip"
        with open(upload_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
            
        # 1. Validate ZIP before extraction
        with pyzipper.AESZipFile(upload_path, 'r') as zf:
            if password:
                zf.setpassword(password.encode('utf-8'))
            
            namelist = zf.namelist()
            if "tuesday.db" not in namelist and "burnrate.db" not in namelist:
                raise HTTPException(status_code=400, detail="Missing database (tuesday.db) in backup")
                
            for name in namelist:
                if name.endswith("/"):
                    continue
                # Zip Slip Prevention
                if ".." in name or name.startswith("/"):
                    raise HTTPException(status_code=400, detail=f"Invalid path in zip: {name}")
                
            # 2. Extract strictly allowed files
            extract_dir = Path(tmp_dir) / "extracted"
            extract_dir.mkdir()
            
            for name in namelist:
                if name.endswith("/"): continue
                if ".." in name or name.startswith("/"): continue
                
                try:
                    # Strict allowlist
                    if name in ["tuesday.db", "burnrate.db"]:
                        target_path = extract_dir / "tuesday.db"
                        with zf.open(name) as sf, open(target_path, "wb") as df:
                            header = sf.read(16)
                            # Magic Bytes for SQLite
                            if header != b"SQLite format 3\x00":
                                raise HTTPException(status_code=400, detail="Invalid database file format")
                            copy_with_limit(sf, df, initial_chunk=header)
                            
                    elif name.startswith("statements/"):
                        ext = os.path.splitext(name)[1].lower()
                        if ext in [".pdf", ".csv"]:
                            target_path = extract_dir / name
                            target_path.parent.mkdir(parents=True, exist_ok=True)
                            with zf.open(name) as sf, open(target_path, "wb") as df:
                                if ext == ".pdf":
                                    header = sf.read(5)
                                    # Magic Bytes for PDF
                                    if not header.startswith(b"%PDF-"):
                                        continue # Skip invalid pdfs
                                    copy_with_limit(sf, df, initial_chunk=header)
                                else:
                                    copy_with_limit(sf, df)
                            
                            # CSV Injection prevention check
                            if ext == ".csv":
                                if not check_csv_safe(target_path):
                                    raise HTTPException(status_code=400, detail="Malicious CSV content detected (CSV Injection)")
                except RuntimeError as e:
                    if 'password' in str(e).lower() or 'bad password' in str(e).lower():
                        raise HTTPException(status_code=400, detail="Invalid or missing password for encrypted backup")
                    raise

        if not (extract_dir / "tuesday.db").exists():
            raise HTTPException(status_code=400, detail="Valid database file not found in archive")
            
        # 3. Backup current state
        backup_dir = DATA_DIR.parent / "data.backup"
        if backup_dir.exists():
            shutil.rmtree(backup_dir, ignore_errors=True)
        shutil.copytree(DATA_DIR, backup_dir)
        
        # 4. Replace DB and Statements with Rollback safety
        try:
            # Dispose engine to close active DB connections
            engine.dispose()
            
            db_file = DATA_DIR / "tuesday.db"
            wal_file = DATA_DIR / "tuesday.db-wal"
            shm_file = DATA_DIR / "tuesday.db-shm"
            
            if db_file.exists(): os.remove(db_file)
            if wal_file.exists(): os.remove(wal_file)
            if shm_file.exists(): os.remove(shm_file)
            
            shutil.copy(extract_dir / "tuesday.db", db_file)
            
            extracted_statements = extract_dir / "statements"
            if extracted_statements.exists():
                if UPLOADS_DIR.exists():
                    shutil.rmtree(UPLOADS_DIR, ignore_errors=True)
                shutil.copytree(extracted_statements, UPLOADS_DIR)
                
            # 5. Check and clear watch_folder if missing
            tmp_engine = create_engine(DATABASE_URL)
            Session = sessionmaker(bind=tmp_engine)
            with Session() as session:
                settings = session.query(Settings).first()
                if settings and settings.watch_folder:
                    if not os.path.exists(settings.watch_folder):
                        settings.watch_folder = None
                        session.commit()
            tmp_engine.dispose()
            
        except Exception as e:
            # Rollback to backup
            import logging
            logging.getLogger(__name__).error("Import failed during replacement, rolling back to backup...")
            db_file = DATA_DIR / "tuesday.db"
            if db_file.exists(): os.remove(db_file)
            
            backup_db = backup_dir / "tuesday.db"
            if backup_db.exists():
                shutil.copy(backup_db, db_file)
                
            if UPLOADS_DIR.exists():
                shutil.rmtree(UPLOADS_DIR, ignore_errors=True)
            backup_statements = backup_dir / "statements"
            if backup_statements.exists():
                shutil.copytree(backup_statements, UPLOADS_DIR)
                
            raise HTTPException(status_code=500, detail="Import failed. Database rolled back to previous state.") from e
        
        return {"status": "success", "message": "Data imported successfully"}
    except Exception as e:
        # Re-raise HTTPExceptions
        if isinstance(e, HTTPException):
            raise
        import logging
        logging.getLogger(__name__).exception("Import failed")
        raise HTTPException(status_code=500, detail="Import failed. The backend might need restarting.")
    finally:
        cleanup_tmp(tmp_dir)
