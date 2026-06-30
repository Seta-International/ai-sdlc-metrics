CREATE SCHEMA IF NOT EXISTS reporting;

CREATE TABLE IF NOT EXISTS reporting.ai_sprint_metrics (
  sprint_label  text        NOT NULL,
  project       text        NOT NULL DEFAULT 'FUT',
  collected_at  timestamptz NOT NULL DEFAULT now(),
  -- Adoption
  a2_pr_ai_ratio           numeric,
  a3_agent_issue_ratio     numeric,
  a4_ai_issue_ratio        numeric,
  -- DORA
  b1_lead_time_median_hours    numeric,
  b2_deploy_frequency_per_week numeric,
  b3_change_failure_rate       numeric,
  b4_mttr_hours                numeric,
  -- Quality
  c1_rework_ratio          numeric,
  c2_ai_pr_review_ratio    numeric,
  c4_security_alerts       integer,
  -- Agent maturity
  d1_agent_completion_ratio    numeric,
  d2_human_intervention_ratio  numeric,
  d3_autonomy_ratio            numeric,
  d4_agent_cycle_time_hours    numeric,
  -- Manual inputs (pushed via workflow_dispatch)
  a1_adoption_rate         numeric,
  b5_cost_improvement_pct  numeric,
  c3_ai_code_coverage_pct  numeric,
  PRIMARY KEY (sprint_label, project)
);

CREATE INDEX IF NOT EXISTS idx_ai_sprint_metrics_project
  ON reporting.ai_sprint_metrics (project, sprint_label);
