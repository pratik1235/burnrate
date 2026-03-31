"""Merchant categorizer based on keyword matching."""

from backend.models.database import SessionLocal
from backend.models.models import CategoryDefinition


def categorize(merchant_name: str, db_session=None) -> str:
    """
    Categorize a merchant by name. Checks custom categories first (is_prebuilt=0),
    then prebuilt. Returns category slug, default 'other' if no match.
    """
    if not merchant_name:
        return "other"
    lower = merchant_name.lower()
    if "cashback" in lower:
        return "cashback"

    close_session = False
    if db_session is None:
        db_session = SessionLocal()
        close_session = True
    try:
        # Custom categories checked first (is_prebuilt=0), then prebuilt
        all_cats = db_session.query(CategoryDefinition).order_by(CategoryDefinition.is_prebuilt.asc()).all()
        for cat in all_cats:
            if not cat.keywords:
                continue
            for keyword in cat.keywords.lower().split(","):
                kw = keyword.strip()
                if kw and kw in lower:
                    return cat.slug
    finally:
        if close_session:
            db_session.close()
    return "other"
