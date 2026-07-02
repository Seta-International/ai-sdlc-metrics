from datetime import date
import psycopg2


def upsert_counts(db_url: str, project: str, period_type: str, period_key: str,
                  period_start: date, period_end: date,
                  counts: dict[str, float | int | None]) -> int:
    """Upsert one metric_counts row per non-None metric. Returns rows written."""
    rows = [
        (project, period_type, period_key, period_start, period_end, key, value)
        for key, value in counts.items() if value is not None
    ]
    if not rows:
        return 0
    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.executemany("""
                INSERT INTO reporting.metric_counts
                    (project, period_type, period_key, period_start, period_end,
                     metric_key, value)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (project, period_type, period_key, metric_key)
                DO UPDATE SET
                    value = EXCLUDED.value,
                    period_start = EXCLUDED.period_start,
                    period_end = EXCLUDED.period_end,
                    collected_at = now()
            """, rows)
    return len(rows)


def upsert_manual_input(db_url: str, project: str, period_key: str, field: str,
                        value: str, entered_by: str | None = None) -> None:
    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO reporting.manual_inputs
                    (project, period_key, field, value, entered_by)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (project, period_key, field)
                DO UPDATE SET
                    value = EXCLUDED.value,
                    entered_by = EXCLUDED.entered_by,
                    entered_at = now()
            """, (project, period_key, field, value, entered_by))
