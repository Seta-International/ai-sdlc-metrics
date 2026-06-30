import psycopg2
import pytest
from collector.db import upsert_metrics

def test_upsert_creates_row(pg_url):
    upsert_metrics(pg_url, "S1", "TEST", {"a2": 0.75, "a4": 0.5, "c4": 3})
    conn = psycopg2.connect(pg_url)
    cur = conn.cursor()
    cur.execute("SELECT a2_pr_ai_ratio, a4_ai_issue_ratio, c4_security_alerts "
                "FROM reporting.ai_sprint_metrics WHERE sprint_label='S1' AND project='TEST'")
    row = cur.fetchone()
    conn.close()
    assert row == (0.75, 0.5, 3)

def test_upsert_updates_existing_row(pg_url):
    upsert_metrics(pg_url, "S1", "TEST", {"a2": 0.8, "a4": 0.6})
    conn = psycopg2.connect(pg_url)
    cur = conn.cursor()
    cur.execute("SELECT a2_pr_ai_ratio, a4_ai_issue_ratio "
                "FROM reporting.ai_sprint_metrics WHERE sprint_label='S1' AND project='TEST'")
    row = cur.fetchone()
    conn.close()
    # Postgres numeric → Decimal; cast to float for comparison
    assert float(row[0]) == 0.8

def test_upsert_preserves_non_null_on_null_input(pg_url):
    # First write with a value
    upsert_metrics(pg_url, "S2", "TEST", {"a2": 0.9})
    # Second write without a2 (None) — should preserve 0.9
    upsert_metrics(pg_url, "S2", "TEST", {"a2": None, "a4": 0.4})
    conn = psycopg2.connect(pg_url)
    cur = conn.cursor()
    cur.execute("SELECT a2_pr_ai_ratio, a4_ai_issue_ratio "
                "FROM reporting.ai_sprint_metrics WHERE sprint_label='S2' AND project='TEST'")
    row = cur.fetchone()
    conn.close()
    # Postgres numeric → Decimal; cast to float for comparison
    assert float(row[0]) == 0.9   # preserved
    assert float(row[1]) == 0.4   # updated
