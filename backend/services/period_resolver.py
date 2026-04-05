"""Period resolver — converts period_kind + config into concrete date ranges."""

import calendar
import json
from datetime import date, timedelta
from typing import Optional


def resolve_period(
    period_kind: str,
    period_config: Optional[str | dict] = None,
    reference_date: Optional[date] = None,
) -> tuple[date, date]:
    """Return inclusive (start, end) for the current period.

    Args:
        period_kind: One of calendar_month, calendar_quarter, calendar_year,
                     rolling_days, fixed_range.
        period_config: Optional JSON string or dict with kind-specific config.
        reference_date: Date to resolve against (defaults to today).

    Returns:
        Tuple of (start_date, end_date) inclusive.

    Raises:
        ValueError: If period_kind is not recognized.
    """
    ref = reference_date or date.today()
    if isinstance(period_config, dict):
        config = period_config
    elif isinstance(period_config, str):
        config = json.loads(period_config)
    else:
        config = {}

    if period_kind == "calendar_month":
        start = ref.replace(day=1)
        last_day = calendar.monthrange(ref.year, ref.month)[1]
        end = ref.replace(day=last_day)
        return start, end

    if period_kind == "calendar_quarter":
        quarter = (ref.month - 1) // 3  # 0-indexed: 0=Q1, 1=Q2, 2=Q3, 3=Q4
        start_month = quarter * 3 + 1
        end_month = start_month + 2
        start = date(ref.year, start_month, 1)
        last_day = calendar.monthrange(ref.year, end_month)[1]
        end = date(ref.year, end_month, last_day)
        return start, end

    if period_kind == "calendar_year":
        return date(ref.year, 1, 1), date(ref.year, 12, 31)

    if period_kind == "rolling_days":
        days = config.get("days", 30)
        end = ref
        start = ref - timedelta(days=days)
        return start, end

    if period_kind == "fixed_range":
        start = date.fromisoformat(config["start"])
        end = date.fromisoformat(config["end"])
        return start, end

    raise ValueError(f"Unknown period_kind: {period_kind!r}")
