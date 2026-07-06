import os, psycopg2

def test_seed_loads_and_exercises_guards(pg_url):
    base = os.path.join(os.path.dirname(__file__), "..", "infra", "db")
    with psycopg2.connect(pg_url) as conn:
        with conn.cursor() as cur, open(os.path.join(base, "seed.sql")) as f:
            cur.execute(f.read())
        conn.commit()
        with conn.cursor() as cur:
            # usage capped at 100 somewhere
            cur.execute("SELECT max(usage_pct) FROM reporting.v_metrics")
            assert float(cur.fetchone()[0]) <= 100.0
            # gated demo project exists and is capped
            cur.execute("SELECT overall FROM reporting.v_levels WHERE project='Gated-Demo'")
            assert cur.fetchone()[0] == 1
            # an event annotation exists
            cur.execute("SELECT count(*) FROM reporting.events")
            assert cur.fetchone()[0] >= 1
