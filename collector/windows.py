import re
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class Window:
    period_type: str  # always 'month'
    period_key: str   # '2026-06'
    since: datetime
    until: datetime

    @property
    def weeks(self) -> float:
        return (self.until - self.since).total_seconds() / (7 * 86400)


def resolve_window(month: str | None, now: datetime | None = None) -> Window:
    """Resolve a collection window: the given calendar month, or the current
    one. Past months are capped at their natural end so re-collecting an old
    month never absorbs newer activity; the current month is capped at now."""
    now = now or datetime.now(timezone.utc)

    if month:
        m = re.fullmatch(r"(\d{4})-(\d{2})", month)
        if not m or not 1 <= int(m.group(2)) <= 12:
            raise ValueError(f"month must look like YYYY-MM, got {month!r}")
        year, mon = int(m.group(1)), int(m.group(2))
    else:
        year, mon = now.year, now.month

    since = datetime(year, mon, 1, tzinfo=timezone.utc)
    next_month = datetime(year + (mon == 12), mon % 12 + 1, 1, tzinfo=timezone.utc)
    return Window("month", f"{year:04d}-{mon:02d}", since, min(now, next_month))
