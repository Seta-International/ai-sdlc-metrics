# DB Foundation — Maturity Views Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all ratio and maturity-level computation into DB views so Grafana, the exporter, and the workbook read one source of truth — fixing the usage% denominator, adding sample-size columns, and computing the A–E × L1–L5 gated maturity model in `v_levels`.

**Architecture:** Postgres `reporting` schema. Raw counts stay in `metric_counts`; manual values in `manual_inputs`. Read-time views (`metrics_wide` → `v_metrics` → `v_levels`) derive everything. A new `thresholds` reference table (seeded with canonical values) and an `events` annotation table are added. Views are DROP+CREATE (column reorder). Tested with testcontainers Postgres against golden values taken from the workbook itself.

**Tech Stack:** Postgres 17, psycopg2, pytest, testcontainers.

## Global Constraints

- Postgres 17 (`postgres:17-alpine` in tests). SQL must be standard PG17.
- Every ratio is NULL-safe: divide-by-zero / missing input → `NULL`, never 0 (pairs with the NULL-preserving upsert).
- Percentages are stored as **0–100 numbers** in `v_metrics` (matches existing `metrics_ratios`, e.g. `ai_pr_pct = 30.0`), EXCEPT the maturity threshold comparisons in `v_levels`, which compare against **0–1 fractions** in the `thresholds` table (e.g. `usage_L2 = 0.50`) — so compare the raw fraction, not the ×100 value. Follow each task's SQL exactly.
- Maturity levels are integers 1–5. `overall = MIN(lvl_e, lvl_c, ROUND(AVG(lvl_a..lvl_e)))`.
- Durations are stored in **hours**.
- `conftest.py` applies `init.sql` then `views.sql` to the test container. Any new table a view depends on must be created **and seeded** in `init.sql` (reference data only — never project data).
- Canonical threshold values (workbook «Thresholds»): `pr_L3=0.30, pr_L4=0.50, usage_L2=0.50, aut_L4=0.30, aut_L5=0.60, int_L5=0.20`; display additions: `n_min=20, delta_noise=0.05, review_gate=1.00, usage_target=0.80, data_months_min=3`.
- Manual-input field names are canonical and must be reused verbatim: `total_engineers, cost_baseline, cost_actual, coverage_ai, ai_tool_cost_monthly`; quarterly `g1_agents_md, g2_ai_policy, g3_required_review, g4_eval_suite, g5_shared_library, g6_security_controls, g7_traceability, g8_model_governance, a2_dashboard, a4_near_universal, b4_dora_improving, b5_cost_multi_wf, b6_business_outcomes, b7_top_quartile, b8_client_reporting, c4_ai_vs_nonai, c5_evals, c6_sast_pii_required, c7_defect_zero, c8_evals_in_ci, c9_prompt_leak_pii, d3_defined_class, d5_multi_agent, evidence_a..e, improvement_action`. (Note: `c3_scan_ci`, `g1/g3/g6`, `d4_cycle_measured`, `b4` are auto-checkable but stored the same way.)

---

## Level-logic reference (translation of workbook «6. Levels» → SQL)

This table is the contract every level formula below implements. "Auto-flag" = derived from whether monthly metrics exist for the quarter; "Q-flag" = a Yes/No row in `manual_inputs`. Quarter of a month `YYYY-MM` = `YYYY-Q{ceil(MM/3)}`.

Per (project, quarter), aggregate the quarter's **monthly** rows: `usage_pct, ai_pr_pct, agent_task_pct, autonomy_pct, human_intervention_pct` are AVG over the quarter's months (from `v_metrics`); presence auto-flags are "does any month in the quarter have the raw count".

Auto-flags:
- `a1` = usage numbers exist (`ai_users_weekly_avg > 0` in any month) AND team_size known
- `a3` = `total_tasks > 0` (agent-share measurable)
- `b1` = `deploys > 0 AND weeks > 0`
- `b2` = all 4 DORA present (`lead_time_h, deploys, weeks, incidents, mttr_h` all non-null)
- `b3` = `cost_baseline` manual input exists
- `c2` = `rework_prs` present AND `total_prs > 0`
- `d1` = `agent_tasks > 0`
- `d2` = `agent_prs_merged` present (success/intervention measurable)

Level conditions (highest satisfied wins; thresholds are 0–1 fractions):

| Dim | L2 | L3 | L4 | L5 |
|---|---|---|---|---|
| **A** | `a1 AND usage ≥ usage_L2(.50)` | `a2 AND ai_pr_frac ≥ pr_L3(.30)` | `ai_pr_frac > pr_L4(.50) AND a3` | `a4 = Yes` |
| **B** | `c2?` no → `b1` | `b2 AND b3` | `b4 AND b5 AND b6` | `b7 AND b8` |
| **C ★** | `g3 OR c3` (≥1) | `g3 AND c3 AND c2` | `c4 AND c5 AND c6` | `c7 AND c8 AND c9` |
| **D** | `d1` | `d2` | `d3 AND d4 AND autonomy ≥ aut_L4(.30)` | `d5 AND d3 AND d4 AND autonomy ≥ aut_L5(.60) AND interv ≤ int_L5(.20)` |
| **E ★** | score = 2 | Core G1–G3 (score ≥3 incl core) | G1–G5 | G1–G8 (8/8) |

Where B's exact nesting (from the workbook O-formula): L5 needs `b2 AND b3 AND b4 AND b5 AND b6 AND b7 AND b8`; L4 needs `b4 AND b5 AND b6 AND b2 AND b3`; L3 needs `b2 AND b3`; L2 needs `b1`; else 1. C's nesting (P-formula): L5 = `c7 AND c8 AND c9 AND c4 AND c5 AND c6 AND g3 AND c2 AND b4`... — **do not hand-simplify; implement the nested `CASE` exactly as written in Task 4's SQL, which is the authority.** The table above is orientation; Task 4 SQL is the contract, and the golden test (Task 5) proves it matches the workbook.

---

## Task 1: `thresholds` and `events` tables (+ seeded reference data)

**Files:**
- Modify: `infra/db/init.sql` (append after `manual_inputs`, before nothing — end of file)
- Test: `tests/test_db.py` (add one test)

**Interfaces:**
- Produces: table `reporting.thresholds(key text pk, value numeric, note text)` seeded with 11 rows; table `reporting.events(id serial pk, ts timestamptz, project text, title text, tag text)`.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_db.py`:

```python
def test_thresholds_seeded(pg_url):
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT value FROM reporting.thresholds WHERE key = 'usage_L2'")
        assert float(cur.fetchone()[0]) == 0.50
        cur.execute("SELECT count(*) FROM reporting.thresholds")
        assert cur.fetchone()[0] == 11
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_db.py::test_thresholds_seeded -v`
Expected: FAIL — relation `reporting.thresholds` does not exist.

- [ ] **Step 3: Add the tables + seed to `init.sql`**

Append to `infra/db/init.sql`:

```sql
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_db.py::test_thresholds_seeded -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/db/init.sql tests/test_db.py
git commit -m "feat: add thresholds (seeded) + events tables to reporting schema"
```

---

## Task 2: `v_metrics` view — fixed usage denominator + `n_*` columns

Replaces `metrics_ratios`. Adds `team_size` via an as-of join to the latest monthly `total_engineers` (carried forward to sprints), the corrected capped `usage_pct`, and explicit `n_*` sample-size columns. Keeps every existing ratio column so nothing downstream breaks yet.

**Files:**
- Modify: `infra/db/views.sql` (replace the `metrics_ratios` block; keep `metrics_wide`)
- Test: `tests/test_views.py`

**Interfaces:**
- Consumes: `reporting.metrics_wide` (unchanged), `reporting.manual_inputs`.
- Produces: view `reporting.v_metrics` = all `metrics_wide` columns + all existing ratio columns + `team_size`, `usage_pct` (0–100, capped at 100), `n_pr`, `n_ai_pr`, `n_agent_pr`, `n_deploys`, `n_tasks`. A backward-compat view `reporting.metrics_ratios` remains as `SELECT * FROM reporting.v_metrics` so existing consumers/tests keep working.

- [ ] **Step 1: Write the failing tests**

Replace `test_metrics_ratios_view` in `tests/test_views.py` and add two tests:

```python
def test_usage_pct_uses_team_size_and_caps(pg_url):
    # 6 AI users, team_size 4 (manual, same month) -> raw 150% -> capped 100
    upsert_counts(pg_url, "P-Usage", "month", "2026-06", date(2026, 6, 1), date(2026, 6, 30),
                  {"ai_users_weekly_avg": 6.0, "engineers_active": 3})
    from collector.db import upsert_manual_input
    upsert_manual_input(pg_url, "P-Usage", "2026-06", "total_engineers", "4", "seed")
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT team_size, usage_pct FROM reporting.v_metrics "
                    "WHERE project='P-Usage' AND period_key='2026-06'")
        team, usage = cur.fetchone()
    assert float(team) == 4 and float(usage) == 100.0

def test_usage_pct_null_without_team_size(pg_url):
    upsert_counts(pg_url, "P-NoTeam", "month", "2026-06", date(2026, 6, 1), date(2026, 6, 30),
                  {"ai_users_weekly_avg": 3.0})
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT usage_pct FROM reporting.v_metrics "
                    "WHERE project='P-NoTeam' AND period_key='2026-06'")
        assert cur.fetchone()[0] is None

def test_n_columns_are_raw_counts(pg_url):
    upsert_counts(pg_url, "P-N", "sprint", "S1", date(2026, 6, 29), date(2026, 7, 13),
                  {"total_prs": 40, "ai_prs": 16, "agent_prs_total": 6, "deploys": 6,
                   "total_tasks": 50})
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT n_pr, n_ai_pr, n_agent_pr, n_deploys, n_tasks "
                    "FROM reporting.v_metrics WHERE project='P-N' AND period_key='S1'")
        assert [float(v) for v in cur.fetchone()] == [40, 16, 6, 6, 50]
```

Keep the existing `test_new_story_ratios` and `test_new_ratios_null_safe` (they read `metrics_ratios`, which now aliases `v_metrics` — they must still pass unchanged).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_views.py -v`
Expected: the three new tests FAIL (`v_metrics` does not exist / no `team_size`); the two kept tests still PASS.

- [ ] **Step 3: Replace the `metrics_ratios` block in `views.sql`**

In `infra/db/views.sql`, change line 6 to also drop the new objects (order matters — drop dependents first):

```sql
DROP VIEW IF EXISTS reporting.metrics_ratios;
DROP VIEW IF EXISTS reporting.v_levels;
DROP VIEW IF EXISTS reporting.v_metrics;
DROP VIEW IF EXISTS reporting.metrics_wide;
```

Then replace the entire `CREATE VIEW reporting.metrics_ratios AS ... ;` block (lines 50–71) with:

```sql
CREATE VIEW reporting.v_metrics AS
SELECT
  w.*,
  ts.team_size,
  100.0 * ai_prs               / NULLIF(total_prs, 0)        AS ai_pr_pct,
  LEAST(100.0 * ai_users_weekly_avg / NULLIF(ts.team_size, 0), 100.0) AS usage_pct,
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_views.py -v`
Expected: all PASS (three new + two kept).

- [ ] **Step 5: Commit**

```bash
git add infra/db/views.sql tests/test_views.py
git commit -m "feat: v_metrics view with team_size-based usage_pct (capped) and n_* columns"
```

---

## Task 3: quarter-aggregation CTE + auto-flags (foundation for `v_levels`)

Builds `reporting.v_quarter_metrics` — one row per (project, quarter) with the quarter-averaged ratios and the derived auto-flags. Isolating this makes the level logic in Task 4 readable and independently testable.

**Files:**
- Modify: `infra/db/views.sql` (add after `v_metrics`, before the compat alias is fine — but place it after `metrics_ratios` alias to keep the alias adjacent to `v_metrics`; append at end)
- Test: `tests/test_levels.py` (create)

**Interfaces:**
- Consumes: `reporting.v_metrics`, `reporting.manual_inputs`.
- Produces: view `reporting.v_quarter_metrics(project, quarter, usage_frac, ai_pr_frac, agent_task_frac, autonomy_frac, interv_frac, a1,a3,b1,b2,b3,c2,d1,d2 boolean, gov_score int, and every Q-flag boolean)`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_levels.py`:

```python
from datetime import date
import psycopg2
from collector.db import upsert_counts, upsert_manual_input


def _seed_p03(pg_url):
    """Platform-Team Q1: full-pass project -> A..E all 4, overall 4."""
    months = [("2026-01", date(2026,1,1), date(2026,1,31)),
              ("2026-02", date(2026,2,1), date(2026,2,28)),
              ("2026-03", date(2026,3,1), date(2026,3,31))]
    raw = [  # ai_users, ai_prs, total_prs, agent_tasks, total_tasks, autonomous, human_fixed, agent_total, agent_merged, deploys, weeks, incidents, mttr, lead, rework, reviewed
        (18,55,100,40,120,18,12,30,32,8,4,1,3,30,6,55),
        (19,60,100,45,120,20,13,33,36,10,4,1,2.5,24,5,60),
        (20,65,110,50,130,24,14,38,42,12,4,1,2,20,4,65)]
    for (pk,s,e),(au,aip,tp,at,tt,aut,hf,agt,agm,dep,wk,inc,mt,ld,rw,rev) in zip(months,raw):
        upsert_counts(pg_url,"P03","month",pk,s,e,{
            "ai_users_weekly_avg":au,"ai_prs":aip,"total_prs":tp,"agent_tasks":at,"total_tasks":tt,
            "agent_prs_autonomous":aut,"agent_prs_human_fixed":hf,"agent_prs_total":agt,"agent_prs_merged":agm,
            "deploys":dep,"weeks":wk,"incidents":inc,"mttr_h":mt,"lead_time_h":ld,
            "rework_prs":rw,"ai_prs_reviewed":rev})
        upsert_manual_input(pg_url,"P03",pk,"total_engineers","20","seed")
        upsert_manual_input(pg_url,"P03",pk,"cost_baseline","45","seed")
    q="2026-Q1"
    for f in ["g1_agents_md","g2_ai_policy","g3_required_review","g4_eval_suite","g5_shared_library",
              "a2_dashboard","b4_dora_improving","b5_cost_multi_wf","b6_business_outcomes",
              "c4_ai_vs_nonai","c5_evals","c6_sast_pii_required","d3_defined_class","d4_cycle_measured"]:
        upsert_manual_input(pg_url,"P03",q,f,"Yes","seed")


def test_quarter_metrics_aggregates_and_flags(pg_url):
    _seed_p03(pg_url)
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT b1, b2, b3, d1, d2, gov_score, "
                    "round(autonomy_frac::numeric,3) FROM reporting.v_quarter_metrics "
                    "WHERE project='P03' AND quarter='2026-Q1'")
        b1,b2,b3,d1,d2,gov,aut = cur.fetchone()
    assert b1 and b2 and b3 and d1 and d2
    assert gov == 5           # G1..G5 = Yes
    assert float(aut) > 0.30  # autonomous/agent_total averaged
```

- [ ] **Step 2: Register `test_levels.py` fixtures & run to verify failure**

Run: `pytest tests/test_levels.py::test_quarter_metrics_aggregates_and_flags -v`
Expected: FAIL — relation `reporting.v_quarter_metrics` does not exist.

- [ ] **Step 3: Add `v_quarter_metrics` to `views.sql`**

Append to `infra/db/views.sql`:

```sql
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
flags AS (
  SELECT project, period_key AS quarter,
    max(value) FILTER (WHERE field='total_engineers') IS NOT NULL AS has_team,  -- unused placeholder
    bool_or(field='cost_baseline')                    AS b3,
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
SELECT a.*, f.b3, f.g1,f.g2,f.g3,f.g4,f.g5,f.g6,f.g7,f.g8, f.a2,f.a4,
       f.b4,f.b5,f.b6,f.b7,f.b8, f.c3,f.c4,f.c5,f.c6,f.c7,f.c8,f.c9,
       f.d3,f.d4,f.d5, f.gov_score
FROM agg a
LEFT JOIN flags f USING (project, quarter);
```

Note: the `has_team` line is a harmless unused expression kept only to avoid an empty grouping edge; the level logic never reads it. Remove it if PG complains — it does not.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_levels.py::test_quarter_metrics_aggregates_and_flags -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/db/views.sql tests/test_levels.py
git commit -m "feat: v_quarter_metrics — quarter aggregation + auto/Q flags for maturity"
```

---

## Task 4: `v_levels` view — A–E levels + MIN gate

**Files:**
- Modify: `infra/db/views.sql` (append)
- Test: `tests/test_levels.py`

**Interfaces:**
- Consumes: `reporting.v_quarter_metrics`, `reporting.thresholds`.
- Produces: view `reporting.v_levels(project, quarter, lvl_a, lvl_b, lvl_c, lvl_d, lvl_e, overall)` — all integers 1–5.

- [ ] **Step 1: Write the failing golden test**

Add to `tests/test_levels.py`:

```python
def test_p03_full_pass_levels(pg_url):
    _seed_p03(pg_url)
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT lvl_a,lvl_b,lvl_c,lvl_d,lvl_e,overall FROM reporting.v_levels "
                    "WHERE project='P03' AND quarter='2026-Q1'")
        assert list(cur.fetchone()) == [4, 4, 4, 4, 4, 4]
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_levels.py::test_p03_full_pass_levels -v`
Expected: FAIL — relation `reporting.v_levels` does not exist.

- [ ] **Step 3: Add `v_levels` to `views.sql`**

Append to `infra/db/views.sql`:

```sql
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
      WHEN NOT q.d1 THEN 1
      WHEN NOT q.d2 THEN 2
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
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_levels.py::test_p03_full_pass_levels -v`
Expected: PASS `[4,4,4,4,4,4]`.

If a dimension is off, fix that dimension's `CASE` against the reference table above — the golden values are the authority.

- [ ] **Step 5: Commit**

```bash
git add infra/db/views.sql tests/test_levels.py
git commit -m "feat: v_levels — A-E maturity levels with MIN(E,C,avg) gate"
```

---

## Task 5: golden gate test (P02 — high adoption, gated to overall 1)

Proves the MIN gate: A=4 but E=1 ⇒ OVERALL=1. This is the single most important behavior of the whole model.

**Files:**
- Test: `tests/test_levels.py`

**Interfaces:**
- Consumes: `v_levels`.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_levels.py`:

```python
def _seed_p02(pg_url):
    """Internal-Tool Q1: high adoption, almost no governance -> A=4, E=1, overall=1."""
    months = [("2026-01", date(2026,1,1), date(2026,1,31)),
              ("2026-02", date(2026,2,1), date(2026,2,28)),
              ("2026-03", date(2026,3,1), date(2026,3,31))]
    raw = [(10,30,50,8,100,3,4),(11,32,52,8,100,3,4),(12,31,50,9,100,3,4)]
    for (pk,s,e),(au,aip,tp,at,tt,dep,inc) in zip(months,raw):
        upsert_counts(pg_url,"P02","month",pk,s,e,{
            "ai_users_weekly_avg":au,"ai_prs":aip,"total_prs":tp,"agent_tasks":at,"total_tasks":tt,
            "deploys":dep,"weeks":4,"incidents":inc,"mttr_h":6,"lead_time_h":45,
            "rework_prs":11,"ai_prs_reviewed":20,"agent_prs_total":0,"agent_prs_merged":0})
        upsert_manual_input(pg_url,"P02",pk,"total_engineers","15","seed")
        upsert_manual_input(pg_url,"P02",pk,"cost_baseline","45","seed")
    q="2026-Q1"
    # governance essentially empty; a couple of adoption/delivery flags only
    for f in ["a2_dashboard","b4_dora_improving"]:
        upsert_manual_input(pg_url,"P02",q,f,"Yes","seed")
    upsert_manual_input(pg_url,"P02",q,"c3_scan_ci","Yes","auto-check")

def test_p02_governance_gate_caps_overall(pg_url):
    _seed_p02(pg_url)
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT lvl_a, lvl_e, overall FROM reporting.v_levels "
                    "WHERE project='P02' AND quarter='2026-Q1'")
        lvl_a, lvl_e, overall = cur.fetchone()
    assert lvl_a == 4          # adoption is high
    assert lvl_e == 1          # governance floor
    assert overall == 1        # MIN gate caps it
```

- [ ] **Step 2: Run to verify (should already pass if Task 4 is correct)**

Run: `pytest tests/test_levels.py -v`
Expected: all PASS. If `test_p02` fails, the gate/dimension logic is wrong — fix Task 4's SQL, not the test.

- [ ] **Step 3: Commit**

```bash
git add tests/test_levels.py
git commit -m "test: golden gate case — P02 high adoption capped to overall 1 by E-gate"
```

---

## Task 6: local seed — exercise every guard branch

Extends `infra/db/seed.sql` so the local Grafana stack shows every guard: usage>100% capped, n<20 suppression, a gated project, an unmeasured-sentinel, quarterly flags so levels render, and an event annotation.

**Files:**
- Modify: `infra/db/seed.sql`
- Modify: `tests/conftest.py` (load seed into a dedicated test so the seed itself is smoke-tested)
- Test: `tests/test_seed.py` (create)

**Interfaces:**
- Consumes: all views.
- Produces: seed rows for a third local project `Gated-Demo` (A high, E low), a `Tiny-Sample` project (n<20), an `events` row, and Future/TeacherZone quarterly flags.

- [ ] **Step 1: Write the failing test**

Create `tests/test_seed.py`:

```python
import os, psycopg2

def test_seed_loads_and_exercises_guards(pg_url):
    base = os.path.join(os.path.dirname(__file__), "..", "infra", "db")
    with psycopg2.connect(pg_url) as conn:
        with conn.cursor() as cur, open(os.path.join(base, "seed.sql")) as f:
            cur.execute(f.read())
        conn.commit()
        with conn.cursor() as cur:
            # usage capped at 100 somewhere
            cur.execute("SELECT max(usage_pct) FROM reporting.v_metrics")
            assert float(cur.fetchone()[0]) <= 100.0
            # gated demo project exists and is capped
            cur.execute("SELECT overall FROM reporting.v_levels WHERE project='Gated-Demo'")
            assert cur.fetchone()[0] == 1
            # an event annotation exists
            cur.execute("SELECT count(*) FROM reporting.events")
            assert cur.fetchone()[0] >= 1
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_seed.py -v`
Expected: FAIL — no `Gated-Demo` / no events rows.

- [ ] **Step 3: Append guard fixtures to `seed.sql`**

Append to `infra/db/seed.sql`:

```sql
-- Gated-Demo: high adoption, empty governance -> A high, E=1, overall capped to 1.
INSERT INTO reporting.metric_counts (project, period_type, period_key, period_start, period_end, metric_key, value) VALUES
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','ai_users_weekly_avg',12),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','ai_prs',40),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','total_prs',60),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','deploys',6),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','weeks',4),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','incidents',1),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','mttr_h',5),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','lead_time_h',40),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','total_tasks',80),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','rework_prs',6);
INSERT INTO reporting.manual_inputs (project, period_key, field, value, entered_by) VALUES
  ('Gated-Demo','2026-06','total_engineers','15','seed'),
  ('Gated-Demo','2026-Q2','a2_dashboard','Yes','seed');

-- Tiny-Sample: n<20 so the presentation layer greys its percentages.
INSERT INTO reporting.metric_counts (project, period_type, period_key, period_start, period_end, metric_key, value) VALUES
  ('Tiny-Sample','sprint','S1',DATE '2026-06-29',DATE '2026-07-13','total_prs',8),
  ('Tiny-Sample','sprint','S1',DATE '2026-06-29',DATE '2026-07-13','ai_prs',3),
  ('Tiny-Sample','sprint','S1',DATE '2026-06-29',DATE '2026-07-13','agent_prs_total',2);

-- Future/TeacherZone quarterly flags so their levels render (Q3 in seed).
INSERT INTO reporting.manual_inputs (project, period_key, field, value, entered_by) VALUES
  ('Future','2026-Q3','g3_required_review','Yes','auto-check'),
  ('Future','2026-Q3','c3_scan_ci','Yes','auto-check'),
  ('Future','2026-Q3','b4_dora_improving','Yes','auto-check')
ON CONFLICT (project, period_key, field) DO NOTHING;

-- A practice-change annotation for the trend charts.
INSERT INTO reporting.events (ts, project, title, tag) VALUES
  (TIMESTAMPTZ '2026-07-01 09:00+00', 'Future', 'Enabled branch protection', 'practice-change');
```

Note the seed's Q3 months (`2026-07` → Q3) already exist for Future/TeacherZone, so their `v_levels` rows compute from those flags.

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_seed.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/db/seed.sql tests/test_seed.py
git commit -m "feat: seed guard-branch fixtures (gated project, tiny sample, event)"
```

---

## Task 7: full suite + local Grafana stack smoke-check

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `pytest -q`
Expected: all pass (test_db needs Docker for testcontainers).

- [ ] **Step 2: Bring up the local stack and confirm the views populate**

Run:
```bash
docker compose -f infra/docker/compose.local.yml up -d
sleep 8
docker compose -f infra/docker/compose.local.yml exec -T postgres \
  psql -U admin -d reporting -c \
  "SELECT project, quarter, lvl_a, lvl_e, overall FROM reporting.v_levels ORDER BY project;"
```
Expected: rows for Future, TeacherZone, Gated-Demo (overall=1), with no error.

- [ ] **Step 3: Confirm no usage>100 anywhere**

Run:
```bash
docker compose -f infra/docker/compose.local.yml exec -T postgres \
  psql -U admin -d reporting -c \
  "SELECT count(*) FROM reporting.v_metrics WHERE usage_pct > 100;"
```
Expected: `0`.

- [ ] **Step 4: Commit any seed/threshold tuning discovered during smoke-check**

```bash
git add -A && git commit -m "chore: local stack smoke-check for v_levels/v_metrics" || echo "nothing to commit"
```

---

## Self-Review

- **Spec coverage:** `v_metrics` (usage fix + n_*) ✓ Task 2; `v_levels` (A–E + MIN gate) ✓ Tasks 3–5; `thresholds` table ✓ Task 1; `events` table ✓ Task 1; seed exercises every guard ✓ Task 6; local-first verification ✓ Task 7. Deletion of the in-Grafana `_maturity_case` and the dashboards belong to **Plan 3** (they consume `v_levels`). The exporter reading `v_levels` instead of Excel formulas belongs to **Plan 2/3**.
- **Type consistency:** `v_metrics.usage_pct` and all `*_pct` are 0–100; `v_quarter_metrics.*_frac` are 0–1; `thresholds.value` are 0–1 fractions compared against `*_frac`. `v_levels` columns are `lvl_a..lvl_e, overall` integers — reused verbatim by Plan 3.
- **Open follow-up for Plan 3:** once dashboards read `v_levels`, drop the `metrics_ratios` compat alias and the legacy `usage_rate_pct` column in a cleanup task.
