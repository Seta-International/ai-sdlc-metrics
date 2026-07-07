from datetime import date
from collector.db import upsert_counts, upsert_manual_input
from exporter.data import fetch_projects, fetch_period_rows, fetch_manual


def _seed(pg_url):
    upsert_counts(pg_url, "P-Exp", "month", "2026-07", date(2026, 6, 29), date(2026, 7, 13),
                  {"ai_prs": 3, "total_prs": 10})
    upsert_counts(pg_url, "P-Exp", "month", "2026-06", date(2026, 6, 1), date(2026, 6, 30),
                  {"deploys": 4, "weeks": 4.3})
    upsert_manual_input(pg_url, "P-Exp", "2026-06", "total_engineers", "18", "pm")


def test_fetch_projects(pg_url):
    _seed(pg_url)
    assert "P-Exp" in fetch_projects(pg_url)


def test_fetch_period_rows(pg_url):
    _seed(pg_url)
    rows = fetch_period_rows(pg_url, ["P-Exp"], "month")
    row = next(r for r in rows if r["period_key"] == "2026-07")
    assert float(row["ai_pr_pct"]) == 30.0
    assert row["lead_time_h"] is None


def test_fetch_manual(pg_url):
    _seed(pg_url)
    manual = fetch_manual(pg_url, ["P-Exp"])
    assert manual[("P-Exp", "2026-06")]["total_engineers"] == "18"
