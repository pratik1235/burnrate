"""Unit tests for period_resolver service."""

import pytest
from datetime import date, timedelta
from backend.services.period_resolver import resolve_period


class TestCalendarMonth:
    """Test calendar_month period kind."""

    def test_calendar_month_mid(self):
        """Mid-month reference resolves to month boundaries."""
        start, end = resolve_period("calendar_month", {}, date(2026, 4, 15))
        assert start == date(2026, 4, 1)
        assert end == date(2026, 4, 30)

    def test_calendar_month_first_day(self):
        """First day of month resolves correctly."""
        start, end = resolve_period("calendar_month", {}, date(2026, 1, 1))
        assert start == date(2026, 1, 1)
        assert end == date(2026, 1, 31)

    def test_calendar_month_last_day(self):
        """Last day of month resolves correctly."""
        start, end = resolve_period("calendar_month", {}, date(2026, 2, 28))
        assert start == date(2026, 2, 1)
        assert end == date(2026, 2, 28)

    def test_calendar_month_leap_year(self):
        """February in leap year has 29 days."""
        start, end = resolve_period("calendar_month", {}, date(2028, 2, 15))
        assert start == date(2028, 2, 1)
        assert end == date(2028, 2, 29)

    def test_calendar_month_december(self):
        """December resolves correctly."""
        start, end = resolve_period("calendar_month", {}, date(2026, 12, 15))
        assert start == date(2026, 12, 1)
        assert end == date(2026, 12, 31)


class TestCalendarQuarter:
    """Test calendar_quarter period kind."""

    def test_calendar_quarter_q1(self):
        """Q1 (Jan-Mar) boundaries."""
        start, end = resolve_period("calendar_quarter", {}, date(2026, 2, 15))
        assert start == date(2026, 1, 1)
        assert end == date(2026, 3, 31)

    def test_calendar_quarter_q2(self):
        """Q2 (Apr-Jun) boundaries."""
        start, end = resolve_period("calendar_quarter", {}, date(2026, 5, 1))
        assert start == date(2026, 4, 1)
        assert end == date(2026, 6, 30)

    def test_calendar_quarter_q3(self):
        """Q3 (Jul-Sep) boundaries."""
        start, end = resolve_period("calendar_quarter", {}, date(2026, 8, 31))
        assert start == date(2026, 7, 1)
        assert end == date(2026, 9, 30)

    def test_calendar_quarter_q4(self):
        """Q4 (Oct-Dec) boundaries."""
        start, end = resolve_period("calendar_quarter", {}, date(2026, 12, 1))
        assert start == date(2026, 10, 1)
        assert end == date(2026, 12, 31)

    def test_calendar_quarter_jan(self):
        """January is Q1."""
        start, end = resolve_period("calendar_quarter", {}, date(2026, 1, 1))
        assert start == date(2026, 1, 1)
        assert end == date(2026, 3, 31)


class TestCalendarYear:
    """Test calendar_year period kind."""

    def test_calendar_year(self):
        """Calendar year boundaries."""
        start, end = resolve_period("calendar_year", {}, date(2026, 6, 15))
        assert start == date(2026, 1, 1)
        assert end == date(2026, 12, 31)

    def test_calendar_year_jan(self):
        """January 1 resolves to full year."""
        start, end = resolve_period("calendar_year", {}, date(2026, 1, 1))
        assert start == date(2026, 1, 1)
        assert end == date(2026, 12, 31)

    def test_calendar_year_dec(self):
        """December 31 resolves to full year."""
        start, end = resolve_period("calendar_year", {}, date(2026, 12, 31))
        assert start == date(2026, 1, 1)
        assert end == date(2026, 12, 31)


class TestRollingDays:
    """Test rolling_days period kind."""

    def test_rolling_days_30(self):
        """Rolling 30 days computes correct window."""
        end_date = date(2026, 4, 3)
        start, end = resolve_period("rolling_days", {"days": 30}, end_date)
        assert end == end_date
        assert start == end_date - timedelta(days=30)

    def test_rolling_days_90(self):
        """Rolling 90 days computes correct window."""
        end_date = date(2026, 4, 3)
        start, end = resolve_period("rolling_days", {"days": 90}, end_date)
        assert end == end_date
        assert start == end_date - timedelta(days=90)

    def test_rolling_days_1(self):
        """Rolling 1 day is just today."""
        end_date = date(2026, 4, 3)
        start, end = resolve_period("rolling_days", {"days": 1}, end_date)
        assert end == end_date
        assert start == end_date - timedelta(days=1)

    def test_rolling_days_365(self):
        """Rolling 365 days is one year."""
        end_date = date(2026, 4, 3)
        start, end = resolve_period("rolling_days", {"days": 365}, end_date)
        assert end == end_date
        assert start == end_date - timedelta(days=365)


class TestFixedRange:
    """Test fixed_range period kind."""

    def test_fixed_range(self):
        """Fixed range uses explicit dates."""
        start, end = resolve_period(
            "fixed_range",
            {"start": "2026-01-01", "end": "2026-03-31"},
            date(2026, 6, 15),
        )
        assert start == date(2026, 1, 1)
        assert end == date(2026, 3, 31)

    def test_fixed_range_ignores_reference(self):
        """Fixed range ignores reference_date."""
        start, end = resolve_period(
            "fixed_range",
            {"start": "2025-01-01", "end": "2025-12-31"},
            date(2026, 6, 15),  # Different year
        )
        assert start == date(2025, 1, 1)
        assert end == date(2025, 12, 31)

    def test_fixed_range_same_day(self):
        """Fixed range can be single day."""
        start, end = resolve_period(
            "fixed_range",
            {"start": "2026-04-03", "end": "2026-04-03"},
            date(2026, 4, 3),
        )
        assert start == date(2026, 4, 3)
        assert end == date(2026, 4, 3)


class TestEdgeCases:
    """Test edge cases and error handling."""

    def test_invalid_kind_raises(self):
        """Unknown period_kind raises ValueError."""
        with pytest.raises(ValueError):
            resolve_period("unknown_kind", {}, date(2026, 4, 3))

    def test_quarter_january_is_q1(self):
        """January belongs to Q1, not Q4 of previous year."""
        start, end = resolve_period("calendar_quarter", {}, date(2026, 1, 1))
        assert start.year == 2026
        assert start.month == 1

    def test_quarter_december_is_q4(self):
        """December belongs to Q4 of current year."""
        start, end = resolve_period("calendar_quarter", {}, date(2026, 12, 31))
        assert end.year == 2026
        assert end.month == 12

    def test_leap_day(self):
        """Leap day (Feb 29) resolves correctly."""
        start, end = resolve_period("calendar_month", {}, date(2028, 2, 29))
        assert start == date(2028, 2, 1)
        assert end == date(2028, 2, 29)

    def test_non_leap_year_february(self):
        """February in non-leap year has 28 days."""
        start, end = resolve_period("calendar_month", {}, date(2026, 2, 28))
        assert end == date(2026, 2, 28)
