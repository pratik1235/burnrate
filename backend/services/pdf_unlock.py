"""PDF unlock service using pikepdf."""

import logging
from pathlib import Path
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def _path_is_under_any_root(path: Path, roots: Tuple[Path, ...]) -> bool:
    rp = path.resolve()
    for root in roots:
        try:
            rp.relative_to(root.resolve())
            return True
        except ValueError:
            continue
    return False


def allowed_roots_for_statements(db_session: Session) -> Tuple[Path, ...]:
    """Directories where statement PDF/CSV files may be read (uploads + watch folder)."""
    from backend.models.database import UPLOADS_DIR
    from backend.models.models import Settings

    ordered: list[Path] = [UPLOADS_DIR.resolve()]
    settings = db_session.query(Settings).first()
    if settings and settings.watch_folder:
        try:
            wf = Path(settings.watch_folder).expanduser().resolve()
            if wf not in ordered:
                ordered.append(wf)
        except OSError:
            pass
    return tuple(ordered)


def _validate_pdf_path(pdf_path: str, allowed_roots: Tuple[Path, ...]) -> bool:
    """
    Validate path to prevent traversal. Reject '..'; resolved file must lie under
    one of ``allowed_roots`` (typically uploads + configured watch folder).
    """
    if not pdf_path or ".." in pdf_path:
        return False
    try:
        resolved = Path(pdf_path).resolve()
        if not resolved.exists() or not resolved.is_file():
            return False
        return _path_is_under_any_root(resolved, allowed_roots)
    except (OSError, RuntimeError):
        return False

def generate_passwords(
    bank: str,
    name: str,
    dob_day: str,
    dob_month: str,
    card_last4s: List[str],
    dob_year: str = "",
) -> List[str]:
    """
    Generate password candidates based on bank format.
    Tries multiple known variations per bank.
    """
    passwords: List[str] = []
    seen: set = set()

    def _add(pwd: str) -> None:
        if pwd and pwd not in seen:
            seen.add(pwd)
            passwords.append(pwd)

    name4 = (name or "")[:4]
    first_name = (name or "").split()[0] if name else ""
    dd = f"{dob_day or '':0>2}"
    mm = f"{dob_month or '':0>2}"
    ddmm = dd + mm
    yyyy = dob_year or ""
    yy = yyyy[-2:] if len(yyyy) >= 2 else ""
    ddmmyyyy = ddmm + yyyy
    ddmmyy = ddmm + yy

    if bank.lower() == "hdfc":
        n4u = name4.upper()
        fnu = first_name.upper()
        # Common: NAME4 + DDMM
        _add(n4u + ddmm)
        # NAME4 + each card last4
        for last4 in card_last4s or []:
            if last4 and len(str(last4)) >= 4:
                _add(n4u + str(last4)[-4:])
        # Extended variants
        _add(fnu + ddmm)
        _add(n4u + ddmmyy)
        _add(n4u + ddmmyyyy)
        _add(fnu + ddmmyy)
        _add(fnu + ddmmyyyy)
        _add(ddmmyyyy)
        _add(ddmmyy)
        # lowercase variants
        _add(name4.lower() + ddmm)
        _add(first_name.lower() + ddmm)

    elif bank.lower() == "icici":
        n4l = name4.lower()
        fnl = first_name.lower()
        _add(n4l + ddmm)
        _add(fnl + ddmm)
        _add(n4l + ddmmyy)
        _add(fnl + ddmmyy)
        _add(n4l + ddmmyyyy)
        _add(ddmmyyyy)
        # uppercase variants
        _add(name4.upper() + ddmm)

    elif bank.lower() == "axis":
        n4u = name4.upper()
        fnu = first_name.upper()
        _add(n4u + ddmm)
        _add(fnu + ddmm)
        _add(n4u + ddmmyy)
        _add(n4u + ddmmyyyy)
        _add(ddmmyyyy)
        # lowercase
        _add(name4.lower() + ddmm)

    elif bank.lower() == "federal":
        # Federal Bank: typically NAME4 + DDMM or DDMMYYYY or card last4
        n4u = name4.upper()
        n4l = name4.lower()
        fnu = first_name.upper()
        fnl = first_name.lower()
        _add(n4u + ddmm)
        _add(fnu + ddmm)
        _add(n4u + ddmmyyyy)
        _add(fnu + ddmmyyyy)
        _add(n4l + ddmm)
        _add(fnl + ddmm)
        _add(ddmmyyyy)
        _add(ddmmyy)
        for last4 in card_last4s or []:
            if last4 and len(str(last4)) >= 4:
                _add(n4u + str(last4)[-4:])
                _add(n4l + str(last4)[-4:])

    elif bank.lower() == "indian_bank":
        # Indian Bank: First 4 letters of name (UPPERCASE) + DOB as DDMM
        n4u = name4.upper()
        fnu = first_name.upper()
        _add(n4u + ddmm)
        _add(fnu + ddmm)
        _add(n4u + ddmmyyyy)
        _add(fnu + ddmmyyyy)
        _add(n4u + ddmmyy)
        _add(fnu + ddmmyy)
        _add(ddmmyyyy)
        # lowercase variants
        _add(name4.lower() + ddmm)
        _add(first_name.lower() + ddmm)
        for last4 in card_last4s or []:
            if last4 and len(str(last4)) >= 4:
                _add(n4u + str(last4)[-4:])

    else:
        # Generic password patterns for other banks
        n4u = name4.upper()
        n4l = name4.lower()
        fnu = first_name.upper()
        fnl = first_name.lower()
        _add(n4u + ddmm)
        _add(n4l + ddmm)
        _add(fnu + ddmm)
        _add(fnl + ddmm)
        _add(n4u + ddmmyyyy)
        _add(n4l + ddmmyyyy)
        _add(ddmmyyyy)
        _add(ddmmyy)
        for last4 in card_last4s or []:
            if last4 and len(str(last4)) >= 4:
                _add(n4u + str(last4)[-4:])
                _add(n4l + str(last4)[-4:])

    return passwords


def unlock_pdf(
    pdf_path: str,
    passwords: List[str],
    *,
    allowed_roots: Tuple[Path, ...],
) -> Optional[str]:
    """
    Try each password with pikepdf. On success, save decrypted copy
    to a temporary file and return its path. The caller is responsible
    for deleting the temp file when done.
    Returns None if all passwords fail.
    """
    import tempfile

    import pikepdf

    if not _validate_pdf_path(pdf_path, allowed_roots):
        return None

    for pwd in passwords:
        try:
            with pikepdf.open(pdf_path, password=pwd) as pdf:
                tmp = tempfile.NamedTemporaryFile(
                    suffix=".pdf", prefix="burnrate_unlocked_", delete=False,
                )
                pdf.save(tmp.name)
                tmp.close()
                return tmp.name
        except pikepdf.PasswordError:
            continue
        except Exception:
            logger.debug("Unlock attempt failed for password candidate")
            continue

    return None


def is_encrypted(pdf_path: str, *, allowed_roots: Tuple[Path, ...]) -> bool:
    """Check if PDF is password-protected."""
    import pikepdf

    if not _validate_pdf_path(pdf_path, allowed_roots):
        return False
    try:
        with pikepdf.open(pdf_path) as pdf:
            return pdf.is_encrypted
    except pikepdf.PasswordError:
        return True
    except Exception:
        return False
