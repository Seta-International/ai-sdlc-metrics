from datetime import date
import psycopg2
import pytest
from collector.db import (
    upsert_counts, upsert_manual_input, get_manual_input, fetch_month_values,
)


def _fetch_counts(pg_url, project):
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT metric_key, value FROM reporting.metric_counts WHERE project = %s",
            (project,),
        )
        return dict(cur.fetchall())


def test_upsert_counts_inserts_and_skips_none(pg_url):
    n = upsert_counts(
        pg_url, "Future", "sprint", "S1", date(2026, 6, 29), date(2026, 7, 13),
        {"ai_prs": 3, "total_prs": 10, "lead_time_h": None},
    )
    assert n == 2
    rows = _fetch_counts(pg_url, "Future")
    assert rows == {"ai_prs": 3, "total_prs": 10}


def test_upsert_counts_is_idempotent_and_updates(pg_url):
    args = (pg_url, "P-Idem", "month", "2026-06", date(2026, 6, 1), date(2026, 6, 30))
    upsert_counts(*args, {"deploys": 4})
    upsert_counts(*args, {"deploys": 7})
    assert _fetch_counts(pg_url, "P-Idem") == {"deploys": 7}


def test_upsert_counts_empty_returns_zero(pg_url):
    assert upsert_counts(
        pg_url, "P-Empty", "sprint", "S1", date(2026, 1, 1), date(2026, 1, 14), {}
    ) == 0


def test_upsert_manual_input_roundtrip_and_overwrite(pg_url):
    upsert_manual_input(pg_url, "Future", "2026-06", "total_engineers", "18", "pm@seta")
    upsert_manual_input(pg_url, "Future", "2026-06", "total_engineers", "19", "pm@seta")
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT value, entered_by FROM reporting.manual_inputs "
            "WHERE project='Future' AND period_key='2026-06' AND field='total_engineers'"
        )
        assert cur.fetchone() == ("19", "pm@seta")


def test_get_manual_input_roundtrip(pg_url):
    upsert_manual_input(pg_url, "P-Get", "2026-Q3", "g1_agents_md", "Yes", "auto-check")
    assert get_manual_input(pg_url, "P-Get", "2026-Q3", "g1_agents_md") == ("Yes", "auto-check")
    assert get_manual_input(pg_url, "P-Get", "2026-Q3", "missing") is None


def test_fetch_month_values(pg_url):
    upsert_counts(pg_url, "P-Fetch", "month", "2026-06", date(2026, 6, 1), date(2026, 6, 30),
                  {"deploys": 4, "weeks": 4.3})
    upsert_counts(pg_url, "P-Fetch", "month", "2026-07", date(2026, 7, 1), date(2026, 7, 31),
                  {"deploys": 6})
    vals = fetch_month_values(pg_url, "P-Fetch", ["deploys", "weeks"], ["2026-06", "2026-07"])
    assert vals == {("2026-06", "deploys"): 4.0, ("2026-06", "weeks"): 4.3,
                    ("2026-07", "deploys"): 6.0}
