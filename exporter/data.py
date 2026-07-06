import psycopg2
import psycopg2.extras


def fetch_projects(db_url: str) -> list[str]:
    with psycopg2.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT DISTINCT project FROM reporting.metrics_wide ORDER BY project")
        return [r[0] for r in cur.fetchall()]


def fetch_period_rows(db_url: str, projects: list[str], period_type: str) -> list[dict]:
    with psycopg2.connect(db_url) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT * FROM reporting.metrics_ratios
                WHERE project = ANY(%s) AND period_type = %s
                ORDER BY project, period_start
            """, (projects, period_type))
            return [dict(r) for r in cur.fetchall()]


def fetch_manual(db_url: str, projects: list[str]) -> dict[tuple[str, str], dict[str, str]]:
    with psycopg2.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT project, period_key, field, value FROM reporting.manual_inputs
            WHERE project = ANY(%s)
        """, (projects,))
        out: dict[tuple[str, str], dict[str, str]] = {}
        for project, period_key, field, value in cur.fetchall():
            out.setdefault((project, period_key), {})[field] = value
        return out


def fetch_auto_ai_users(db_url: str, projects: list[str]) -> dict:
    """Monthly ai_users_weekly_avg per (project, period_key), for the
    usage_warnings data-quality guard against manually entered team size."""
    with psycopg2.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT project, period_key, ai_users_weekly_avg
            FROM reporting.metrics_wide
            WHERE project = ANY(%s) AND period_type = 'month'
              AND ai_users_weekly_avg IS NOT NULL
        """, (projects,))
        return {(p, k): float(v) for p, k, v in cur.fetchall()}
