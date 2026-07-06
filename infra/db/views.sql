-- Read-time layer over metric_counts: consumers (Grafana, exporter) read these
-- views; ratios are never stored. Apply after init.sql:
--   psql "$REPORTING_DB_URL" -f infra/db/views.sql
-- Drop first: CREATE OR REPLACE cannot add/reorder view columns.

DROP VIEW IF EXISTS reporting.metrics_ratios;
DROP VIEW IF EXISTS reporting.v_levels;
DROP VIEW IF EXISTS reporting.v_metrics;
DROP VIEW IF EXISTS reporting.metrics_wide;

CREATE VIEW reporting.metrics_wide AS
SELECT
  project, period_type, period_key,
  min(period_start) AS period_start,
  max(period_end)   AS period_end,
  max(value) FILTER (WHERE metric_key = 'ai_users_weekly_avg')   AS ai_users_weekly_avg,
  max(value) FILTER (WHERE metric_key = 'engineers_active')      AS engineers_active,
  max(value) FILTER (WHERE metric_key = 'ai_prs')                AS ai_prs,
  max(value) FILTER (WHERE metric_key = 'total_prs')             AS total_prs,
  max(value) FILTER (WHERE metric_key = 'agent_tasks')           AS agent_tasks,
  max(value) FILTER (WHERE metric_key = 'ai_tasks')              AS ai_tasks,
  max(value) FILTER (WHERE metric_key = 'total_tasks')           AS total_tasks,
  max(value) FILTER (WHERE metric_key = 'lead_time_h')           AS lead_time_h,
  max(value) FILTER (WHERE metric_key = 'deploys')               AS deploys,
  max(value) FILTER (WHERE metric_key = 'weeks')                 AS weeks,
  max(value) FILTER (WHERE metric_key = 'incidents')             AS incidents,
  max(value) FILTER (WHERE metric_key = 'mttr_h')                AS mttr_h,
  max(value) FILTER (WHERE metric_key = 'rework_prs')            AS rework_prs,
  max(value) FILTER (WHERE metric_key = 'ai_prs_reviewed')       AS ai_prs_reviewed,
  max(value) FILTER (WHERE metric_key = 'security_alerts')       AS security_alerts,
  max(value) FILTER (WHERE metric_key = 'agent_prs_total')       AS agent_prs_total,
  max(value) FILTER (WHERE metric_key = 'agent_prs_merged')      AS agent_prs_merged,
  max(value) FILTER (WHERE metric_key = 'agent_prs_human_fixed') AS agent_prs_human_fixed,
  max(value) FILTER (WHERE metric_key = 'agent_prs_autonomous')  AS agent_prs_autonomous,
  max(value) FILTER (WHERE metric_key = 'agent_cycle_h')         AS agent_cycle_h,
  max(value) FILTER (WHERE metric_key = 'sprint_committed')      AS sprint_committed,
  max(value) FILTER (WHERE metric_key = 'sprint_completed')      AS sprint_completed,
  max(value) FILTER (WHERE metric_key = 'lead_time_ai_h')        AS lead_time_ai_h,
  max(value) FILTER (WHERE metric_key = 'lead_time_nonai_h')     AS lead_time_nonai_h,
  max(value) FILTER (WHERE metric_key = 'rework_from_ai_prs')    AS rework_from_ai_prs,
  max(value) FILTER (WHERE metric_key = 'ai_time_saved_h')       AS ai_time_saved_h,
  max(value) FILTER (WHERE metric_key = 'ai_prs_with_tests')     AS ai_prs_with_tests,
  max(value) FILTER (WHERE metric_key = 'pr_size_ai')            AS pr_size_ai,
  max(value) FILTER (WHERE metric_key = 'pr_size_nonai')         AS pr_size_nonai,
  max(value) FILTER (WHERE metric_key = 'first_review_ai_h')     AS first_review_ai_h,
  max(value) FILTER (WHERE metric_key = 'first_review_nonai_h')  AS first_review_nonai_h,
  max(value) FILTER (WHERE metric_key = 'review_rounds_ai')      AS review_rounds_ai,
  max(value) FILTER (WHERE metric_key = 'review_rounds_nonai')   AS review_rounds_nonai
FROM reporting.metric_counts
GROUP BY project, period_type, period_key;

CREATE VIEW reporting.v_metrics AS
SELECT
  w.*,
  ts.team_size,
  100.0 * ai_prs               / NULLIF(total_prs, 0)        AS ai_pr_pct,
  -- Postgres LEAST()/GREATEST() ignore NULL args (LEAST(NULL, 100) = 100), so a
  -- plain LEAST(...) here would silently turn a missing team_size into 100%.
  -- Guard explicitly so the result is NULL whenever either input is NULL.
  CASE
    WHEN ai_users_weekly_avg IS NULL OR ts.team_size IS NULL OR ts.team_size = 0 THEN NULL
    ELSE LEAST(100.0 * ai_users_weekly_avg / NULLIF(ts.team_size, 0), 100.0)
  END AS usage_pct,
  100.0 * ai_users_weekly_avg  / NULLIF(engineers_active, 0) AS usage_rate_pct,  -- legacy proxy, kept for compat
  100.0 * agent_tasks          / NULLIF(total_tasks, 0)      AS agent_task_pct,
  100.0 * ai_tasks             / NULLIF(total_tasks, 0)      AS ai_task_pct,
  deploys                      / NULLIF(weeks, 0)            AS deploys_per_week,
  100.0 * incidents            / NULLIF(deploys, 0)          AS cfr_pct,
  100.0 * rework_prs           / NULLIF(total_prs, 0)        AS rework_pct,
  100.0 * ai_prs_reviewed      / NULLIF(ai_prs, 0)           AS ai_pr_review_pct,
  100.0 * agent_prs_merged     / NULLIF(agent_prs_total, 0)  AS agent_completion_pct,
  100.0 * agent_prs_human_fixed / NULLIF(agent_prs_total, 0) AS human_intervention_pct,
  100.0 * agent_prs_autonomous / NULLIF(agent_prs_total, 0)  AS autonomy_pct,
  100.0 * sprint_completed     / NULLIF(sprint_committed, 0) AS predictability_pct,
  100.0 * agent_prs_total      / NULLIF(total_prs, 0)        AS agent_pr_pct,
  total_tasks::numeric         / NULLIF(engineers_active, 0) AS throughput_per_engineer,
  100.0 * (lead_time_nonai_h - lead_time_ai_h)
                               / NULLIF(lead_time_nonai_h, 0) AS lead_time_ai_delta_pct,
  100.0 * ai_prs_with_tests    / NULLIF(ai_prs, 0)           AS ai_pr_test_pct,
  100.0 * rework_from_ai_prs   / NULLIF(rework_prs, 0)       AS rework_from_ai_pct,
  total_prs        AS n_pr,
  ai_prs           AS n_ai_pr,
  agent_prs_total  AS n_agent_pr,
  deploys          AS n_deploys,
  total_tasks      AS n_tasks
FROM reporting.metrics_wide w
LEFT JOIN LATERAL (
  SELECT mi.value::numeric AS team_size
  FROM reporting.manual_inputs mi
  WHERE mi.project = w.project
    AND mi.field = 'total_engineers'
    AND mi.period_key <= to_char(w.period_start, 'YYYY-MM')
  ORDER BY mi.period_key DESC
  LIMIT 1
) ts ON true;

-- Backward-compat alias so existing consumers keep working during the migration.
CREATE VIEW reporting.metrics_ratios AS SELECT * FROM reporting.v_metrics;
