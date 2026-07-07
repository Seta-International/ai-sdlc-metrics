CREATE SCHEMA IF NOT EXISTS reporting;

-- Clean refactor: the ratio-per-sprint table is replaced by raw counts.
DROP TABLE IF EXISTS reporting.ai_sprint_metrics;

CREATE TABLE IF NOT EXISTS reporting.metric_counts (
  project      text        NOT NULL,
  period_type  text        NOT NULL CHECK (period_type IN ('month')),
  period_key   text        NOT NULL,  -- '2026-06'
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

CREATE TABLE IF NOT EXISTS reporting.thresholds (
  key   text    NOT NULL PRIMARY KEY,
  value numeric NOT NULL,
  note  text
);

INSERT INTO reporting.thresholds (key, value, note) VALUES
  ('pr_L3',           0.30, 'Adoption L3: AI-PR share >= 30%'),
  ('pr_L4',           0.50, 'Adoption L4: AI-PR share > 50%'),
  ('usage_L2',        0.50, 'Adoption L2: usage rate >= 50%'),
  ('aut_L4',          0.30, 'Agent L4: autonomy >= 30%'),
  ('aut_L5',          0.60, 'Agent L5: autonomy >= 60%'),
  ('int_L5',          0.20, 'Agent L5: intervention <= 20%'),
  ('n_min',          20.00, 'Below this n, suppress the %'),
  ('delta_noise',     0.05, '|delta| below this renders grey "equivalent"'),
  ('review_gate',     1.00, 'Gate C: AI-PR review coverage target 100%'),
  ('usage_target',    0.80, 'Usage gauge target >= 80%'),
  ('data_months_min', 3.00, 'Min months to draw a break-even projection')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS reporting.events (
  id      serial      PRIMARY KEY,
  ts      timestamptz NOT NULL,
  project text        NOT NULL,
  title   text        NOT NULL,
  tag     text        NOT NULL DEFAULT 'practice-change'
);
