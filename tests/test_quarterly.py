from datetime import date
import responses
from collector.db import upsert_counts, upsert_manual_input, get_manual_input
from collector.quarterly import (
    quarter_months, prev_quarter, dora_improving, store_suggestions,
)


def test_quarter_months():
    assert quarter_months("2026-Q3") == ["2026-07", "2026-08", "2026-09"]
    assert quarter_months("2026-Q1") == ["2026-01", "2026-02", "2026-03"]


def test_prev_quarter():
    assert prev_quarter("2026-Q3") == "2026-Q2"
    assert prev_quarter("2026-Q1") == "2025-Q4"


def _seed_month(pg_url, project, month, lead, mttr, deploys, weeks, incidents):
    upsert_counts(pg_url, project, "month", month, date(2026, 1, 1), date(2026, 1, 31), {
        "lead_time_h": lead, "mttr_h": mttr, "deploys": deploys,
        "weeks": weeks, "incidents": incidents,
    })


def test_dora_improving_yes(pg_url):
    _seed_month(pg_url, "P-Dora", "2026-04", 40, 6, 4, 4.3, 2)
    _seed_month(pg_url, "P-Dora", "2026-07", 30, 4, 8, 4.3, 1)
    assert dora_improving(pg_url, "P-Dora", "2026-Q3") == "Yes"


def test_dora_improving_insufficient_data(pg_url):
    assert dora_improving(pg_url, "P-NoData", "2026-Q3") is None


def test_store_suggestions_never_overwrites_human(pg_url):
    upsert_manual_input(pg_url, "P-Sug", "2026-Q3", "g1_agents_md", "No", "pm@seta")
    n = store_suggestions(pg_url, "P-Sug", "2026-Q3",
                          {"g1_agents_md": "Yes", "a2_dashboard": "Yes"})
    assert n == 1  # only a2_dashboard written
    assert get_manual_input(pg_url, "P-Sug", "2026-Q3", "g1_agents_md") == ("No", "pm@seta")
    assert get_manual_input(pg_url, "P-Sug", "2026-Q3", "a2_dashboard") == ("Yes", "auto-check")


def test_store_suggestions_updates_own_previous_run(pg_url):
    store_suggestions(pg_url, "P-Rerun", "2026-Q3", {"c3_scan_ci": "No"})
    n = store_suggestions(pg_url, "P-Rerun", "2026-Q3", {"c3_scan_ci": "Yes"})
    assert n == 1
    assert get_manual_input(pg_url, "P-Rerun", "2026-Q3", "c3_scan_ci") == ("Yes", "auto-check")
