import os
import psycopg2
import pytest
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def pg_url():
    """Provides a real Postgres URL with the reporting schema applied."""
    init_sql = os.path.join(os.path.dirname(__file__), "..", "infra", "db", "init.sql")
    with PostgresContainer("postgres:17-alpine") as pg:
        url = pg.get_connection_url().replace("psycopg2", "").replace("+", "")
        # Replace driver prefix for plain psycopg2
        url = pg.get_connection_url().replace("postgresql+psycopg2", "postgresql")
        conn = psycopg2.connect(url)
        with conn.cursor() as cur, open(init_sql) as f:
            cur.execute(f.read())
        conn.commit()
        conn.close()
        yield url
