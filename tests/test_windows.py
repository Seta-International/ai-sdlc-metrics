from datetime import date, datetime, timezone
import pytest
from collector.windows import Window, resolve_window

ANCHOR = date(2026, 6, 29)
NOW = datetime(2026, 7, 20, 12, 0, tzinfo=timezone.utc)  # inside sprint S2


def test_current_sprint_resolved_from_now():
    w = resolve_window(None, None, ANCHOR, 14, now=NOW)
    assert (w.period_type, w.period_key) == ("sprint", "S2")
    assert w.since == datetime(2026, 7, 13, tzinfo=timezone.utc)
    assert w.until == NOW  # current sprint: collect up to now


def test_past_sprint_is_capped_at_sprint_end():
    w = resolve_window("S1", None, ANCHOR, 14, now=NOW)
    assert w.since == datetime(2026, 6, 29, tzinfo=timezone.utc)
    assert w.until == datetime(2026, 7, 13, tzinfo=timezone.utc)  # not NOW


def test_month_window():
    w = resolve_window(None, "2026-06", ANCHOR, 14, now=NOW)
    assert (w.period_type, w.period_key) == ("month", "2026-06")
    assert w.since == datetime(2026, 6, 1, tzinfo=timezone.utc)
    assert w.until == datetime(2026, 7, 1, tzinfo=timezone.utc)


def test_current_month_capped_at_now():
    w = resolve_window(None, "2026-07", ANCHOR, 14, now=NOW)
    assert w.until == NOW


def test_weeks_property():
    w = resolve_window("S1", None, ANCHOR, 14, now=NOW)
    assert w.weeks == pytest.approx(2.0)


@pytest.mark.parametrize("sprint,month", [("S1", "2026-06"), ("X9", None), (None, "2026-13"), (None, "junk"), ("S0", None)])
def test_invalid_inputs_raise(sprint, month):
    with pytest.raises(ValueError):
        resolve_window(sprint, month, ANCHOR, 14, now=NOW)


def test_anchor_in_future_raises():
    with pytest.raises(ValueError):
        resolve_window(None, None, date(2027, 1, 1), 14, now=NOW)
