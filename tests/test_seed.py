import os
import psycopg2
from testcontainers.postgres import PostgresContainer


def test_seed_loads_and_exercises_guards():
    """seed.sql must load cleanly on a fresh DB and exercise every guard branch.

    Uses its own container (not the shared session `pg_url`) so loading the full
    seed file — which inserts Future/S1 rows — cannot collide with rows other
    tests insert into the shared container.
    """
    base = os.path.join(os.path.dirname(__file__), "..", "infra", "db")
    with PostgresContainer("postgres:17-alpine") as pg:
        url = pg.get_connection_url().replace("postgresql+psycopg2", "postgresql")
        conn = psycopg2.connect(url)
        with conn.cursor() as cur:
            for sql_file in ("init.sql", "views.sql", "seed.sql"):
                with open(os.path.join(base, sql_file)) as f:
                    cur.execute(f.read())
        conn.commit()
        with conn.cursor() as cur:
            cur.execute("SELECT max(usage_pct) FROM reporting.v_metrics")
            assert float(cur.fetchone()[0]) <= 100.0
            cur.execute("SELECT overall FROM reporting.v_levels WHERE project='Gated-Demo'")
            assert cur.fetchone()[0] == 1
            cur.execute("SELECT count(*) FROM reporting.events")
            assert cur.fetchone()[0] >= 1
        conn.close()
