"""Milestone progress computation — on-read, not stored."""

import json
from datetime import date
from typing import Any, Dict

from sqlalchemy.orm import Session

from backend.models.models import UserMilestone
from backend.services.analytics import compute_net_spend
from backend.services.period_resolver import resolve_period


def get_milestone_progress(db: Session, milestone: UserMilestone) -> Dict[str, Any]:
    """Compute current progress toward a milestone target.

    Uses compute_net_spend with the milestone's card and period filters.
    """
    config = json.loads(milestone.period_config) if milestone.period_config else None
    start, end = resolve_period(milestone.period_kind, milestone.period_config)

    categories = json.loads(milestone.category_filter) if milestone.category_filter else None

    current_spend = compute_net_spend(
        db,
        from_date=start,
        to_date=end,
        card_ids=[milestone.card_id],
        categories=categories,
    )

    target = milestone.target_amount
    current = float(current_spend) if current_spend else 0.0
    percent = min(100.0, round(current / target * 100, 1)) if target > 0 else 0.0
    remaining = max(0.0, target - current)
    days_left = (end - date.today()).days

    return {
        "currentAmount": current,
        "targetAmount": target,
        "percent": percent,
        "remaining": remaining,
        "periodStart": start.isoformat(),
        "periodEnd": end.isoformat(),
        "daysLeft": max(0, days_left),
    }
