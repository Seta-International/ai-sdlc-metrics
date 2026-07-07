import os
import psycopg2
import pytest
from testcontainers.postgres import PostgresContainer

# Provide stub env vars so modules that read them at import time work in tests.
# Real credentials are never needed for unit tests (all HTTP mocked via `responses`).
for _var, _val in {
    "METRICS_GH_TOKEN": "test-token",
    "JIRA_EMAIL": "test@example.com",
    "JIRA_TOKEN": "test-jira-token",
    "JIRA_AI_USAGE_FIELD": "customfield_10200",
    "REPORTING_DB_URL": "postgresql://test:test@localhost:5432/test",
}.items():
    os.environ.setdefault(_var, _val)


@pytest.fixture(scope="session")
def pg_url():
    """Provides a real Postgres URL with the reporting schema applied."""
    with PostgresContainer("postgres:17-alpine") as pg:
        url = pg.get_connection_url().replace("psycopg2", "").replace("+", "")
        # Replace driver prefix for plain psycopg2
        url = pg.get_connection_url().replace("postgresql+psycopg2", "postgresql")
        conn = psycopg2.connect(url)
        base = os.path.join(os.path.dirname(__file__), "..", "infra", "db")
        with conn.cursor() as cur:
            for sql_file in ("init.sql", "views.sql"):
                with open(os.path.join(base, sql_file)) as f:
                    cur.execute(f.read())
        conn.commit()
        conn.close()
        yield url
