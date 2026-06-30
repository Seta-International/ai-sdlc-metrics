import psycopg2

_COLS = [
    "a2_pr_ai_ratio", "a3_agent_issue_ratio", "a4_ai_issue_ratio",
    "b1_lead_time_median_hours", "b2_deploy_frequency_per_week",
    "b3_change_failure_rate", "b4_mttr_hours",
    "c1_rework_ratio", "c2_ai_pr_review_ratio", "c4_security_alerts",
    "d1_agent_completion_ratio", "d2_human_intervention_ratio",
    "d3_autonomy_ratio", "d4_agent_cycle_time_hours",
    "a1_adoption_rate", "b5_cost_improvement_pct", "c3_ai_code_coverage_pct",
]

_KEY_MAP = {
    "a2_pr_ai_ratio": "a2", "a3_agent_issue_ratio": "a3", "a4_ai_issue_ratio": "a4",
    "b1_lead_time_median_hours": "b1", "b2_deploy_frequency_per_week": "b2",
    "b3_change_failure_rate": "b3", "b4_mttr_hours": "b4",
    "c1_rework_ratio": "c1", "c2_ai_pr_review_ratio": "c2", "c4_security_alerts": "c4",
    "d1_agent_completion_ratio": "d1", "d2_human_intervention_ratio": "d2",
    "d3_autonomy_ratio": "d3", "d4_agent_cycle_time_hours": "d4",
    "a1_adoption_rate": "a1", "b5_cost_improvement_pct": "b5",
    "c3_ai_code_coverage_pct": "c3",
}

def upsert_metrics(db_url: str, sprint_label: str, project: str, metrics: dict) -> None:
    """Upsert one sprint row. NULL inputs preserve existing values (COALESCE)."""
    values = {col: metrics.get(_KEY_MAP[col]) for col in _COLS}
    set_clause = ", ".join(
        f"{col} = COALESCE(EXCLUDED.{col}, reporting.ai_sprint_metrics.{col})"
        for col in _COLS
    )
    col_list = ", ".join(_COLS)
    placeholders = ", ".join(f"%({col})s" for col in _COLS)

    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                INSERT INTO reporting.ai_sprint_metrics
                    (sprint_label, project, collected_at, {col_list})
                VALUES
                    (%(sprint_label)s, %(project)s, now(), {placeholders})
                ON CONFLICT (sprint_label, project) DO UPDATE SET
                    collected_at = now(),
                    {set_clause}
            """, {"sprint_label": sprint_label, "project": project, **values})
