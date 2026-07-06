-- Read-time layer over metric_counts: consumers (Grafana, exporter) read these
-- views; ratios are never stored. Apply after init.sql:
--   psql "$REPORTING_DB_URL" -f infra/db/views.sql
-- Drop first: CREATE OR REPLACE cannot add/reorder view columns.

DROP VIEW IF EXISTS reporting.metrics_ratios;
DROP VIEW IF EXISTS reporting.v_levels;
DROP VIEW IF EXISTS reporting.v_quarter_metrics;
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
    AND mi.value ~ '^[0-9]+(\.[0-9]+)?$'
  ORDER BY mi.period_key DESC
  LIMIT 1
) ts ON true;

-- Backward-compat alias so existing consumers keep working during the migration.
CREATE VIEW reporting.metrics_ratios AS SELECT * FROM reporting.v_metrics;

CREATE VIEW reporting.v_quarter_metrics AS
WITH months AS (
  SELECT
    m.project,
    to_char(m.period_start, 'YYYY') || '-Q' ||
      ceil(extract(month FROM m.period_start) / 3.0)::int AS quarter,
    m.usage_pct, m.ai_pr_pct, m.agent_task_pct, m.autonomy_pct, m.human_intervention_pct,
    m.ai_users_weekly_avg, m.total_tasks, m.deploys, m.weeks, m.incidents, m.mttr_h,
    m.lead_time_h, m.rework_prs, m.total_prs, m.agent_tasks, m.agent_prs_merged
  FROM reporting.v_metrics m
  WHERE m.period_type = 'month'
),
agg AS (
  SELECT project, quarter,
    avg(usage_pct)/100.0              AS usage_frac,
    avg(ai_pr_pct)/100.0              AS ai_pr_frac,
    avg(agent_task_pct)/100.0         AS agent_task_frac,
    avg(autonomy_pct)/100.0           AS autonomy_frac,
    avg(human_intervention_pct)/100.0 AS interv_frac,
    bool_or(ai_users_weekly_avg > 0)  AS a1,
    bool_or(total_tasks > 0)          AS a3,
    bool_or(deploys > 0 AND weeks > 0) AS b1,
    bool_or(lead_time_h IS NOT NULL AND deploys IS NOT NULL AND weeks IS NOT NULL
            AND incidents IS NOT NULL AND mttr_h IS NOT NULL) AS b2,
    bool_or(rework_prs IS NOT NULL AND total_prs > 0) AS c2,
    bool_or(agent_tasks > 0)          AS d1,
    bool_or(agent_prs_merged IS NOT NULL) AS d2
  FROM months GROUP BY project, quarter
),
cost AS (  -- b3: cost_baseline is a MONTHLY manual field; presence maps up to the quarter
  SELECT project,
    substr(period_key, 1, 4) || '-Q' || ceil(substr(period_key, 6, 2)::int / 3.0)::int AS quarter,
    bool_or(field = 'cost_baseline') AS b3
  FROM reporting.manual_inputs
  WHERE period_key ~ '^[0-9]{4}-[0-9]{2}$'
  GROUP BY project, quarter
),
flags AS (
  SELECT project, period_key AS quarter,
    bool_or(field='g1_agents_md'      AND value='Yes') AS g1,
    bool_or(field='g2_ai_policy'      AND value='Yes') AS g2,
    bool_or(field='g3_required_review' AND value='Yes') AS g3,
    bool_or(field='g4_eval_suite'     AND value='Yes') AS g4,
    bool_or(field='g5_shared_library' AND value='Yes') AS g5,
    bool_or(field='g6_security_controls' AND value='Yes') AS g6,
    bool_or(field='g7_traceability'   AND value='Yes') AS g7,
    bool_or(field='g8_model_governance' AND value='Yes') AS g8,
    bool_or(field='a2_dashboard'      AND value='Yes') AS a2,
    bool_or(field='a4_near_universal' AND value='Yes') AS a4,
    bool_or(field='b4_dora_improving' AND value='Yes') AS b4,
    bool_or(field='b5_cost_multi_wf'  AND value='Yes') AS b5,
    bool_or(field='b6_business_outcomes' AND value='Yes') AS b6,
    bool_or(field='b7_top_quartile'   AND value='Yes') AS b7,
    bool_or(field='b8_client_reporting' AND value='Yes') AS b8,
    bool_or(field='c3_scan_ci'        AND value='Yes') AS c3,
    bool_or(field='c4_ai_vs_nonai'    AND value='Yes') AS c4,
    bool_or(field='c5_evals'          AND value='Yes') AS c5,
    bool_or(field='c6_sast_pii_required' AND value='Yes') AS c6,
    bool_or(field='c7_defect_zero'    AND value='Yes') AS c7,
    bool_or(field='c8_evals_in_ci'    AND value='Yes') AS c8,
    bool_or(field='c9_prompt_leak_pii' AND value='Yes') AS c9,
    bool_or(field='d3_defined_class'  AND value='Yes') AS d3,
    bool_or(field='d4_cycle_measured' AND value='Yes') AS d4,
    bool_or(field='d5_multi_agent'    AND value='Yes') AS d5,
    ( (bool_or(field='g1_agents_md' AND value='Yes'))::int
    + (bool_or(field='g2_ai_policy' AND value='Yes'))::int
    + (bool_or(field='g3_required_review' AND value='Yes'))::int
    + (bool_or(field='g4_eval_suite' AND value='Yes'))::int
    + (bool_or(field='g5_shared_library' AND value='Yes'))::int
    + (bool_or(field='g6_security_controls' AND value='Yes'))::int
    + (bool_or(field='g7_traceability' AND value='Yes'))::int
    + (bool_or(field='g8_model_governance' AND value='Yes'))::int ) AS gov_score
  FROM reporting.manual_inputs
  WHERE period_key LIKE '%-Q%'
  GROUP BY project, period_key
)
SELECT a.*, COALESCE(c.b3, false) AS b3,
       f.g1,f.g2,f.g3,f.g4,f.g5,f.g6,f.g7,f.g8, f.a2,f.a4,
       f.b4,f.b5,f.b6,f.b7,f.b8, f.c3,f.c4,f.c5,f.c6,f.c7,f.c8,f.c9,
       f.d3,f.d4,f.d5, f.gov_score
FROM agg a
LEFT JOIN cost c USING (project, quarter)
LEFT JOIN flags f USING (project, quarter);

CREATE VIEW reporting.v_levels AS
WITH t AS (
  SELECT
    max(value) FILTER (WHERE key='usage_L2') AS usage_L2,
    max(value) FILTER (WHERE key='pr_L3')    AS pr_L3,
    max(value) FILTER (WHERE key='pr_L4')    AS pr_L4,
    max(value) FILTER (WHERE key='aut_L4')   AS aut_L4,
    max(value) FILTER (WHERE key='aut_L5')   AS aut_L5,
    max(value) FILTER (WHERE key='int_L5')   AS int_L5
  FROM reporting.thresholds
),
lv AS (
  SELECT q.project, q.quarter,
    -- A. Adoption
    CASE
      WHEN q.a4 THEN 5
      WHEN q.ai_pr_frac > t.pr_L4 AND q.a3 THEN 4
      WHEN q.a2 AND q.ai_pr_frac >= t.pr_L3 THEN 3
      WHEN q.a1 AND q.usage_frac >= t.usage_L2 THEN 2
      ELSE 1 END AS lvl_a,
    -- B. Delivery
    CASE
      WHEN q.b2 AND q.b3 AND q.b4 AND q.b5 AND q.b6 AND q.b7 AND q.b8 THEN 5
      WHEN q.b4 AND q.b5 AND q.b6 AND q.b2 AND q.b3 THEN 4
      WHEN q.b2 AND q.b3 THEN 3
      WHEN q.b1 THEN 2
      ELSE 1 END AS lvl_b,
    -- C. Quality (gate)
    CASE
      WHEN q.c7 AND q.c8 AND q.c9 AND q.c4 AND q.c5 AND q.c6 AND q.g3 AND q.c2 AND q.b4 THEN 5
      WHEN q.c4 AND q.c5 AND q.c6 AND q.g3 AND q.c2 AND q.b4 THEN 4
      WHEN q.g3 AND q.c3 AND q.c2 THEN 3
      WHEN q.g3 OR q.c3 THEN 2
      ELSE 1 END AS lvl_c,
    -- D. Agent
    CASE
      WHEN q.d1 IS NOT TRUE THEN 1
      WHEN q.d2 IS NOT TRUE THEN 2
      WHEN q.d5 AND q.d3 AND q.d4 AND q.autonomy_frac >= t.aut_L5 AND q.interv_frac <= t.int_L5 THEN 5
      WHEN q.d3 AND q.d4 AND q.autonomy_frac >= t.aut_L4 THEN 4
      ELSE 3 END AS lvl_d,
    -- E. Governance (gate)
    CASE
      WHEN q.gov_score = 8 THEN 5
      WHEN q.g1 AND q.g2 AND q.g3 AND q.g4 AND q.g5 THEN 4
      WHEN q.g1 AND q.g2 AND q.g3 THEN 3
      WHEN q.gov_score >= 2 THEN 2
      ELSE 1 END AS lvl_e
  FROM reporting.v_quarter_metrics q CROSS JOIN t
)
SELECT project, quarter, lvl_a, lvl_b, lvl_c, lvl_d, lvl_e,
  LEAST(lvl_e, lvl_c, round((lvl_a + lvl_b + lvl_c + lvl_d + lvl_e) / 5.0))::int AS overall
FROM lv;
