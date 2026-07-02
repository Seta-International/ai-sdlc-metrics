CREATE SCHEMA IF NOT EXISTS reporting;

-- Clean refactor: the ratio-per-sprint table is replaced by raw counts.
DROP TABLE IF EXISTS reporting.ai_sprint_metrics;

CREATE TABLE IF NOT EXISTS reporting.metric_counts (
  project      text        NOT NULL,
  period_type  text        NOT NULL CHECK (period_type IN ('sprint', 'month')),
  period_key   text        NOT NULL,  -- 'S6' or '2026-06'
  period_start date        NOT NULL,
  period_end   date        NOT NULL,
  metric_key   text        NOT NULL,  -- e.g. 'ai_prs', 'total_prs', 'lead_time_h'
  value        numeric     NOT NULL,
  collected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project, period_type, period_key, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_metric_counts_lookup
  ON reporting.metric_counts (project, period_type, period_start);

CREATE TABLE IF NOT EXISTS reporting.manual_inputs (
  project     text        NOT NULL,
  period_key  text        NOT NULL,  -- '2026-06' or '2026-Q2'
  field       text        NOT NULL,  -- 'total_engineers', 'cost_baseline', 'g2_ai_policy', ...
  value       text        NOT NULL,  -- numbers, Yes/No, and free text stored uniformly
  entered_by  text,
  entered_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project, period_key, field)
);
