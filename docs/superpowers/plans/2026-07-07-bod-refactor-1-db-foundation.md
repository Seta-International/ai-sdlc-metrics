# BOD Board Refactor — Plan 1: DB Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the read-only DB layer the decision-first BOD board needs — central benchmark thresholds plus four aggregate views (ROI, level distribution, penetration, attention) that scale to N projects.

**Architecture:** Everything is read-time. New rows in the existing `reporting.thresholds` table hold board KPI benchmark bands (one central, documented place). Four new views over `metrics_wide` / `v_metrics` / `v_levels` do all portfolio aggregation so the Grafana generator (Plan 2) carries no heavy inline SQL. Rate-dependent $ math stays out of the DB (blended rates live in `projects.json`); views expose rate-independent quantities (hours, cost, counts, levels) and Plan 2 applies the rate.

**Tech Stack:** PostgreSQL (SQL views in `infra/db/views.sql`, seed table in `infra/db/init.sql`), pytest + testcontainers Postgres (`tests/test_views.py`, fixture `pg_url`), `collector.db.upsert_counts` / `upsert_manual_input` helpers.

## Global Constraints

- Views are read-time only; ratios/aggregates are never stored (repo rule).
- Calculators/views return **NULL when there is no data, never 0** — pairs with the NULL-preserving upsert. No fabricated values.
- `CREATE OR REPLACE` cannot add/reorder view columns → every view is `DROP VIEW IF EXISTS` first, dependents dropped before their sources.
- View tests need Docker (testcontainers Postgres); run with `pytest tests/test_views.py::<name>`.
- Apply order after schema edits: `psql "$REPORTING_DB_URL" -f infra/db/init.sql` then `-f infra/db/views.sql`.
- Commit style: conventional prefix, e.g. `feat: ...`; no Jira key required for infra-only changes here.

---

### Task 1: Central board-KPI benchmark thresholds

Add research-based benchmark rows to `reporting.thresholds` so Plan 2 reads targets from one documented place. Each row carries a `note` citing its basis.

**Files:**
- Modify: `infra/db/init.sql` (append rows to the existing `INSERT INTO reporting.thresholds ... VALUES (...) ON CONFLICT (key) DO NOTHING;` block, lines ~37–49)
- Test: `tests/test_views.py` (new test `test_board_benchmark_thresholds_present`)

**Interfaces:**
- Produces: threshold keys readable via `SELECT value FROM reporting.thresholds WHERE key = ?`. New keys: `roi_payback_ok` (0 — net ≥ 0 is green), `throughput_lift_target` (0.08 — DX realistic ~8%), `sec_alerts_crit` (1 — ≥1 open critical is red), `lead_elite_h` (24), `lead_high_h` (168), `cfr_elite` (0.15), `attn_roi_neg_periods` (2 — consecutive negative periods that flags a decision).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_views.py  (append)
def test_board_benchmark_thresholds_present(pg_url):
    import psycopg2
    expected = {
        "roi_payback_ok": 0,
        "throughput_lift_target": 0.08,
        "sec_alerts_crit": 1,
        "lead_elite_h": 24,
        "lead_high_h": 168,
        "cfr_elite": 0.15,
        "attn_roi_neg_periods": 2,
    }
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT key, value, note FROM reporting.thresholds "
                    "WHERE key = ANY(%s)", (list(expected),))
        rows = cur.fetchall()
    got = {k: float(v) for k, v, _ in rows}
    assert got == expected
    assert all(note for _, _, note in rows), "every benchmark row must document its basis"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_views.py::test_board_benchmark_thresholds_present -v`
Expected: FAIL — assertion `got == expected` fails (rows absent).

- [ ] **Step 3: Add the threshold rows**

In `infra/db/init.sql`, inside the existing `reporting.thresholds` VALUES list, add before the closing `ON CONFLICT` line:

```sql
  ('roi_payback_ok',         0.00, 'ROI: cumulative net >= 0 is green (TCO-adjusted)'),
  ('throughput_lift_target', 0.08, 'Throughput: DX realistic ~8% lift target (not vendor 10x)'),
  ('sec_alerts_crit',        1.00, 'Risk: >=1 open critical code-scanning alert is red'),
  ('lead_elite_h',          24.00, 'DORA lead time: elite band < 1 day (directional post-2025)'),
  ('lead_high_h',          168.00, 'DORA lead time: high band < 1 week (directional post-2025)'),
  ('cfr_elite',              0.15, 'DORA change-fail rate: elite band <= 15%'),
  ('attn_roi_neg_periods',   2.00, 'Attention: N consecutive negative-ROI periods flags a decision'),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_views.py::test_board_benchmark_thresholds_present -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/db/init.sql tests/test_views.py
git commit -m "feat: central board-KPI benchmark thresholds"
```

---

### Task 2: `v_portfolio_roi` — per-project monthly ROI with running totals

Rate-independent ROI inputs: hours saved and tool cost per project per month, plus a per-project cumulative running total. Plan 2 multiplies cumulative hours by each project's blended rate (from `projects.json`) and subtracts cumulative cost. ROI is monthly by nature (`ai_time_saved_h` and `ai_tool_cost_monthly` are monthly).

**Files:**
- Modify: `infra/db/views.sql` (add view + its DROP at the top DROP block)
- Test: `tests/test_views.py` (new test `test_v_portfolio_roi_cumulative`)

**Interfaces:**
- Consumes: `reporting.metrics_wide` (`ai_time_saved_h`, `period_start`), `reporting.manual_inputs` (`field='ai_tool_cost_monthly'`).
- Produces: view `reporting.v_portfolio_roi(project text, period_key text, period_start date, hours_saved numeric, tool_cost numeric, cum_hours_saved numeric, cum_tool_cost numeric)` — one row per project per month, ordered by `period_start`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_views.py  (append)
def test_v_portfolio_roi_cumulative(pg_url):
    import psycopg2
    from datetime import date
    from collector.db import upsert_counts, upsert_manual_input
    upsert_counts(pg_url, "P-Roi", "month", "2026-05", date(2026, 5, 1), date(2026, 5, 31),
                  {"ai_time_saved_h": 10.0})
    upsert_counts(pg_url, "P-Roi", "month", "2026-06", date(2026, 6, 1), date(2026, 6, 30),
                  {"ai_time_saved_h": 30.0})
    upsert_manual_input(pg_url, "P-Roi", "2026-05", "ai_tool_cost_monthly", "100", "seed")
    upsert_manual_input(pg_url, "P-Roi", "2026-06", "ai_tool_cost_monthly", "100", "seed")
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT period_key, hours_saved, tool_cost, cum_hours_saved, cum_tool_cost "
                    "FROM reporting.v_portfolio_roi WHERE project='P-Roi' ORDER BY period_start")
        rows = [[float(x) if x is not None else None for x in r] [1:] for r in cur.fetchall()]
        # order preserved separately:
        cur.execute("SELECT period_key FROM reporting.v_portfolio_roi "
                    "WHERE project='P-Roi' ORDER BY period_start")
        keys = [r[0] for r in cur.fetchall()]
    assert keys == ["2026-05", "2026-06"]
    assert rows == [[10.0, 100.0, 10.0, 100.0], [30.0, 100.0, 40.0, 200.0]]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_views.py::test_v_portfolio_roi_cumulative -v`
Expected: FAIL — `relation "reporting.v_portfolio_roi" does not exist`.

- [ ] **Step 3: Add the view**

In `infra/db/views.sql`, add to the top DROP block (before `DROP VIEW IF EXISTS reporting.metrics_ratios;`):

```sql
DROP VIEW IF EXISTS reporting.v_portfolio_roi;
```

Then add the view definition (after `metrics_wide` is defined, e.g. below `v_metrics`):

```sql
CREATE VIEW reporting.v_portfolio_roi AS
WITH m AS (
  SELECT w.project, w.period_key, w.period_start,
         w.ai_time_saved_h AS hours_saved,
         mi.value::numeric  AS tool_cost
  FROM reporting.metrics_wide w
  LEFT JOIN reporting.manual_inputs mi
    ON mi.project = w.project AND mi.period_key = w.period_key
   AND mi.field = 'ai_tool_cost_monthly'
  WHERE w.period_type = 'month'
)
SELECT project, period_key, period_start, hours_saved, tool_cost,
       sum(COALESCE(hours_saved, 0)) OVER w AS cum_hours_saved,
       sum(COALESCE(tool_cost, 0))   OVER w AS cum_tool_cost
FROM m
WINDOW w AS (PARTITION BY project ORDER BY period_start
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_views.py::test_v_portfolio_roi_cumulative -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/db/views.sql tests/test_views.py
git commit -m "feat: v_portfolio_roi view with per-project running totals"
```

---

### Task 3: `v_level_distribution` — count of projects at each A–E level

Portfolio maturity as a shape (how many projects at each level per dimension), not 50 rows. Feeds §4 distribution.

**Files:**
- Modify: `infra/db/views.sql` (add view + DROP)
- Test: `tests/test_views.py` (new test `test_v_level_distribution_counts`)

**Interfaces:**
- Consumes: `reporting.v_levels` (`project, quarter, lvl_a..lvl_e, overall`).
- Produces: view `reporting.v_level_distribution(quarter text, dimension text, level int, n_projects int)` where `dimension ∈ {'A','B','C','D','E','OVERALL'}`. Uses each project's latest quarter only.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_views.py  (append)
def _seed_quarter_levels(pg_url, project, quarter, flags):
    # Minimal quarterly manual flags so v_levels computes; flags is a dict of field->'Yes'.
    from collector.db import upsert_manual_input
    for field, val in flags.items():
        upsert_manual_input(pg_url, project, quarter, field, val, "seed")


def test_v_level_distribution_counts(pg_url):
    import psycopg2
    # Two projects, same quarter: both end at some A level. We assert the
    # distribution sums to the number of projects for dimension 'A'.
    _seed_quarter_levels(pg_url, "P-Dist1", "2026-Q2", {"g2_ai_policy": "Yes"})
    _seed_quarter_levels(pg_url, "P-Dist2", "2026-Q2", {"g2_ai_policy": "Yes"})
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT sum(n_projects) FROM reporting.v_level_distribution "
                    "WHERE quarter='2026-Q2' AND dimension='A' "
                    "AND quarter IN (SELECT DISTINCT quarter FROM reporting.v_levels "
                    "                WHERE project IN ('P-Dist1','P-Dist2'))")
        total = cur.fetchone()[0]
    assert total is not None and int(total) >= 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_views.py::test_v_level_distribution_counts -v`
Expected: FAIL — `relation "reporting.v_level_distribution" does not exist`.

- [ ] **Step 3: Add the view**

In `infra/db/views.sql` top DROP block add:

```sql
DROP VIEW IF EXISTS reporting.v_level_distribution;
```

Add the view (after `v_levels` is defined):

```sql
CREATE VIEW reporting.v_level_distribution AS
WITH latest AS (
  SELECT DISTINCT ON (project) project, quarter, lvl_a, lvl_b, lvl_c, lvl_d, lvl_e, overall
  FROM reporting.v_levels
  ORDER BY project, quarter DESC
),
unpivot AS (
  SELECT quarter, 'A' AS dimension, lvl_a AS level FROM latest
  UNION ALL SELECT quarter, 'B', lvl_b FROM latest
  UNION ALL SELECT quarter, 'C', lvl_c FROM latest
  UNION ALL SELECT quarter, 'D', lvl_d FROM latest
  UNION ALL SELECT quarter, 'E', lvl_e FROM latest
  UNION ALL SELECT quarter, 'OVERALL', overall FROM latest
)
SELECT quarter, dimension, level, count(*)::int AS n_projects
FROM unpivot
WHERE level IS NOT NULL
GROUP BY quarter, dimension, level;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_views.py::test_v_level_distribution_counts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/db/views.sql tests/test_views.py
git commit -m "feat: v_level_distribution view (project counts per A-E level)"
```

---

### Task 4: `v_penetration` — AI-active projects vs total per period

Adoption breadth across the org (the S-curve): how many projects are on the AI program each period vs total tracked. Feeds §4 penetration.

**Files:**
- Modify: `infra/db/views.sql` (add view + DROP)
- Test: `tests/test_views.py` (new test `test_v_penetration_breadth`)

**Interfaces:**
- Consumes: `reporting.metrics_wide` (`ai_prs`, `ai_tasks`, `total_prs`, `total_tasks`, `period_type`, `period_key`, `period_start`).
- Produces: view `reporting.v_penetration(period_type text, period_key text, period_start date, n_projects_ai int, n_projects_total int)`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_views.py  (append)
def test_v_penetration_breadth(pg_url):
    import psycopg2
    from datetime import date
    from collector.db import upsert_counts
    # Same month: one project uses AI, one has activity but no AI.
    upsert_counts(pg_url, "P-Pen-AI", "month", "2026-06", date(2026, 6, 1), date(2026, 6, 30),
                  {"total_prs": 10, "ai_prs": 4})
    upsert_counts(pg_url, "P-Pen-None", "month", "2026-06", date(2026, 6, 1), date(2026, 6, 30),
                  {"total_prs": 8, "ai_prs": 0})
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT n_projects_ai, n_projects_total FROM reporting.v_penetration "
                    "WHERE period_type='month' AND period_key='2026-06'")
        ai, total = cur.fetchone()
    assert int(ai) == 1 and int(total) == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_views.py::test_v_penetration_breadth -v`
Expected: FAIL — `relation "reporting.v_penetration" does not exist`.

- [ ] **Step 3: Add the view**

Top DROP block:

```sql
DROP VIEW IF EXISTS reporting.v_penetration;
```

View:

```sql
CREATE VIEW reporting.v_penetration AS
SELECT period_type, period_key, min(period_start) AS period_start,
       count(*) FILTER (WHERE COALESCE(ai_prs, 0) > 0
                           OR COALESCE(ai_tasks, 0) > 0)::int AS n_projects_ai,
       count(*) FILTER (WHERE COALESCE(total_prs, 0) > 0
                           OR COALESCE(total_tasks, 0) > 0)::int AS n_projects_total
FROM reporting.metrics_wide
GROUP BY period_type, period_key;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_views.py::test_v_penetration_breadth -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/db/views.sql tests/test_views.py
git commit -m "feat: v_penetration view (AI-active vs total projects per period)"
```

---

### Task 5: `v_attention` — projects needing a board decision

One row per project flagging its worst active maturity/gate problem, with a severity rank for worst-first ordering. Gate reasons only (from `v_levels`); Plan 2 adds ROI-negative reasons (needs per-project rate). Feeds §0 attention list.

**Files:**
- Modify: `infra/db/views.sql` (add view + DROP)
- Test: `tests/test_views.py` (new test `test_v_attention_flags_gate`)

**Interfaces:**
- Consumes: `reporting.v_levels` (`project, quarter, lvl_c, lvl_e, overall`).
- Produces: view `reporting.v_attention(project text, quarter text, severity int, reason text)` — one row per project, only for projects with a live concern (`severity > 0`). `severity`: 3 = a gate (C or E) at level 1; 2 = overall at level 1; 1 = overall at level 2; ordered desc for worst-first.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_views.py  (append)
def test_v_attention_flags_gate(pg_url):
    import psycopg2
    # A project with no quality/governance evidence lands at gate level 1 (C & E),
    # which must surface as a severity-3 attention row.
    _seed_quarter_levels(pg_url, "P-Attn", "2026-Q2", {"a4_near_universal": "No"})
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT severity, reason FROM reporting.v_attention "
                    "WHERE project='P-Attn' AND quarter='2026-Q2'")
        row = cur.fetchone()
    assert row is not None
    severity, reason = row
    assert int(severity) == 3 and "gate" in reason.lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_views.py::test_v_attention_flags_gate -v`
Expected: FAIL — `relation "reporting.v_attention" does not exist`.

- [ ] **Step 3: Add the view**

Top DROP block:

```sql
DROP VIEW IF EXISTS reporting.v_attention;
```

View:

```sql
CREATE VIEW reporting.v_attention AS
WITH latest AS (
  SELECT DISTINCT ON (project) project, quarter, lvl_c, lvl_e, overall
  FROM reporting.v_levels
  ORDER BY project, quarter DESC
)
SELECT project, quarter,
  CASE
    WHEN lvl_c <= 1 OR lvl_e <= 1 THEN 3
    WHEN overall <= 1 THEN 2
    WHEN overall <= 2 THEN 1
    ELSE 0 END AS severity,
  CASE
    WHEN lvl_c <= 1 AND lvl_e <= 1 THEN 'Quality (C) and governance (E) gates at Level 1'
    WHEN lvl_c <= 1 THEN 'Quality (C) gate at Level 1'
    WHEN lvl_e <= 1 THEN 'Governance (E) gate at Level 1'
    WHEN overall <= 1 THEN 'Overall maturity at Level 1'
    WHEN overall <= 2 THEN 'Overall maturity at Level 2'
    ELSE '' END AS reason
FROM latest
WHERE (lvl_c <= 1 OR lvl_e <= 1 OR overall <= 2);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_views.py::test_v_attention_flags_gate -v`
Expected: PASS.

- [ ] **Step 5: Run the full view suite and commit**

Run: `pytest tests/test_views.py -v`
Expected: all pass (existing + 5 new).

```bash
git add infra/db/views.sql tests/test_views.py
git commit -m "feat: v_attention view (projects needing a board decision)"
```

---

## Self-Review

**Spec coverage (§4 of the design — new views):**
- `v_portfolio_roi` (cumulative ROI to date) → Task 2 ✓
- `v_level_distribution` (maturity distribution) → Task 3 ✓
- `v_penetration` (adoption S-curve) → Task 4 ✓
- `v_attention` (attention list) → Task 5 ✓ (gate reasons; ROI-negative reasons deferred to Plan 2 where rates live — noted in Task 5 interface)
- Central research-based thresholds (§5a) → Task 1 ✓
- Aggregation math / NULL-not-0 (§5) → enforced by `COALESCE`-in-sum-only and `WHERE level IS NOT NULL`; rate-weighted rate math is Plan 2's job (rates not in DB) ✓

**Placeholder scan:** no TBD/TODO; every SQL and test body is concrete. ✓

**Type consistency:** column names are stable across tasks and match the design's §4 view signatures. `dimension` values `'A'..'E','OVERALL'` match §4 and the existing heatmap headers. ✓

**Out of scope for Plan 1 (goes to Plan 2):** template variables, `generate.py` section rewrite, seed rows for new panels, applying blended rates, ROI-negative attention rows, local Grafana verification.
