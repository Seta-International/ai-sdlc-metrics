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


def test_usage_pct_null_when_team_size_zero(pg_url):
    from collector.db import upsert_manual_input
    upsert_counts(pg_url, "P-ZeroTeam", "month", "2026-06", date(2026, 6, 1), date(2026, 6, 30),
                  {"ai_users_weekly_avg": 5.0})
    upsert_manual_input(pg_url, "P-ZeroTeam", "2026-06", "total_engineers", "0", "seed")
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT usage_pct FROM reporting.v_metrics "
                    "WHERE project='P-ZeroTeam' AND period_key='2026-06'")
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


def test_v_metrics_survives_non_numeric_team_size(pg_url):
    from collector.db import upsert_manual_input
    upsert_counts(pg_url, "P-BadTeam", "month", "2026-02", date(2026, 2, 1), date(2026, 2, 28),
                  {"ai_users_weekly_avg": 4.0})
    upsert_manual_input(pg_url, "P-BadTeam", "2026-02", "total_engineers", "not-a-number", "seed")
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT team_size, usage_pct FROM reporting.v_metrics "
                    "WHERE project='P-BadTeam' AND period_key='2026-02'")
        assert cur.fetchone() == (None, None)   # must not raise; bad value ignored


def test_board_benchmark_thresholds_present(pg_url):
    import psycopg2
    expected = {
        "roi_payback_ok": 0,
        "throughput_lift_target": 0.08,
        "sec_alerts_crit": 1,
        "lead_elite_h": 24,
        "lead_high_h": 168,
        "cfr_elite": 0.15,
        "attn_roi_neg_periods": 2,
    }
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT key, value, note FROM reporting.thresholds "
                    "WHERE key = ANY(%s)", (list(expected),))
        rows = cur.fetchall()
    got = {k: float(v) for k, v, _ in rows}
    assert got == expected
    assert all(note for _, _, note in rows), "every benchmark row must document its basis"


def test_v_portfolio_roi_cumulative(pg_url):
    import psycopg2
    from datetime import date
    from collector.db import upsert_counts, upsert_manual_input
    upsert_counts(pg_url, "P-Roi", "month", "2026-05", date(2026, 5, 1), date(2026, 5, 31),
                  {"ai_time_saved_h": 10.0})
    upsert_counts(pg_url, "P-Roi", "month", "2026-06", date(2026, 6, 1), date(2026, 6, 30),
                  {"ai_time_saved_h": 30.0})
    upsert_manual_input(pg_url, "P-Roi", "2026-05", "ai_tool_cost_monthly", "100", "seed")
    upsert_manual_input(pg_url, "P-Roi", "2026-06", "ai_tool_cost_monthly", "100", "seed")
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT period_key, hours_saved, tool_cost, cum_hours_saved, cum_tool_cost "
                    "FROM reporting.v_portfolio_roi WHERE project='P-Roi' ORDER BY period_start")
        rows = [[float(x) if x is not None else None for x in r[1:]] for r in cur.fetchall()]
        # order preserved separately:
        cur.execute("SELECT period_key FROM reporting.v_portfolio_roi "
                    "WHERE project='P-Roi' ORDER BY period_start")
        keys = [r[0] for r in cur.fetchall()]
    assert keys == ["2026-05", "2026-06"]
    assert rows == [[10.0, 100.0, 10.0, 100.0], [30.0, 100.0, 40.0, 200.0]]


def _seed_quarter_levels(pg_url, project, quarter, flags):
    # v_quarter_metrics' agg CTE needs >=1 monthly metric_counts row to produce a
    # row at all (see test_levels.py); seed a minimal one for the quarter's first
    # month, then the quarterly manual flags (dict of field->'Yes').
    from datetime import date
    from collector.db import upsert_counts, upsert_manual_input
    year, q_num = quarter.split("-Q")
    year = int(year)
    month = (int(q_num) - 1) * 3 + 1
    period_key = f"{year}-{month:02d}"
    upsert_counts(pg_url, project, "month", period_key, date(year, month, 1), date(year, month, 28),
                  {"total_prs": 1})
    for field, val in flags.items():
        upsert_manual_input(pg_url, project, quarter, field, val, "seed")


def test_v_level_distribution_counts(pg_url):
    import psycopg2
    # Two projects, same quarter: both end at some A level. We assert the
    # distribution sums to the number of projects for dimension 'A'.
    _seed_quarter_levels(pg_url, "P-Dist1", "2026-Q2", {"g2_ai_policy": "Yes"})
    _seed_quarter_levels(pg_url, "P-Dist2", "2026-Q2", {"g2_ai_policy": "Yes"})
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT sum(n_projects) FROM reporting.v_level_distribution "
                    "WHERE quarter='2026-Q2' AND dimension='A' "
                    "AND quarter IN (SELECT DISTINCT quarter FROM reporting.v_levels "
                    "                WHERE project IN ('P-Dist1','P-Dist2'))")
        total = cur.fetchone()[0]
    assert total is not None and int(total) >= 2


def test_views_sql_is_reappliable(pg_url):
    """views.sql must re-apply cleanly to an already-migrated DB (deploy re-runs it)."""
    import os
    base = os.path.join(os.path.dirname(__file__), "..", "infra", "db")
    with open(os.path.join(base, "views.sql")) as f:
        sql = f.read()
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute(sql)   # conftest already applied it once; this is the second apply
        conn.commit()
