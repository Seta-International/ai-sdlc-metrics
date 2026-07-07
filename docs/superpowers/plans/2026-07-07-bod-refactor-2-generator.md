# BOD Board Refactor — Plan 2: Generator Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the BOD portfolio dashboard as a decision-first, company-overview board — Month/Quarter + project filters, direction (delta/target/sparkline) on every headline, and five decision sections (§0–§4) that scale to N projects — driven by Plan 1's views.

**Architecture:** One new volume-weighted quarter ratio view (`v_metrics_q`, column-identical to `v_metrics`) makes the Month/Quarter toggle real. `build_bod_dashboard` in `infra/grafana/generate.py` is rewritten: template variables `$granularity` + `$project`, a granularity-aware source helper, a portfolio-stat helper that emits value + Δ-vs-prior + target + sparkline, and §0–§4 sections. Blended $ rates stay in `projects.json` and are applied in generator SQL (a `CASE project WHEN … rate` expression); the DB never stores rates. Per-project detail appears only in the §0 attention list with drill-down links to each project board — the page never renders one-row-per-project tables.

**Tech Stack:** Python (`infra/grafana/generate.py`), Grafana dashboard JSON (schemaVersion 39, postgres datasource), PostgreSQL views, pytest (`tests/test_dashboards.py` — subprocess-generate + JSON asserts; `tests/test_views.py` — testcontainer for `v_metrics_q`), local stack `infra/docker/compose.local.yml` + `tests/e2e/dashboard_selftest.py`.

## Global Constraints

- Dashboards are GENERATED — never hand-edit JSON. All changes go through `generate.py`; run `python infra/grafana/generate.py` to emit `infra/grafana/dashboards/`.
- No faked values: a panel exists only if a real signal backs it; calculators/views return NULL (grey), never 0.
- Targets/benchmarks come from `reporting.thresholds` (Plan 1) — one central place. Panel color bands reference those numbers; do not scatter new magic numbers in `generate.py` beyond the existing `TH` dict.
- Every board headline stat shows value + ▲▼ vs prior period + target threshold + sparkline (design §1).
- The board never renders per-project row tables; per-project detail is the §0 attention list + drill-down only (design §1, §3).
- Volume-weighted aggregation for portfolio rates (design §5): `sum(numerator)/sum(denominator)`, not average of per-project averages.
- Panel SQL must reference the `reporting.` schema (enforced by `test_all_panel_sql_targets_reporting_schema`).
- Keep `name:` and other compose invariants untouched; this plan touches only `views.sql`, `generate.py`, `seed.sql`, and tests.
- Commit style: conventional prefix, e.g. `feat: ...` / `refactor: ...`.

## Reference: helpers already in `generate.py` (reuse, do not reinvent)

- `_th(base, *steps)` → threshold dict; `TH` dict of named thresholds; `_cfg_th(cfg)`.
- `_target(sql, fmt)`, `_options(kind, spec)`, `_panel(spec, x, y)`, `_row`, `_layout(sections)`.
- `_dashboard(uid, title, panels, templating, links)` — BOD currently passes `[]` for `templating`.
- `_project_colors(projects)` → per-series color overrides.
- `_score_col(name, th)` / `_score_table(...)` (defined inside `build_bod_dashboard`).
- Existing BOD locals: `projects`, `rate_case` (`CASE w.project WHEN '<p>' THEN <rate> … ELSE 0 END`), `latest`, `trend`, `cost_latest`, `latest_month`.
- DS constant, view constants: `RATIOS="reporting.v_metrics"`, `WIDE="reporting.metrics_wide"`, `MANUAL="reporting.manual_inputs"`, `LEVELS="reporting.v_levels"`.

---

### Task 1: `v_metrics_q` — volume-weighted quarter ratio view

A quarter-grain sibling of `v_metrics` with identical ratio column names, computed from summed monthly raw counts (volume-weighted). Makes the Month/Quarter toggle real without averaging-of-averages.

**Files:**
- Modify: `infra/db/views.sql` (add DROP at top block + view after `v_metrics`)
- Test: `tests/test_views.py` (new `test_v_metrics_q_volume_weighted`)

**Interfaces:**
- Consumes: `reporting.metrics_wide` (monthly raw counts), `reporting.manual_inputs` (`total_engineers`).
- Produces: view `reporting.v_metrics_q` with columns `project, period_type ('quarter'), period_key (e.g. '2026-Q2'), period_start date` plus the SAME ratio + `n_*` columns as `v_metrics` (`ai_pr_pct, usage_pct, agent_task_pct, ai_task_pct, deploys_per_week, cfr_pct, rework_pct, ai_pr_review_pct, agent_completion_pct, human_intervention_pct, autonomy_pct, predictability_pct, agent_pr_pct, throughput_per_engineer, lead_time_ai_delta_pct, ai_pr_test_pct, rework_from_ai_pct, lead_time_h, lead_time_ai_h, lead_time_nonai_h, pr_size_ai, pr_size_nonai, security_alerts, agent_cycle_h, mttr_h, n_pr, n_ai_pr, n_agent_pr, n_deploys, n_tasks, team_size`).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_views.py  (append)
def test_v_metrics_q_volume_weighted(pg_url):
    import psycopg2
    from datetime import date
    from collector.db import upsert_counts, upsert_manual_input
    # Two months in Q2 2026. Volume-weighted AI-PR% = (4+16)/(10+40) = 40%,
    # NOT the average of the two monthly rates (40% and 40% here both 40 → 40).
    upsert_counts(pg_url, "P-Q", "month", "2026-04", date(2026, 4, 1), date(2026, 4, 30),
                  {"total_prs": 10, "ai_prs": 4, "total_tasks": 20, "engineers_active": 5})
    upsert_counts(pg_url, "P-Q", "month", "2026-05", date(2026, 5, 1), date(2026, 5, 31),
                  {"total_prs": 40, "ai_prs": 16, "total_tasks": 40, "engineers_active": 5})
    upsert_manual_input(pg_url, "P-Q", "2026-05", "total_engineers", "5", "seed")
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT period_key, period_type, ai_pr_pct, n_pr, team_size "
                    "FROM reporting.v_metrics_q WHERE project='P-Q'")
        key, ptype, ai_pct, n_pr, team = cur.fetchone()
    assert key == "2026-Q2" and ptype == "quarter"
    assert round(float(ai_pct), 1) == 40.0 and float(n_pr) == 50 and float(team) == 5
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_views.py::test_v_metrics_q_volume_weighted -v`
Expected: FAIL — `relation "reporting.v_metrics_q" does not exist`.

- [ ] **Step 3: Add the view**

Top DROP block (before `v_metrics`, since it reads `metrics_wide`):

```sql
DROP VIEW IF EXISTS reporting.v_metrics_q;
```

View (add after `v_metrics` is defined):

```sql
CREATE VIEW reporting.v_metrics_q AS
WITH qwide AS (
  SELECT
    project,
    to_char(period_start, 'YYYY') || '-Q'
      || ceil(extract(month FROM period_start) / 3.0)::int AS period_key,
    min(period_start) AS period_start,
    max(period_end)   AS period_end,
    -- counts sum across the quarter
    sum(total_prs) AS total_prs, sum(ai_prs) AS ai_prs, sum(ai_prs_reviewed) AS ai_prs_reviewed,
    sum(ai_prs_with_tests) AS ai_prs_with_tests, sum(rework_prs) AS rework_prs,
    sum(rework_from_ai_prs) AS rework_from_ai_prs, sum(total_tasks) AS total_tasks,
    sum(ai_tasks) AS ai_tasks, sum(agent_tasks) AS agent_tasks, sum(deploys) AS deploys,
    sum(weeks) AS weeks, sum(incidents) AS incidents, sum(security_alerts) AS security_alerts,
    sum(agent_prs_total) AS agent_prs_total, sum(agent_prs_merged) AS agent_prs_merged,
    sum(agent_prs_human_fixed) AS agent_prs_human_fixed,
    sum(agent_prs_autonomous) AS agent_prs_autonomous,
    sum(sprint_committed) AS sprint_committed, sum(sprint_completed) AS sprint_completed,
    sum(ai_users_weekly_avg) AS ai_users_weekly_avg_sum,
    avg(ai_users_weekly_avg) AS ai_users_weekly_avg,
    max(engineers_active) AS engineers_active,
    -- latency metrics average across months (sum would be meaningless)
    avg(lead_time_h) AS lead_time_h, avg(lead_time_ai_h) AS lead_time_ai_h,
    avg(lead_time_nonai_h) AS lead_time_nonai_h, avg(mttr_h) AS mttr_h,
    avg(agent_cycle_h) AS agent_cycle_h, avg(pr_size_ai) AS pr_size_ai,
    avg(pr_size_nonai) AS pr_size_nonai
  FROM reporting.metrics_wide
  WHERE period_type = 'month'
  GROUP BY project,
    to_char(period_start, 'YYYY') || '-Q'
      || ceil(extract(month FROM period_start) / 3.0)::int
)
SELECT
  q.project, 'quarter'::text AS period_type, q.period_key, q.period_start, q.period_end,
  ts.team_size,
  100.0 * ai_prs               / NULLIF(total_prs, 0)        AS ai_pr_pct,
  CASE WHEN q.ai_users_weekly_avg IS NULL OR ts.team_size IS NULL OR ts.team_size = 0 THEN NULL
       ELSE LEAST(100.0 * q.ai_users_weekly_avg / NULLIF(ts.team_size, 0), 100.0) END AS usage_pct,
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
  lead_time_h, lead_time_ai_h, lead_time_nonai_h, mttr_h, agent_cycle_h,
  pr_size_ai, pr_size_nonai, security_alerts,
  total_prs AS n_pr, ai_prs AS n_ai_pr, agent_prs_total AS n_agent_pr,
  deploys AS n_deploys, total_tasks AS n_tasks
FROM qwide q
LEFT JOIN LATERAL (
  SELECT mi.value::numeric AS team_size
  FROM reporting.manual_inputs mi
  WHERE mi.project = q.project
    AND mi.field = 'total_engineers'
    AND mi.period_key <= to_char(q.period_end, 'YYYY-MM')
    AND mi.value ~ '^[0-9]+(\.[0-9]+)?$'
  ORDER BY mi.period_key DESC LIMIT 1
) ts ON true;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_views.py::test_v_metrics_q_volume_weighted -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/db/views.sql tests/test_views.py
git commit -m "feat: v_metrics_q volume-weighted quarter ratio view"
```

---

### Task 2: BOD template variables + source/scope helpers

Add the two filters and the helpers every later task uses.

**Files:**
- Modify: `infra/grafana/generate.py` (module-level helpers near `_sprint_var`, ~line 245; and the `_dashboard(...)` call at the end of `build_bod_dashboard`, ~line 895)
- Test: `tests/test_dashboards.py` (new `test_bod_has_granularity_and_project_vars`)

**Interfaces:**
- Produces:
  - `_bod_vars() -> list[dict]` — templating list: a `granularity` custom var (options `month`,`quarter`; default `quarter`) and a `project` query var (multi + includeAll, options from distinct projects).
  - `_bod_src() -> str` — returns a SQL snippet selecting the granularity-correct ratio source as alias `r`: `(SELECT * FROM reporting.v_metrics WHERE period_type='month' UNION ALL SELECT * FROM reporting.v_metrics_q) r WHERE r.period_type = '$granularity'`.
  - `_proj_filter(col='project') -> str` — `"<col> IN ($project)"`.
  - `_time_filter(col='period_start') -> str` — `"$__timeFilter(<col>)"` (native date-range picker = start/end date).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_dashboards.py  (append)
def test_bod_has_granularity_and_project_vars(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    names = [v["name"] for v in bod["templating"]["list"]]
    assert names == ["granularity", "project"]
    gran = next(v for v in bod["templating"]["list"] if v["name"] == "granularity")
    assert [o["value"] for o in gran["options"]] == ["month", "quarter"]
    proj = next(v for v in bod["templating"]["list"] if v["name"] == "project")
    assert proj["multi"] is True and proj["includeAll"] is True
    raw = json.dumps(bod)
    assert "IN ($project)" in raw            # scope filter wired
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_dashboards.py::test_bod_has_granularity_and_project_vars -v`
Expected: FAIL — `names == ["granularity", "project"]` fails (currently `[]`).

- [ ] **Step 3: Add helpers and wire them**

Add near `_sprint_var` (module level):

```python
def _bod_vars() -> dict:
    granularity = {
        "name": "granularity", "type": "custom", "label": "Granularity",
        "query": "month,quarter", "current": {"text": "quarter", "value": "quarter"},
        "options": [{"text": "month", "value": "month", "selected": False},
                    {"text": "quarter", "value": "quarter", "selected": True}],
    }
    project = {
        "name": "project", "type": "query", "datasource": DS, "label": "Project",
        "multi": True, "includeAll": True, "refresh": 2, "sort": 1,
        "query": "SELECT DISTINCT project FROM reporting.v_metrics ORDER BY project",
        "current": {}, "options": [],
    }
    return [granularity, project]


def _bod_src() -> str:
    # Ratio source chosen by $granularity: monthly rows from v_metrics or
    # quarter rows from v_metrics_q, unified then filtered to the selection.
    return ("(SELECT * FROM reporting.v_metrics WHERE period_type='month' "
            "UNION ALL SELECT * FROM reporting.v_metrics_q) r "
            "WHERE r.period_type = '$granularity'")


def _proj(col: str = "project") -> str:
    return f"{col} IN ($project)"


def _tf(col: str = "period_start") -> str:
    return f"$__timeFilter({col})"
```

Then change the final BOD return (currently `_dashboard("ai-sdlc-bod", "AI SDLC: Portfolio (BOD)", _layout(sections), [], links)`) to pass the variables:

```python
    return _dashboard("ai-sdlc-bod", "AI SDLC: Portfolio (BOD)",
                      _layout(sections), _bod_vars(), links)
```

Note: `v_metrics` and `v_metrics_q` must have identical column order for the `UNION ALL` — verified by Task 1's column list and `test_bod_src_union_columns_align` below (add it):

```python
# tests/test_views.py  (append)
def test_bod_src_union_columns_align(pg_url):
    import psycopg2
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM reporting.v_metrics WHERE false")
        a = [d.name for d in cur.description]
        cur.execute("SELECT * FROM reporting.v_metrics_q WHERE false")
        b = [d.name for d in cur.description]
    assert a == b, f"v_metrics vs v_metrics_q column mismatch: {set(a) ^ set(b)}"
```

If the columns do not align, adjust `v_metrics_q`'s SELECT order/names in Task 1 to match `v_metrics` exactly (add any missing `usage_rate_pct` etc. as `NULL AS usage_rate_pct`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_views.py::test_bod_src_union_columns_align tests/test_dashboards.py::test_bod_has_granularity_and_project_vars -v`
Expected: PASS (fix `v_metrics_q` column list until the union test passes).

- [ ] **Step 5: Commit**

```bash
git add infra/grafana/generate.py tests/test_dashboards.py tests/test_views.py
git commit -m "feat: BOD granularity + project filters and source helpers"
```

---

### Task 3: `_bod_stat` — headline stat with Δ, target, sparkline

A helper that turns a single ratio column into a portfolio headline: current value, delta vs prior period, target threshold coloring, and a sparkline over the selected range.

**Files:**
- Modify: `infra/grafana/generate.py` (add helper near `_bod_src`)
- Test: `tests/test_dashboards.py` (new `test_bod_stat_has_sparkline_and_delta`)

**Interfaces:**
- Consumes: `_bod_src()`, `_proj()`, `_tf()`, `TH`.
- Produces: `_bod_stat(title, col, agg, unit, th=None, w=6, desc="") -> dict` — a `stat` panel spec. `agg` is the portfolio aggregation SQL fragment over `r` (e.g. `round(avg(r.{col}),1)` for a rate, `sum(r.{col})` for a count). Emits a time-series-shaped query (`period_start AS time`) so Grafana draws the sparkline (`graphMode:"area"`), with `reduceOptions.calcs=["lastNotNull"]` for the big value and a `"__delta"`-style prior-period comparison rendered via Grafana's built-in `percentChange` (field `showPercentChange: true`).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_dashboards.py  (append)
def test_bod_stat_has_sparkline_and_delta(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    stats = [p for p in bod["panels"] if p.get("type") == "stat" and "AI PR" in p["title"]]
    assert stats, "expected an AI PR % headline stat"
    p = stats[0]
    assert p["options"]["graphMode"] == "area"                 # sparkline on
    assert p["fieldConfig"]["defaults"]["custom"].get("showPercentChange") is True
    assert "period_start AS time" in p["targets"][0]["rawSql"]  # time-series shaped
    assert "IN ($project)" in p["targets"][0]["rawSql"]         # scoped
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_dashboards.py::test_bod_stat_has_sparkline_and_delta -v`
Expected: FAIL — no such stat / options.

- [ ] **Step 3: Add the helper**

```python
def _bod_stat(title: str, col: str, agg: str, unit: str,
              th: dict | None = None, w: int = 6, desc: str = "") -> dict:
    # One row per period over the selected range → big value = last period,
    # sparkline = the range, percentChange = last vs previous period.
    sql = (f"SELECT r.period_start AS time, {agg} AS \"{title}\" "
           f"FROM {_bod_src()} AND {_proj('r.project')} AND {_tf('r.period_start')} "
           f"GROUP BY r.period_start ORDER BY r.period_start")
    spec = {
        "kind": "stat", "title": title, "sql": sql, "format": "time_series",
        "unit": unit, "w": w, "h": 4, "graph": "area",
        "custom": {"showPercentChange": True},
        "desc": desc,
    }
    if th is not None:
        spec["th"] = th
    return spec
```

(`_panel`/`_options` already route `spec["custom"]` into `fieldConfig.defaults.custom` for non-timeseries kinds, and `graph:"area"` into `graphMode`. `showPercentChange` is a Grafana stat field-config flag.)

- [ ] **Step 4: Add one consuming stat so the test has a panel, then run**

This helper is exercised by §1/§3 stats; to make the test pass now, it is enough that Task 5 adds the "AI PR %" stat. If implementing strictly in order, temporarily add to `pulse` in `build_bod_dashboard`:

```python
    pulse = [
        _bod_stat("AI PR %", "ai_pr_pct", "round(avg(r.ai_pr_pct),1)", "percent",
                  th=TH["ai_share"], w=8,
                  desc="Portfolio AI-labeled PR share (context, not a success metric)."),
    ]
```

Run: `pytest tests/test_dashboards.py::test_bod_stat_has_sparkline_and_delta -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/grafana/generate.py tests/test_dashboards.py
git commit -m "feat: _bod_stat headline helper (value + delta + target + sparkline)"
```

---

### Task 4: §0 — Verdict & data-driven Decisions & Attention list

**Files:**
- Modify: `infra/grafana/generate.py` (`build_bod_dashboard`: replace the `verdict` block; add `decisions` and `attention` specs; update `sections`)
- Test: `tests/test_dashboards.py` (new `test_bod_section0_decisions_and_attention`)

**Interfaces:**
- Consumes: `LEVELS`, `reporting.v_attention` (Plan 1), `_proj()`.
- Produces: `verdict` (scoped stat), `decisions` (text/table panel from `v_attention`), `attention` (table with a per-row data link to `/d/ai-sdlc-${__data.fields.Project}`).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_dashboards.py  (append)
def test_bod_section0_decisions_and_attention(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    titles = [p["title"] for p in bod["panels"]]
    assert any("Decision" in t for t in titles)
    assert any("Attention" in t or "Needs" in t for t in titles)
    raw = json.dumps(bod)
    assert "reporting.v_attention" in raw
    assert "/d/ai-sdlc-" in raw          # drill-down link present
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_dashboards.py::test_bod_section0_decisions_and_attention -v`
Expected: FAIL.

- [ ] **Step 3: Implement §0**

Replace the existing `verdict` list's SQL scope (add `AND project IN ($project)` is not possible inside `_levels_latest_all()`; instead wrap). Keep verdict, add decisions + attention:

```python
    # Verdict: portfolio status, scoped to the selected projects.
    verdict_sql = (
        "WITH lv AS (SELECT * FROM (" + _levels_latest_all() + ") z WHERE "
        + _proj() + "), "
        "agg AS (SELECT min(lvl_c) mc, min(lvl_e) me, min(overall) mo FROM lv) "
        "SELECT CASE "
        "WHEN me <= 1 OR mc <= 1 THEN 'Action required: a quality or governance gate is at Level 1. Remediate before expanding AI use.' "
        "WHEN mo >= 3 THEN 'On track: every selected project is at Level 3 or higher. Maintain current investment.' "
        "ELSE 'Baseline established. Maturity levels are still forming.' END AS verdict FROM agg")
    verdict = [
        {"kind": "stat", "title": "Verdict", "sql": verdict_sql, "format": "table",
         "unit": "none", "w": 24, "h": 3, "text_stat": True, "custom": {},
         "color": DEEMPH, "desc": "Portfolio status from reporting.v_levels for the "
         "selected projects: flags a Level-1 quality (C) or governance (E) gate."},
    ]
    # Decisions: at most 3 data-driven items, worst-first, from v_attention.
    decisions = [
        {"kind": "table", "title": "Needs a decision this period", "w": 24, "h": 4,
         "sql": ("SELECT reason AS \"Item\", count(*) AS \"Projects\" "
                 "FROM reporting.v_attention WHERE " + _proj()
                 + " AND severity >= 2 GROUP BY reason ORDER BY max(severity) DESC, 2 DESC "
                 "LIMIT 3"),
         "desc": ("Auto-generated from reporting.v_attention: the highest-severity "
                  "board items (gate at Level 1, overall Level 1). Empty = no action "
                  "required this period.")},
    ]
    # Attention list: the projects to act on, each linking to its own board.
    attention = [
        {"kind": "table", "title": "Projects to act on", "w": 24, "h": 6,
         "sql": ("SELECT project AS \"Project\", severity AS \"Severity\", "
                 "reason AS \"Why\" FROM reporting.v_attention WHERE " + _proj()
                 + " ORDER BY severity DESC, project"),
         "overrides": [{"matcher": {"id": "byName", "options": "Project"},
                        "properties": [{"id": "links", "value": [
                            {"title": "Open project board", "targetBlank": False,
                             "url": "/d/ai-sdlc-${__data.fields.Project}"}]}]}],
         "desc": "The only per-project detail on this board. Click a project to "
                 "drill into its operational dashboard."},
    ]
```

Then in `sections`, replace `("Summary", verdict)` with:

```python
        ("Verdict & Decisions", verdict + decisions + attention),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_dashboards.py::test_bod_section0_decisions_and_attention -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/grafana/generate.py tests/test_dashboards.py
git commit -m "feat: BOD section 0 — verdict + data-driven decisions + attention list"
```

---

### Task 5: §1 — Is it paying off?

**Files:**
- Modify: `infra/grafana/generate.py` (`build_bod_dashboard`: build `paying` list; remove the temporary `pulse` stat from Task 3)
- Test: `tests/test_dashboards.py` (new `test_bod_section1_roi`)

**Interfaces:**
- Consumes: `reporting.v_portfolio_roi` (Plan 1), `rate_case`, `_proj()`, `_tf()`, `reporting.thresholds`.
- Produces: `paying` — cumulative net $ stat, capacity-unlocked stat, spend-vs-return timeseries.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_dashboards.py  (append)
def test_bod_section1_roi(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    titles = [p["title"] for p in bod["panels"]]
    assert any("Cumulative" in t and "$" in t for t in titles)
    assert any("Capacity" in t for t in titles)
    raw = json.dumps(bod)
    assert "reporting.v_portfolio_roi" in raw
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_dashboards.py::test_bod_section1_roi -v`
Expected: FAIL.

- [ ] **Step 3: Implement §1**

`rate_case` is built on alias `w`; reuse the same CASE text on the ROI view alias. Build:

```python
    roi_rate = ("CASE v.project " +
                " ".join(f"WHEN '{c['name']}' THEN {c['blended_hourly_rate']}"
                         for c in cfgs) + " ELSE 0 END")
    # Net $ to date = Σ_project (cum_hours_saved × rate) − cum_tool_cost, at each
    # project's latest month within the range; summed across selected projects.
    net_latest = (
        f"FROM (SELECT DISTINCT ON (v.project) v.*, {roi_rate} AS rate "
        f"FROM reporting.v_portfolio_roi v WHERE {_proj('v.project')} "
        f"AND {_tf('v.period_start')} ORDER BY v.project, v.period_start DESC) x")
    paying = [
        {"kind": "stat", "title": "Cumulative AI Net $ (to date)", "w": 8, "h": 4,
         "unit": "currencyUSD", "graph": "none", "th": _th(CRIT, (0, GOOD)),
         "sql": f"SELECT sum(cum_hours_saved * rate - cum_tool_cost) {net_latest}",
         "desc": "Σ over selected projects of (cumulative AI hours saved × blended "
                 "rate) − cumulative AI tool cost. Green once net-positive (payback)."},
        {"kind": "stat", "title": "Capacity unlocked (engineer-equiv)", "w": 8, "h": 4,
         "unit": "none", "graph": "none",
         "sql": ("SELECT round(sum(cum_hours_saved) / (40.0 * 4 * "
                 "GREATEST(count(DISTINCT date_trunc('month', period_start)),1)), 1) "
                 f"FROM (SELECT v.* FROM reporting.v_portfolio_roi v WHERE {_proj('v.project')} "
                 f"AND {_tf('v.period_start')}) v"),
         "desc": "Cumulative hours saved expressed as full-time engineers of extra "
                 "capacity (≈160 h/engineer-month), no headcount added."},
        {"kind": "timeseries", "title": "Spend vs Return ($, cumulative)", "w": 8, "h": 4,
         "format": "time_series", "unit": "currencyUSD",
         "sql": (f"SELECT v.period_start AS time, "
                 f"sum(v.cum_hours_saved * {roi_rate}) AS \"Value\", "
                 f"sum(v.cum_tool_cost) AS \"Cost\" FROM reporting.v_portfolio_roi v "
                 f"WHERE {_proj('v.project')} AND {_tf('v.period_start')} "
                 "GROUP BY v.period_start ORDER BY v.period_start"),
         "desc": "Cumulative value vs cumulative cost; the gap is running net ROI."},
    ]
```

Remove the temporary `pulse` list added in Task 3 (its "AI PR %" stat moves to §3, Task 7). Replace `("Return on Investment", pulse)` in `sections` with `("Is it paying off?", paying)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_dashboards.py::test_bod_section1_roi -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/grafana/generate.py tests/test_dashboards.py
git commit -m "feat: BOD section 1 — cumulative ROI, capacity, spend-vs-return"
```

---

### Task 6: §2 — Is it safe? (risk / governance, from existing signals)

**Files:**
- Modify: `infra/grafana/generate.py` (build `safe` list)
- Test: `tests/test_dashboards.py` (new `test_bod_section2_risk`)

**Interfaces:**
- Consumes: `_bod_src()` (`security_alerts`), `MANUAL` (governance flags `g2/g3/g7/g8`, security flags `c3/c6/c9`), `reporting.metric_counts` (tool mix), `_proj()`.
- Produces: `safe` — security-posture stat, governance-gate posture table, quality-erosion flag, tool-concentration barchart.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_dashboards.py  (append)
def test_bod_section2_risk(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    titles = [p["title"] for p in bod["panels"]]
    assert any("Security" in t for t in titles)
    assert any("Governance" in t for t in titles)
    raw = json.dumps(bod)
    assert "security_alerts" in raw
    assert "g2_ai_policy" in raw or "g3_required_review" in raw
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_dashboards.py::test_bod_section2_risk -v`
Expected: FAIL.

- [ ] **Step 3: Implement §2**

```python
    # Governance/security flags live on the latest quarterly manual row per project.
    gov_latest = (
        "FROM (SELECT DISTINCT ON (project) project, period_key FROM reporting.manual_inputs "
        "WHERE period_key LIKE '%-Q%' ORDER BY project, period_key DESC) q "
        "JOIN reporting.manual_inputs mi USING (project, period_key)")
    safe = [
        {"kind": "stat", "title": "Open Security Alerts (portfolio)", "w": 8, "h": 4,
         "unit": "none", "graph": "none", "th": TH["alerts"],
         "sql": (f"SELECT sum(r.security_alerts) FROM {_bod_src()} "
                 f"AND {_proj('r.project')}"),
         "desc": "Open code-scanning alerts across selected projects. AI code carries "
                 "elevated vuln risk; >=1 critical is a board-level flag."},
        {"kind": "table", "title": "Governance gates (projects meeting each)", "w": 16, "h": 4,
         "sql": ("SELECT g.label AS \"Gate\", "
                 "count(*) FILTER (WHERE mi.value='Yes') AS \"Met\", count(*) AS \"Projects\" "
                 + gov_latest + " JOIN (VALUES "
                 "('g2_ai_policy','AI policy'),('g3_required_review','Required human review'),"
                 "('g6_security_controls','Security controls'),('g7_traceability','Traceability/audit'),"
                 "('g8_model_governance','Model governance')) g(field,label) ON g.field = mi.field "
                 "WHERE " + _proj("mi.project") + " GROUP BY g.label ORDER BY 2"),
         "desc": "Governance posture from quarterly flags: how many selected projects "
                 "meet each gate. Gaps are risk-oversight items."},
        {"kind": "timeseries", "title": "Quality-erosion watch (rework % vs AI PR %)", "w": 12, "h": 6,
         "format": "time_series", "unit": "percent",
         "sql": (f"SELECT r.period_start AS time, round(avg(r.rework_pct),1) AS \"Rework %\", "
                 f"round(avg(r.ai_pr_pct),1) AS \"AI PR %\" FROM {_bod_src()} "
                 f"AND {_proj('r.project')} AND {_tf('r.period_start')} "
                 "GROUP BY r.period_start ORDER BY r.period_start"),
         "desc": "DORA 2025 warning made visible: watch rework climb as AI adoption "
                 "climbs. Diverging lines (rework up with adoption) = investigate."},
        {"kind": "barchart", "title": "Tool concentration (portfolio)", "w": 12, "h": 6,
         "xfield": "Tool", "unit": "none", "color": PALETTE[2],
         "sql": ("SELECT replace(metric_key,'ai_tasks_tool_','') AS \"Tool\", "
                 "sum(value)::float8 AS \"Tasks\" FROM reporting.metric_counts "
                 "WHERE metric_key LIKE 'ai_tasks_tool_%' AND " + _proj()
                 + " GROUP BY 1 ORDER BY 2 DESC"),
         "desc": "Vendor concentration: one dominant tool = price / lock-in / "
                 "single-point-of-failure risk."},
    ]
```

Add `("Is it safe?", safe)` to `sections`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_dashboards.py::test_bod_section2_risk -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/grafana/generate.py tests/test_dashboards.py
git commit -m "feat: BOD section 2 — risk & governance from existing signals"
```

---

### Task 7: §3 — Is it working, honestly?

**Files:**
- Modify: `infra/grafana/generate.py` (build `honest` list using `_bod_stat`; keep the AI-vs-non-AI evidence, aggregated + scoped)
- Test: `tests/test_dashboards.py` (new `test_bod_section3_paired`)

**Interfaces:**
- Consumes: `_bod_stat`, `_bod_src()`, `_proj()`, `_tf()`, `TH`.
- Produces: `honest` — Lead Time + CFR/Rework paired stats (velocity never alone), AI PR % (labeled context) + an impact stat, AI-vs-non-AI aggregated evidence.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_dashboards.py  (append)
def test_bod_section3_paired(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    titles = [p["title"] for p in bod["panels"]]
    assert any("Lead Time" in t for t in titles)
    assert any("Change-Fail" in t or "CFR" in t or "Rework" in t for t in titles)
    assert any("AI vs Non-AI" in t for t in titles)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_dashboards.py::test_bod_section3_paired -v`
Expected: FAIL.

- [ ] **Step 3: Implement §3**

```python
    honest = [
        _bod_stat("Lead Time", "lead_time_h", "round(avg(r.lead_time_h),1)", "h",
                  th=TH["lead"], w=6,
                  desc="Portfolio lead time. Read next to Change-Fail/Rework — a "
                       "slower-but-safer AI lead time is legitimate, not a failure."),
        _bod_stat("Change-Fail %", "cfr_pct", "round(avg(r.cfr_pct),1)", "percent",
                  th=TH["cfr"], w=6,
                  desc="Stability counter-metric to velocity (DORA 2025: AI can erode "
                       "stability). Never read Lead Time without this."),
        _bod_stat("Rework %", "rework_pct", "round(avg(r.rework_pct),1)", "percent",
                  th=TH["rework"], w=6,
                  desc="Share of PRs reworked — the quality counterweight."),
        _bod_stat("AI PR % (context)", "ai_pr_pct", "round(avg(r.ai_pr_pct),1)", "percent",
                  th=TH["ai_share"], w=6,
                  desc="Adoption is context, not success (DX): a lens for reading the "
                       "outcome metrics, never a headline win on its own."),
        {"kind": "table", "title": "Evidence: AI vs Non-AI (portfolio)", "w": 24, "h": 5,
         "sql": (f"SELECT round(avg(r.lead_time_ai_h),1) AS \"Lead AI h\", "
                 f"round(avg(r.lead_time_nonai_h),1) AS \"Lead non-AI h\", "
                 f"round(avg(r.lead_time_ai_delta_pct),0) AS \"Lead Δ%\", "
                 f"sum(r.n_ai_pr) AS \"n(AI PR)\" FROM {_bod_src()} "
                 f"AND {_proj('r.project')} AND {_tf('r.period_start')}"),
         "desc": "Aggregated AI vs non-AI with sample size. A slower AI lead time is a "
                 "legitimate verification-overhead finding; read with the quality "
                 "columns and with n(AI PR) in mind (small samples are noisy)."},
    ]
```

Add `("Is it working, honestly?", honest)` to `sections`; delete the old `("Project Scorecard (latest sprint)", scorecard)` and `("AI vs Non-AI Comparison", evidence)` entries and their now-unused `scorecard`/`evidence`/`_score_table` locals.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_dashboards.py::test_bod_section3_paired -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/grafana/generate.py tests/test_dashboards.py
git commit -m "feat: BOD section 3 — velocity paired with quality; adoption as context"
```

---

### Task 8: §4 — Are we maturing?

**Files:**
- Modify: `infra/grafana/generate.py` (build `maturing` list from Plan 1 distribution/penetration views; keep autonomy trend)
- Test: `tests/test_dashboards.py` (new `test_bod_section4_maturity`)

**Interfaces:**
- Consumes: `reporting.v_level_distribution`, `reporting.v_penetration`, `_bod_src()`, `_proj()`, `_tf()`.
- Produces: `maturing` — level-distribution stacked barchart, penetration S-curve timeseries, autonomy-gated trend.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_dashboards.py  (append)
def test_bod_section4_maturity(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    raw = json.dumps(bod)
    assert "reporting.v_level_distribution" in raw
    assert "reporting.v_penetration" in raw
    titles = [p["title"] for p in bod["panels"]]
    assert any("Maturity" in t or "Level" in t for t in titles)
    assert any("Penetration" in t or "Adoption breadth" in t for t in titles)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_dashboards.py::test_bod_section4_maturity -v`
Expected: FAIL.

- [ ] **Step 3: Implement §4**

```python
    maturing = [
        {"kind": "barchart", "title": "Maturity distribution (projects per level)", "w": 12, "h": 7,
         "xfield": "Level", "unit": "none", "color": BLUE_MID,
         "sql": ("SELECT ('L' || level) AS \"Level\", "
                 "sum(n_projects)::float8 AS \"Projects\" FROM reporting.v_level_distribution "
                 "WHERE dimension = 'OVERALL' AND quarter = (SELECT max(quarter) "
                 "FROM reporting.v_level_distribution) GROUP BY level ORDER BY level"),
         "desc": "Portfolio shape: how many projects sit at each overall maturity "
                 "level this quarter. Scales to N projects (no per-project rows)."},
        {"kind": "timeseries", "title": "Adoption breadth (penetration)", "w": 12, "h": 7,
         "format": "time_series", "unit": "none",
         "sql": ("SELECT period_start AS time, n_projects_ai AS \"On AI program\", "
                 "n_projects_total AS \"Total active\" FROM reporting.v_penetration "
                 f"WHERE period_type = '$granularity' AND {_tf('period_start')} "
                 "ORDER BY period_start"),
         "desc": "How many projects are on the AI program over time vs total active — "
                 "the org-wide adoption S-curve, distinct from intensity."},
        {"kind": "timeseries", "title": "Agent Autonomy % (gated by verification)", "w": 24, "h": 6,
         "format": "time_series", "unit": "percent",
         "sql": (f"SELECT r.period_start AS time, round(avg(r.autonomy_pct),1) AS \"Autonomy %\", "
                 f"round(avg(r.ai_pr_review_pct),1) AS \"Review % (gate)\" FROM {_bod_src()} "
                 f"AND {_proj('r.project')} AND {_tf('r.period_start')} "
                 "GROUP BY r.period_start ORDER BY r.period_start"),
         "desc": "Autonomy shown with its verification gate (review coverage). Earned "
                 "autonomy only — do not credit a level the review evidence can't support."},
    ]
```

Add `("Are we maturing?", maturing)` to `sections`; delete the old `("Portfolio Maturity", heatmap)`, `("Delivery Health", direction)`, and `("Where to Invest", value)` entries and their unused locals (`heatmap`, `direction`, `value`, `usage_by_project`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_dashboards.py::test_bod_section4_maturity -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/grafana/generate.py tests/test_dashboards.py
git commit -m "feat: BOD section 4 — maturity distribution, penetration, gated autonomy"
```

---

### Task 9: Assemble sections; drop legacy; guardrail test

**Files:**
- Modify: `infra/grafana/generate.py` (`build_bod_dashboard`: final `sections` list is exactly §0–§4; remove dead code)
- Test: `tests/test_dashboards.py` (new `test_bod_is_decision_first_and_has_no_project_rows`)

- [ ] **Step 1: Write the failing/guardrail test**

```python
# tests/test_dashboards.py  (append)
def test_bod_is_decision_first_and_has_no_project_rows(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    rows = [p["title"] for p in bod["panels"] if p.get("type") == "row"]
    assert rows == ["Verdict & Decisions", "Is it paying off?", "Is it safe?",
                    "Is it working, honestly?", "Are we maturing?"]
    raw = json.dumps(bod)
    # legacy sections gone
    for gone in ("Project Scorecard", "Where to Invest", "Decisions Requested"):
        assert gone not in raw
    # no per-project row table: the old A/B/C/D scorecard pinned "Project"+"Sprint";
    # only the attention list may carry a per-project column now.
    proj_tables = [p for p in bod["panels"]
                   if p.get("type") == "table" and '"Sprint"' in json.dumps(p)]
    assert proj_tables == []
```

- [ ] **Step 2: Run test to verify it fails/passes as code is cleaned**

Run: `pytest tests/test_dashboards.py::test_bod_is_decision_first_and_has_no_project_rows -v`
Expected: FAIL until `sections` is exactly the five §0–§4 entries and dead locals are removed.

- [ ] **Step 3: Finalize `sections`**

Ensure the end of `build_bod_dashboard` reads:

```python
    sections = [
        ("Verdict & Decisions", verdict + decisions + attention),
        ("Is it paying off?", paying),
        ("Is it safe?", safe),
        ("Is it working, honestly?", honest),
        ("Are we maturing?", maturing),
    ]
    links = [{"type": "link", "title": "Download Excel (all projects)", "icon": "doc",
              "targetBlank": True, "url": f"{exporter_url}/export.xlsx?project=all"}]
    return _dashboard("ai-sdlc-bod", "AI SDLC: Portfolio (BOD)",
                      _layout(sections), _bod_vars(), links)
```

Delete any now-unused locals flagged by running `python -c "import ast,sys; ast.parse(open('infra/grafana/generate.py').read())"` then `pyflakes infra/grafana/generate.py` (or a quick `python infra/grafana/generate.py` which will `NameError` on a live-referenced deleted local).

- [ ] **Step 4: Run the whole dashboard suite**

Run: `pytest tests/test_dashboards.py -v`
Expected: all pass (new §-tests + existing project/link/schema tests).

- [ ] **Step 5: Commit**

```bash
git add infra/grafana/generate.py tests/test_dashboards.py
git commit -m "refactor: BOD board is decision-first (5 sections, no project rows)"
```

---

### Task 10: Seed data + local Grafana verification

Give the local stack data for the new panels, regenerate, and verify in a real Grafana.

**Files:**
- Modify: `infra/db/seed.sql` (add monthly rows with `ai_time_saved_h` + `ai_tool_cost_monthly`, a second project, and quarterly flags so distribution/attention/penetration/ROI render)
- Modify: `infra/grafana/dashboards/BOD/portfolio.json` (regenerated artifact)
- Test: `tests/e2e/dashboard_selftest.py` (extend if it enumerates BOD panels) + manual local check

- [ ] **Step 1: Extend the seed**

Add to `infra/db/seed.sql` (after the existing Future sprint block): monthly `ai_time_saved_h` and manual `ai_tool_cost_monthly`, `cost_baseline`, `cost_actual`, `total_engineers`, plus quarterly `g*`/`c*` flags for Future and a second project (e.g. `Gated-Demo`) that lands at a Level-1 gate so the attention list and decisions box are non-empty. Follow the existing `WITH periods/vals … upsert` shape; use months `2026-04..2026-06` and quarter `2026-Q2`.

```sql
-- Monthly ROI inputs + a second project at a governance gate, so the BOD
-- board's ROI, penetration, distribution, decisions and attention panels draw.
INSERT INTO reporting.metric_counts (project, period_type, period_key, period_start, period_end, metric_key, value) VALUES
  ('Future','month','2026-05',DATE '2026-05-01',DATE '2026-05-31','ai_time_saved_h',120),
  ('Future','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','ai_time_saved_h',160),
  ('Future','month','2026-05',DATE '2026-05-01',DATE '2026-05-31','ai_prs',18),
  ('Future','month','2026-05',DATE '2026-05-01',DATE '2026-05-31','total_prs',44),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','ai_prs',2),
  ('Gated-Demo','month','2026-06',DATE '2026-06-01',DATE '2026-06-30','total_prs',20)
ON CONFLICT (project, period_type, period_key, metric_key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO reporting.manual_inputs (project, period_key, field, value, entered_by) VALUES
  ('Future','2026-06','ai_tool_cost_monthly','220','seed'),
  ('Future','2026-05','ai_tool_cost_monthly','220','seed'),
  ('Future','2026-06','total_engineers','14','seed'),
  ('Future','2026-Q2','g2_ai_policy','Yes','seed'),
  ('Future','2026-Q2','g3_required_review','Yes','seed'),
  ('Gated-Demo','2026-Q2','g2_ai_policy','No','seed')
ON CONFLICT (project, period_key, field) DO UPDATE SET value = EXCLUDED.value;
```

- [ ] **Step 2: Bring up the local stack**

Run:
```bash
docker compose -f infra/docker/compose.local.yml down -v
docker compose -f infra/docker/compose.local.yml up -d
```
Expected: postgres (5433) loads init.sql + views.sql + seed.sql; Grafana on 3030.

- [ ] **Step 3: Regenerate dashboards**

Run: `python infra/grafana/generate.py`
Expected: `wrote …/BOD/portfolio.json` (and the four project/raw files).

- [ ] **Step 4: Verify in Grafana (evidence before done)**

Open `http://localhost:3030` (admin/admin) → BOD board. Confirm:
- `granularity` (Month/Quarter) and `project` (multi + All) controls appear and drive every panel.
- Toggling Month↔Quarter changes the ratio panels without error.
- Each headline stat shows a value, a % change vs prior, a sparkline, and target coloring.
- §0 Decisions and Attention list are non-empty (Gated-Demo shows), and clicking a project row opens `/d/ai-sdlc-…`.
- No panel shows a fabricated number where data is absent (grey/No data instead).

Run the e2e self-test if present:
```bash
python tests/e2e/dashboard_selftest.py --url http://localhost:3030
```
Expected: exits 0 / all panels return data or a legitimate "No data".

- [ ] **Step 5: Commit**

```bash
git add infra/db/seed.sql infra/grafana/dashboards/BOD/portfolio.json
git commit -m "feat: seed BOD demo data + regenerate decision-first board"
```

---

## Self-Review

**Spec coverage (design 2026-07-07):**
- Filters: date range (native `$__timeFilter`) + Month/Quarter (`$granularity`) + project multi-select (`$project`) → Task 1 (quarter data), Task 2 (vars/helpers) ✓
- §0 Verdict + data-driven decisions + attention/drill-down → Task 4 ✓
- §1 cumulative ROI + payback + capacity + spend-vs-return → Task 5 ✓
- §2 security posture + governance gates + quality-erosion + tool concentration, existing signals only → Task 6 ✓
- §3 velocity↔quality paired, adoption-as-context, AI-vs-non-AI evidence → Task 7 ✓
- §4 level distribution + penetration + gated autonomy → Task 8 ✓
- Direction (delta/target/sparkline) on headlines → Task 3 helper, used in §1/§3 ✓
- No per-project row tables; drill-down only → Task 9 guardrail test ✓
- Central research-based thresholds → consumed from Plan 1 `reporting.thresholds` / existing `TH` ✓
- Volume-weighted aggregation → Task 1 (`v_metrics_q`) + `avg(rate)`/`sum(count)` fragments ✓
- No forecast → none added ✓
- No faked values → every panel bound to a real column; NULL greys ✓

**Placeholder scan:** every SQL/spec/test is concrete. The only prose-not-code step is Task 10 Step 1's seed narrative, immediately followed by concrete INSERTs. ✓

**Type/name consistency:** helper names (`_bod_vars`, `_bod_src`, `_proj`, `_tf`, `_bod_stat`) are used identically across Tasks 2–8; section titles match the Task 9 guardrail list exactly; `v_metrics_q` columns are asserted column-identical to `v_metrics` (Task 2 union test). ✓

**Risks to watch during execution:**
- `UNION ALL` column alignment (Task 2 test guards it; fix `v_metrics_q` if it fails).
- `showPercentChange` renders only with a time-series-shaped query returning ≥2 periods; with one period it simply shows no delta (acceptable, not an error).
- `$project` with "All" expands to a value list; the `IN ($project)` form is correct for Grafana multi-value interpolation of a text column.
