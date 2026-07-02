from datetime import date
import psycopg2
from collector.db import upsert_counts


def test_metrics_ratios_view(pg_url):
    upsert_counts(pg_url, "P-View", "sprint", "S1", date(2026, 6, 29), date(2026, 7, 13), {
        "ai_prs": 3, "total_prs": 10, "deploys": 4, "weeks": 2.0, "incidents": 1,
        "agent_prs_total": 2, "agent_prs_merged": 2, "agent_prs_human_fixed": 1,
        "agent_prs_autonomous": 1, "ai_prs_reviewed": 3,
        "sprint_committed": 10, "sprint_completed": 8,
        "ai_users_weekly_avg": 6.0, "engineers_active": 12,
    })
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT ai_pr_pct, deploys_per_week, cfr_pct, autonomy_pct,
                   ai_pr_review_pct, predictability_pct, usage_rate_pct
            FROM reporting.metrics_ratios
            WHERE project = 'P-View' AND period_key = 'S1'
        """)
        row = cur.fetchone()
    assert [round(float(v), 2) for v in row] == [30.0, 2.0, 25.0, 50.0, 100.0, 80.0, 50.0]


def test_metrics_wide_null_for_missing_metrics(pg_url):
    upsert_counts(pg_url, "P-View2", "month", "2026-06", date(2026, 6, 1), date(2026, 6, 30),
                  {"total_prs": 5})
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT total_prs, ai_prs, lead_time_h FROM reporting.metrics_wide
            WHERE project = 'P-View2' AND period_key = '2026-06'
        """)
        total, ai, lead = cur.fetchone()
    assert float(total) == 5 and ai is None and lead is None
