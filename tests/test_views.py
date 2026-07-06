from datetime import date
import psycopg2
from collector.db import upsert_counts


def test_usage_pct_uses_team_size_and_caps(pg_url):
    # 6 AI users, team_size 4 (manual, same month) -> raw 150% -> capped 100
    upsert_counts(pg_url, "P-Usage", "month", "2026-06", date(2026, 6, 1), date(2026, 6, 30),
                  {"ai_users_weekly_avg": 6.0, "engineers_active": 3})
    from collector.db import upsert_manual_input
    upsert_manual_input(pg_url, "P-Usage", "2026-06", "total_engineers", "4", "seed")
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT team_size, usage_pct FROM reporting.v_metrics "
                    "WHERE project='P-Usage' AND period_key='2026-06'")
        team, usage = cur.fetchone()
    assert float(team) == 4 and float(usage) == 100.0


def test_usage_pct_null_without_team_size(pg_url):
    upsert_counts(pg_url, "P-NoTeam", "month", "2026-06", date(2026, 6, 1), date(2026, 6, 30),
                  {"ai_users_weekly_avg": 3.0})
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT usage_pct FROM reporting.v_metrics "
                    "WHERE project='P-NoTeam' AND period_key='2026-06'")
        assert cur.fetchone()[0] is None


def test_n_columns_are_raw_counts(pg_url):
    upsert_counts(pg_url, "P-N", "sprint", "S1", date(2026, 6, 29), date(2026, 7, 13),
                  {"total_prs": 40, "ai_prs": 16, "agent_prs_total": 6, "deploys": 6,
                   "total_tasks": 50})
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT n_pr, n_ai_pr, n_agent_pr, n_deploys, n_tasks "
                    "FROM reporting.v_metrics WHERE project='P-N' AND period_key='S1'")
        assert [float(v) for v in cur.fetchone()] == [40, 16, 6, 6, 50]


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


def test_new_story_ratios(pg_url):
    upsert_counts(pg_url, "P-Story", "sprint", "S1", date(2026, 6, 29), date(2026, 7, 13), {
        "total_prs": 10, "ai_prs": 4, "agent_prs_total": 2, "total_tasks": 24,
        "engineers_active": 6, "lead_time_ai_h": 12.0, "lead_time_nonai_h": 24.0,
        "rework_prs": 4, "rework_from_ai_prs": 1,
        "ai_prs_with_tests": 3, "ai_time_saved_h": 40.0,
        "pr_size_ai": 120.0, "first_review_ai_h": 2.0, "review_rounds_ai": 0.5,
    })
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT agent_pr_pct, throughput_per_engineer, lead_time_ai_delta_pct,
                   ai_pr_test_pct, rework_from_ai_pct, ai_time_saved_h, pr_size_ai
            FROM reporting.metrics_ratios
            WHERE project = 'P-Story' AND period_key = 'S1'
        """)
        row = cur.fetchone()
    assert [round(float(v), 2) for v in row] == \
        [20.0, 4.0, 50.0, 75.0, 25.0, 40.0, 120.0]


def test_new_ratios_null_safe(pg_url):
    upsert_counts(pg_url, "P-Story2", "sprint", "S1", date(2026, 6, 29), date(2026, 7, 13),
                  {"total_prs": 5})
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT throughput_per_engineer, lead_time_ai_delta_pct, ai_pr_test_pct
            FROM reporting.metrics_ratios WHERE project = 'P-Story2'
        """)
        assert cur.fetchone() == (None, None, None)
