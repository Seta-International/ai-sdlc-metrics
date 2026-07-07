from datetime import datetime, timezone
import pytest
from collector.windows import Window, resolve_window

NOW = datetime(2026, 7, 20, 12, 0, tzinfo=timezone.utc)


def test_month_window():
    w = resolve_window("2026-06", now=NOW)
    assert (w.period_type, w.period_key) == ("month", "2026-06")
    assert w.since == datetime(2026, 6, 1, tzinfo=timezone.utc)
    assert w.until == datetime(2026, 7, 1, tzinfo=timezone.utc)


def test_current_month_resolved_from_now():
    w = resolve_window(None, now=NOW)
    assert (w.period_type, w.period_key) == ("month", "2026-07")
    assert w.until == NOW  # current month: collect up to now, not month-end


def test_past_month_capped_at_month_end_not_now():
    w = resolve_window("2026-06", now=NOW)
    assert w.until == datetime(2026, 7, 1, tzinfo=timezone.utc)  # not NOW


def test_december_rolls_over_to_next_year():
    w = resolve_window("2026-12", now=datetime(2027, 2, 1, tzinfo=timezone.utc))
    assert w.since == datetime(2026, 12, 1, tzinfo=timezone.utc)
    assert w.until == datetime(2027, 1, 1, tzinfo=timezone.utc)


def test_weeks_property():
    w = resolve_window("2026-06", now=NOW)  # June has 30 days
    assert w.weeks == pytest.approx(30 / 7)


@pytest.mark.parametrize("month", ["2026-13", "junk", "2026-6", "26-06", "2026-00"])
def test_invalid_month_raises(month):
    with pytest.raises(ValueError):
        resolve_window(month, now=NOW)
