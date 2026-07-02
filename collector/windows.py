import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone


@dataclass(frozen=True)
class Window:
    period_type: str  # 'sprint' | 'month'
    period_key: str   # 'S6' | '2026-06'
    since: datetime
    until: datetime

    @property
    def weeks(self) -> float:
        return (self.until - self.since).total_seconds() / (7 * 86400)


def _utc(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


def resolve_window(sprint: str | None, month: str | None, anchor: date,
                   length_days: int, now: datetime | None = None) -> Window:
    """Resolve a collection window. Exactly one of sprint/month, or neither
    (current sprint). Past windows are capped at their natural end so
    re-collecting an old period never absorbs newer activity."""
    now = now or datetime.now(timezone.utc)
    if sprint and month:
        raise ValueError("pass --sprint or --month, not both")

    if month:
        m = re.fullmatch(r"(\d{4})-(\d{2})", month)
        if not m or not 1 <= int(m.group(2)) <= 12:
            raise ValueError(f"month must look like YYYY-MM, got {month!r}")
        year, mon = int(m.group(1)), int(m.group(2))
        since = datetime(year, mon, 1, tzinfo=timezone.utc)
        next_month = datetime(year + (mon == 12), mon % 12 + 1, 1, tzinfo=timezone.utc)
        return Window("month", month, since, min(now, next_month))

    if sprint:
        m = re.fullmatch(r"S(\d+)", sprint)
        if not m or int(m.group(1)) < 1:
            raise ValueError(f"sprint label must look like 'S<n>' (n >= 1), got {sprint!r}")
        index = int(m.group(1))
    else:
        if now.date() < anchor:
            raise ValueError(f"SPRINT_ANCHOR ({anchor}) is in the future")
        index = (now.date() - anchor).days // length_days + 1

    start = anchor + timedelta(days=(index - 1) * length_days)
    since = _utc(start)
    until = min(now, since + timedelta(days=length_days))
    return Window("sprint", f"S{index}", since, until)
