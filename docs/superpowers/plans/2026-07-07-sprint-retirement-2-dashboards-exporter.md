# Retire Sprint — Plan 2: Dashboards, Exporter & Seed Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the sprint retirement on the consumer side: both dashboard
generators move to `$month`/`$granularity`, the BOD dashboard gains the
`$project` filter it never had, the Excel exporter's sprint-shaped sheet and
URL param become month-shaped, and `seed.sql` closes the interim gap Plan 1
flagged (it still has `'sprint'` rows the narrowed CHECK now rejects on a
fresh DB).

**Architecture:** `infra/grafana/generate.py`'s project dashboards swap their
`$sprint` variable for `$month` and drop the "Sprint Predictability" panel
(no honest month/quarter equivalent — Plan 1 already removed its collection
code). The BOD dashboard gets two new template vars, `$granularity`
(month/quarter) and `$project` (multi-select), threaded through every panel
via a small set of helpers that `UNION ALL` `reporting.v_metrics` (month rows)
with `reporting.v_metrics_q` (Plan 1's quarter rollup) using an **explicit,
shared column list** — the two views don't have identical full column sets,
so `SELECT *` would either fail outright or silently misalign columns.
`exporter/workbook.py` renames its "Sprint data" sheet to "Monthly detail"
(reading month rows with the ratio columns) and its range filter from
`?sprints=S1:S6` to `?months=2026-01:2026-06`. `infra/db/seed.sql` is rewritten
month-only with a full 3-month quarter per project.

**Tech Stack:** Python 3.11+, PostgreSQL, pytest, FastAPI (`TestClient`),
openpyxl, Grafana dashboard JSON (hand-built via `generate.py`, no Grafana API
calls in tests).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-07-sprint-to-monthly-quarterly-design.md`
  (see also its "Exporter changes" section for the approved Monthly-detail-sheet
  decision).
- Builds on Plan 1 (`docs/superpowers/plans/2026-07-07-sprint-retirement-1-schema-collector.md`),
  already merged: `metric_counts.period_type` is month-only,
  `reporting.v_metrics_q` exists (volume-weighted quarter rollup).
- No backward-compat shims — clean refactor, delete sprint-shaped code
  outright.
- **`v_metrics` and `v_metrics_q` do NOT have identical column sets.**
  `v_metrics` is `metrics_wide.*` (≈35 raw columns) plus `team_size` plus ≈20
  computed ratios ≈ 56 columns total; `v_metrics_q` (as Plan 1 left it) has 40
  columns and is missing `security_alerts` and `agent_cycle_h` outright (they
  were computed in an internal CTE but never projected to the view's output),
  and uses the name `raw_deploys` where `v_metrics` uses `deploys`. Task 1
  below fixes those three things. After that fix, dashboards must still
  `UNION` the two views using an **explicit column list** (never `SELECT *`)
  — the two views remain different shapes overall (e.g. `v_metrics` alone
  exposes `pr_size_ai`/`pr_size_nonai` raw pass-throughs `v_metrics_q` also
  has, but plenty of `v_metrics`-only columns like `usage_rate_pct` internals
  aren't needed by any BOD panel and are deliberately left out of the shared
  list to keep it minimal).
- Every `views.sql` change must keep `test_views_sql_is_reappliable` passing.
- After Task 5 (seed.sql), re-run `tests/test_seed.py` — that's the test Plan 1
  flagged as a known-failing interim gap; it must pass again after this task.

---

### Task 1: Fix `v_metrics_q` column gaps; drop dead Predictability columns

**Files:**
- Modify: `infra/db/views.sql` (`v_metrics_q`, `metrics_wide`, `v_metrics`)
- Modify: `infra/grafana/generate.py` (`TH`, `DEFAULTS`, `_cfg_th` — remove
  predictability threshold plumbing)
- Modify: `infra/grafana/projects.json` (remove `predictability_pct` from
  `defaults.thresholds`)
- Test: `tests/test_views.py`

**Interfaces:**
- Consumes: `reporting.v_metrics_q` from Plan 1.
- Produces: `reporting.v_metrics_q` now also exposes `security_alerts` and
  `agent_cycle_h`, and `deploys` (renamed from `raw_deploys`). `reporting.
  metrics_wide`/`reporting.v_metrics` no longer have `sprint_committed`,
  `sprint_completed`, or `predictability_pct` columns at all — Task 2/3 must
  not reference any of the three.

- [ ] **Step 1: Write the failing test** — add to `tests/test_views.py`:

```python
def test_v_metrics_q_exposes_security_alerts_and_agent_cycle(pg_url):
    upsert_counts(pg_url, "P-QCols", "month", "2026-07",
                  date(2026, 7, 1), date(2026, 7, 31),
                  {"security_alerts": 3, "agent_cycle_h": 6.0, "agent_prs_total": 5,
                   "deploys": 4, "weeks": 4.3})
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT security_alerts, agent_cycle_h, deploys
            FROM reporting.v_metrics_q WHERE project = 'P-QCols'
        """)
        alerts, cycle, deploys = cur.fetchone()
    assert float(alerts) == 3.0
    assert float(cycle) == 6.0
    assert float(deploys) == 4.0


def test_metrics_wide_has_no_sprint_columns(pg_url):
    upsert_counts(pg_url, "P-NoPred", "month", "2026-07",
                  date(2026, 7, 1), date(2026, 7, 31), {"total_prs": 5})
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'reporting' AND table_name = 'metrics_wide'
        """)
        wide_cols = {r[0] for r in cur.fetchall()}
        cur.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'reporting' AND table_name = 'v_metrics'
        """)
        metrics_cols = {r[0] for r in cur.fetchall()}
    assert "sprint_committed" not in wide_cols and "sprint_completed" not in wide_cols
    assert "predictability_pct" not in metrics_cols
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_views.py::test_v_metrics_q_exposes_security_alerts_and_agent_cycle tests/test_views.py::test_metrics_wide_has_no_sprint_columns -v`
Expected: FAIL — `test_v_metrics_q_exposes_security_alerts_and_agent_cycle`
fails with `psycopg2.errors.UndefinedColumn` (`security_alerts`/`agent_cycle_h`/
`deploys` aren't in v_metrics_q's current output); `test_metrics_wide_has_no_sprint_columns`
fails because `sprint_committed`/`sprint_completed`/`predictability_pct` are
still present.

- [ ] **Step 3: Edit `infra/db/views.sql`**

In `metrics_wide`'s `CREATE VIEW` (around line 37-38), delete these two lines:

```sql
  max(value) FILTER (WHERE metric_key = 'sprint_committed')      AS sprint_committed,
  max(value) FILTER (WHERE metric_key = 'sprint_completed')      AS sprint_completed,
```

In `v_metrics`'s `CREATE VIEW`, delete this line:

```sql
  100.0 * sprint_completed     / NULLIF(sprint_committed, 0) AS predictability_pct,
```

In `v_metrics_q`'s final `SELECT` (the outermost `SELECT ... FROM agg` at the
end of the view), change:

```sql
  total_prs AS n_pr, ai_prs AS n_ai_pr, agent_prs_total AS n_agent_pr,
  deploys AS n_deploys, total_tasks AS n_tasks,
  lead_time_h, deploys AS raw_deploys, weeks, incidents, mttr_h,
  lead_time_ai_h, lead_time_nonai_h, pr_size_ai, pr_size_nonai,
  first_review_ai_h, first_review_nonai_h, review_rounds_ai, review_rounds_nonai
FROM agg;
```

to:

```sql
  total_prs AS n_pr, ai_prs AS n_ai_pr, agent_prs_total AS n_agent_pr,
  deploys AS n_deploys, total_tasks AS n_tasks,
  lead_time_h, deploys, weeks, incidents, mttr_h, security_alerts, agent_cycle_h,
  lead_time_ai_h, lead_time_nonai_h, pr_size_ai, pr_size_nonai,
  first_review_ai_h, first_review_nonai_h, review_rounds_ai, review_rounds_nonai
FROM agg;
```

(`security_alerts` and `agent_cycle_h` are already computed in the `agg` CTE
from Plan 1 — this only adds them to the final projection. `raw_deploys` →
`deploys` is a rename, matching `v_metrics`'s column name for the same
quantity.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_views.py -v`
Expected: All PASS.

- [ ] **Step 5: Remove Predictability threshold plumbing from `infra/grafana/generate.py`**

In the `TH` dict (module level), delete:

```python
    "predictability": _th(SERIOUS, (60, WARN), (80, GOOD)),
```

In `DEFAULTS`, change:

```python
    "thresholds": {"lead_time_h": [72, 168], "predictability_pct": [80, 60]},
```

to:

```python
    "thresholds": {"lead_time_h": [72, 168]},
```

In `_cfg_th`, change:

```python
def _cfg_th(cfg: dict) -> dict:
    t = cfg["thresholds"]
    lead_w, lead_c = t["lead_time_h"]
    pred_g, pred_w = t["predictability_pct"]
    th = dict(TH)
    th["lead"] = _th(GOOD, (lead_w, WARN), (lead_c, CRIT))
    th["predictability"] = _th(SERIOUS, (pred_w, WARN), (pred_g, GOOD))
    return th
```

to:

```python
def _cfg_th(cfg: dict) -> dict:
    t = cfg["thresholds"]
    lead_w, lead_c = t["lead_time_h"]
    th = dict(TH)
    th["lead"] = _th(GOOD, (lead_w, WARN), (lead_c, CRIT))
    return th
```

- [ ] **Step 6: Remove `predictability_pct` from `infra/grafana/projects.json`**

Change:

```json
    "thresholds": {"lead_time_h": [72, 168], "predictability_pct": [80, 60]},
```

to:

```json
    "thresholds": {"lead_time_h": [72, 168]},
```

- [ ] **Step 7: Confirm dashboards still generate** (Predictability panels
  themselves are removed in Tasks 2/3 — this step only confirms the threshold
  plumbing removal didn't break generation before those panels are gone)

Run: `python3 infra/grafana/generate.py --out /tmp/gen-check && echo OK`
Expected: `OK` printed, no `KeyError: 'predictability_pct'` traceback. (If this
fails with that KeyError, it means Task 2/3's panel removal must land
together with this step — that's fine, just proceed directly to Task 2 before
committing Task 1, or commit Task 1 together with Task 2 in one commit. Note
this in your commit message if you combine them.)

- [ ] **Step 8: Commit**

```bash
git add infra/db/views.sql infra/grafana/generate.py infra/grafana/projects.json tests/test_views.py
git commit -m "fix: v_metrics_q exposes security_alerts/agent_cycle_h; drop dead Predictability plumbing

v_metrics_q was missing two columns BOD dashboards need. metrics_wide/
v_metrics drop sprint_committed/sprint_completed/predictability_pct outright
— Sprint Predictability has no month/quarter equivalent (spec's Decision)."
```

---

### Task 2: Project dashboards — `$month`, drop Sprint Predictability

**Files:**
- Modify: `infra/grafana/generate.py` (`_sprint_var`→`_month_var`, `_spark`,
  `_guarded_pct`, `build_project_dashboard`)
- Test: `tests/test_dashboards.py`

**Interfaces:**
- Consumes: `reporting.v_metrics` `period_type = 'month'` rows (Plan 1).
- Produces: project dashboards' only template var is `$month` (was
  `$sprint`). No panel titled "Sprint Predictability" anywhere in a project
  dashboard.

- [ ] **Step 1: Write the failing tests** — update `tests/test_dashboards.py`:

Change `test_project_dashboard_is_pinned_and_reads_views` (var name check):

```python
def test_project_dashboard_is_pinned_and_reads_views(tmp_path):
    out = _generate(tmp_path)
    raw = (out / "Future" / "project.json").read_text()
    assert "reporting.v_metrics" in raw
    assert "metrics_ratios" not in raw
    assert "ai_sprint_metrics" not in raw
    assert "project = 'Future'" in raw
    proj = json.loads(raw)
    var_names = [v["name"] for v in proj["templating"]["list"]]
    assert var_names == ["month"]  # project pinned, no project variable
```

Change `test_sections_config_controls_rows` (row title check):

```python
def test_sections_config_controls_rows(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    rows = [p["title"] for p in future["panels"] if p["type"] == "row"]
    assert rows[1].startswith("Steering")
    assert any("Return on Investment" in r for r in rows)
    assert any("Monthly Record" in r for r in rows)
```

Add a new test (anywhere in the file, e.g. after `test_pct_stats_are_n_guarded`):

```python
def test_project_dashboard_has_no_predictability(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    titles = [p.get("title", "") for p in future["panels"]]
    assert not any("Predictability" in t for t in titles)
    assert "predictability_pct" not in json.dumps(future)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_dashboards.py::test_project_dashboard_is_pinned_and_reads_views tests/test_dashboards.py::test_sections_config_controls_rows tests/test_dashboards.py::test_project_dashboard_has_no_predictability -v`
Expected: FAIL — the current generator still emits `$sprint`, titles
`"Sprint Steering (...)"`, and two "Sprint Predictability" panels.

- [ ] **Step 3: Rewrite the template-var and helper functions in `infra/grafana/generate.py`**

Replace `_sprint_var` (module level, project section) with:

```python
def _month_var(project: str) -> dict:
    return {
        "name": "month", "type": "query", "datasource": DS,
        "refresh": 2, "sort": 0,
        "query": (f"SELECT period_key FROM {RATIOS} WHERE project = '{project}' "
                  "AND period_type = 'month' ORDER BY period_start DESC"),
        "current": {}, "options": [],
    }
```

Replace `_spark`:

```python
def _spark(project: str, col: str) -> str:
    """Value at the selected month + history sparkline up to it."""
    anchor = (f"(SELECT period_start FROM {RATIOS} WHERE project = '{project}' "
              "AND period_type = 'month' AND period_key = '$month')")
    return (f"SELECT period_start AS time, {col} AS value FROM {RATIOS} "
            f"WHERE project = '{project}' AND period_type = 'month' "
            f"AND period_start <= {anchor} ORDER BY period_start")
```

Replace `_guarded_pct`:

```python
def _guarded_pct(project: str, title: str, pct_col: str, n_col: str,
                 th: dict | None = None, w: int = 6, h: int = 4,
                 desc: str = "") -> dict:
    """A pct stat greyed to NULL when its sample size (n_col) < 20 (board P5)."""
    anchor = (f"(SELECT period_start FROM {RATIOS} WHERE project = '{project}' "
              "AND period_type = 'month' AND period_key = '$month')")
    guarded = f"CASE WHEN {n_col} < 20 THEN NULL ELSE {pct_col} END"
    sql = (f"SELECT period_start AS time, {guarded} AS value FROM {RATIOS} "
           f"WHERE project = '{project}' AND period_type = 'month' "
           f"AND period_start <= {anchor} ORDER BY period_start")
    spec = {"kind": "stat", "title": title, "sql": sql, "format": "time_series",
            "unit": "percent", "w": w, "h": h, "reduce": "last",
            "desc": desc + " Greyed when n<20 (too small to trust)."}
    if th:
        spec["th"] = th
    return spec
```

- [ ] **Step 4: Rewrite `build_project_dashboard`'s `steering`, `dora`, `roi`,
  `adoption`, `agent`, `dq` sections and closing var/links in `infra/grafana/generate.py`**

Change the `trend` line near the top of `build_project_dashboard`:

```python
    trend = (f"FROM {RATIOS} WHERE {p} AND period_type = 'month' "
             "ORDER BY period_start")
```

Replace the `steering` list (drop the Predictability stat, widen Lead Time to
fill the row):

```python
    steering = [
        _stat(project, "Lead Time" if has_prod else "Merge Lead Time (no prod env)",
              "lead_time_h", "h", th["lead"], w=12,
              desc="Median hours from PR merge to next production deploy."
                   if has_prod else "Median hours from PR open to merge (no "
                   "production env yet). Lower is faster delivery."),
        _stat(project, "Incidents", "incidents", th=TH["incidents"], w=4,
              desc="Jira issues of type Incident created this month. "
                   "Green 0, amber 1-2, red 3+."),
        _stat(project, "MTTR", "mttr_h", "h", TH["mttr"], w=4,
              desc="Mean time to resolve: hours from an incident being "
                   "created to resolved. Lower is better."),
        _stat(project, "Rework %", "rework_pct", "percent", TH["rework"], w=4,
              desc="Share of merged PRs that revert or re-touch files changed "
                   "in the prior 14 days. Lower is healthier."),
    ]
```

Change `tools_sql` and the "AI Tasks by Tool" panel title inside `roi`:

```python
    tools_sql = (
        "SELECT replace(metric_key, 'ai_tasks_tool_', '') AS \"Tool\", "
        "value::float8 AS \"Tasks\" FROM reporting.metric_counts "
        f"WHERE {p} AND period_type = 'month' AND period_key = '$month' "
        "AND metric_key LIKE 'ai_tasks_tool_%' ORDER BY value DESC")
```

```python
        {"kind": "barchart", "title": "AI Tasks by Tool ($month)", "sql": tools_sql,
         "xfield": "Tool", "unit": "none", "w": 12, "h": 7, "color": ACCENT,
         "desc": "Which tool's licenses produce. From the Jira AI Tool field."},
```

Replace the `dora` list construction (drop the trailing Predictability
`.append`, adjust the no-prod width case):

```python
    dora = [
        _stat(project, "Lead Time" if has_prod else "Merge Lead Time (no prod env)",
              "lead_time_h", "h", th["lead"],
              desc="Median hours from PR merge to next production deploy."
                   if has_prod else "Median PR open→merge; no production env yet."),
        _stat(project, "MTTR", "mttr_h", "h", TH["mttr"],
              desc="Mean hours from incident created to resolved. Lower is better."),
    ]
    if has_prod:
        dora[1:1] = [
            _stat(project, "Deploys / Week", "deploys_per_week", "none", TH["deploy_freq"],
                  desc="Production deploys ÷ weeks in the window. "
                       "DORA throughput signal; higher is better."),
            _stat(project, "Change Failure Rate", "cfr_pct", "percent", TH["cfr"],
                  desc="Incidents per deploy (proxy). Target ≤15%."),
        ]
    if len(dora) == 2:            # no-prod env: 2 tiles fill the 24-wide row
        for pnl in dora:
            pnl["w"] = 12
```

Change the "Distinct engineers who merged a PR this sprint" desc in
`adoption` (the `_stat(project, "Contributors", ...)` call):

```python
        _stat(project, "Contributors", "engineers_active", w=4,
              desc="Distinct engineers who merged a PR this month (bots excluded)."),
```

Change the "Agent PRs by Sprint" timeseries title in `agent`:

```python
        {"kind": "timeseries", "title": "Agent PRs by Month", "sql": agent_bars_sql,
```

Change the two "this sprint" descriptions in `dq`:

```python
        _stat(project, "PRs (n)", "n_pr", w=4,
              desc="Merged PRs in the selected month: the sample size behind "
                   "every PR-based %. Below 20, percentages are greyed."),
        _stat(project, "Agent PRs (n)", "n_agent_pr", w=4,
              desc="Count of agent PRs this month. Agent-section percentages "
                   "stay hidden until this reaches the sample-size floor."),
```

Change the `story_sections` dict's `"steering"` entry:

```python
    story_sections = {
        "steering": ("Steering ($month)", steering),
        "roi": ("Return on Investment", roi),
        "cause_effect": ("Speed and Quality (AI vs Non-AI)", cause_effect),
        "dora": ("Delivery Health (DORA)", dora),
        "maturity": ("Maturity Ladder", maturity),
        "adoption": ("Adoption Breadth", adoption),
    }
```

Change the `links` list and the final `_dashboard(...)` call at the end of
`build_project_dashboard`:

```python
    links = [
        {"type": "link", "title": "Raw Data", "icon": "doc", "targetBlank": False,
         "url": f"/d/ai-sdlc-{project.lower()}-raw"},
        {"type": "link", "title": "Download Excel (all months)", "icon": "doc",
         "targetBlank": True, "url": f"{exporter_url}/export.xlsx?project={project}"},
        {"type": "link", "title": "Download Excel (selected month)", "icon": "doc",
         "targetBlank": True,
         "url": f"{exporter_url}/export.xlsx?project={project}&months=${{month}}"},
    ]
    return _dashboard(f"ai-sdlc-{project.lower()}", f"AI SDLC: {project}",
                      _layout(sections), [_month_var(project)], links)
```

And in `build_raw_dashboard`, change its "Download Excel (all sprints)" link
title:

```python
        {"type": "link", "title": "Download Excel (all months)", "icon": "doc",
         "targetBlank": True, "url": f"{exporter_url}/export.xlsx?project={project}"},
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_dashboards.py -v`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add infra/grafana/generate.py tests/test_dashboards.py
git commit -m "refactor: project dashboards use \$month, drop Sprint Predictability

\$sprint -> \$month template var; every period_type='sprint' filter becomes
'month'; Predictability panel removed from Steering and DORA sections."
```

---

### Task 3: BOD dashboard — `\$granularity` + `\$project` filters

**Files:**
- Modify: `infra/grafana/generate.py` (`build_bod_dashboard` and its helpers)
- Test: `tests/test_dashboards.py`

**Interfaces:**
- Consumes: `reporting.v_metrics` (month rows) and `reporting.v_metrics_q`
  (quarter rows, fixed in Task 1) via the shared explicit column list defined
  below.
- Produces: BOD dashboard's `templating.list` contains exactly two vars,
  `granularity` (custom, options `month`/`quarter`, default `month`) and
  `project` (query, multi-select, include-all). Every "latest period" and
  trend panel respects both.

**Why an explicit column list, not `SELECT *`:** see this plan's Global
Constraints — `v_metrics` and `v_metrics_q` don't share a full column set,
and `UNION ALL` requires matching column counts/types by position. The list
below (`_BOD_COLS`) contains only columns confirmed present, identically
named, in both views (verified against Task 1's fixed `v_metrics_q` and the
current `v_metrics`).

- [ ] **Step 1: Write the failing tests** — add to `tests/test_dashboards.py`:

```python
def test_bod_has_granularity_and_project_vars(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    var_names = [v["name"] for v in bod["templating"]["list"]]
    assert var_names == ["granularity", "project"]
    granularity = bod["templating"]["list"][0]
    assert granularity["query"] == "month,quarter"
    assert granularity["current"]["value"] == "month"
    project_var = bod["templating"]["list"][1]
    assert project_var["multi"] is True
    assert project_var["includeAll"] is True


def test_bod_panels_filter_by_granularity_and_project(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    sql = json.dumps(bod)
    assert "$granularity" in sql
    assert "$project" in sql
    assert "reporting.v_metrics_q" in sql


def test_bod_has_no_predictability(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    titles = _all_titles(bod)
    assert not any("Predictability" in t for t in titles)
    assert "predictability_pct" not in json.dumps(bod)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_dashboards.py::test_bod_has_granularity_and_project_vars tests/test_dashboards.py::test_bod_panels_filter_by_granularity_and_project tests/test_dashboards.py::test_bod_has_no_predictability -v`
Expected: FAIL — the current BOD dashboard has an empty `templating.list`,
no `$granularity`/`$project` anywhere in its SQL, and still has a
"Predictability %" column in the B. Delivery score table.

- [ ] **Step 3: Add the template-var and SQL-source helpers to `infra/grafana/generate.py`**

Add these just before `build_bod_dashboard` (after `_score_col`):

```python
_BOD_COLS = (
    "project, period_type, period_key, period_start, "
    "ai_pr_pct, usage_pct, agent_task_pct, ai_task_pct, "
    "lead_time_h, deploys_per_week, cfr_pct, mttr_h, "
    "rework_pct, ai_pr_review_pct, ai_pr_test_pct, rework_from_ai_pct, "
    "security_alerts, agent_pr_pct, autonomy_pct, agent_completion_pct, "
    "human_intervention_pct, agent_cycle_h, throughput_per_engineer, "
    "lead_time_ai_h, lead_time_nonai_h, pr_size_ai, pr_size_nonai, "
    "n_pr, n_ai_pr, n_tasks"
)


def _bod_vars() -> list[dict]:
    granularity = {
        "name": "granularity", "type": "custom", "label": "Granularity",
        "query": "month,quarter", "current": {"text": "month", "value": "month"},
        "options": [{"text": "month", "value": "month", "selected": True},
                    {"text": "quarter", "value": "quarter", "selected": False}],
    }
    project = {
        "name": "project", "type": "query", "datasource": DS, "label": "Project",
        "multi": True, "includeAll": True, "refresh": 2, "sort": 1,
        "query": "SELECT DISTINCT project FROM reporting.v_metrics ORDER BY project",
        "current": {}, "options": [],
    }
    return [granularity, project]


def _bod_union(alias: str) -> str:
    # Explicit shared column list, not SELECT * — v_metrics and v_metrics_q
    # don't have identical full column sets (see this file's module docstring
    # note / the plan's Global Constraints for why).
    return (f"(SELECT {_BOD_COLS} FROM reporting.v_metrics WHERE period_type='month' "
            f"UNION ALL SELECT {_BOD_COLS} FROM reporting.v_metrics_q) {alias}")


def _bod_src() -> str:
    return f"{_bod_union('r')} WHERE r.period_type = '$granularity'"


def _proj(col: str = "project") -> str:
    return f"{col} IN ($project)"
```

- [ ] **Step 4: Rewrite `build_bod_dashboard` in `infra/grafana/generate.py`**

Replace the whole function body from the `latest_month`/`latest`/`trend`
definitions down to (but not including) `def main():`. First, the source
fragments:

```python
    latest_month = (f"FROM (SELECT DISTINCT ON (project) * FROM {WIDE} "
                    "WHERE period_type = 'month' AND ai_time_saved_h IS NOT NULL "
                    f"AND {_proj('project')} "
                    "ORDER BY project, period_key DESC) w "
                    f"LEFT JOIN {MANUAL} t ON t.project = w.project "
                    "AND t.period_key = w.period_key AND t.field = 'ai_tool_cost_monthly'")
    latest = (f"FROM {_bod_src()} AND {_proj('r.project')} AND r.period_start = "
              f"(SELECT max(period_start) FROM {_bod_union('r2')} "
              "WHERE r2.project = r.project AND r2.period_type = r.period_type)")
    trend = f"FROM {_bod_src()} AND {_proj('r.project')} ORDER BY r.period_start"

    cost_latest = (
        f"FROM (SELECT project, period_key, value::numeric v FROM {MANUAL} "
        f"WHERE field = 'cost_baseline' AND {_proj('project')}) b "
        f"JOIN (SELECT project, period_key, value::numeric v FROM {MANUAL} "
        "WHERE field = 'cost_actual') a USING (project, period_key) "
        f"JOIN (SELECT project, max(period_key) mk FROM {MANUAL} "
        "WHERE field = 'cost_actual' GROUP BY project) m "
        "ON m.project = b.project AND m.mk = b.period_key")
```

(Note: `latest_month`/`cost_latest` stay **month-only**, not
`$granularity`-toggled — AI Net $ and Cost Improvement are driven by manual
inputs that are only ever entered monthly, so there's no quarter data to
roll up. They still respect `$project`.)

Next, `pulse`:

```python
    pulse = [
        {"kind": "stat", "title": "Projects Tracked",
         "sql": f"SELECT count(DISTINCT r.project) {_bod_src()} AND {_proj('r.project')}",
         "unit": "none", "w": 8, "graph": "none",
         "desc": "Distinct projects with at least one collected period, at the selected granularity."},
        {"kind": "stat", "title": "AI Net $ (portfolio, latest month)",
         "sql": (f"SELECT sum(w.ai_time_saved_h * {rate_case}) "
                 f"- sum(COALESCE(t.value::numeric, 0)) {latest_month}"),
         "unit": "currencyUSD", "th": _th(CRIT, (0, GOOD)), "w": 8, "graph": "none",
         "desc": "Sum across projects of (AI hours saved × that project's blended "
                 "rate) − monthly AI tool cost. Green when net-positive."},
        {"kind": "stat", "title": "AI PR % (portfolio)",
         "sql": f"SELECT round(avg(ai_pr_pct), 1) {latest}",
         "unit": "percent", "th": TH["ai_share"], "w": 8, "graph": "none",
         "desc": "Average AI-labeled PR share across projects, latest period each."},
        {"kind": "stat", "title": "Lead Time (portfolio)",
         "sql": f"SELECT round(avg(lead_time_h), 1) {latest}",
         "unit": "h", "th": TH["lead"], "w": 8, "graph": "none",
         "desc": "Average lead time across projects (latest period each). "
                 "Lower is faster delivery."},
        {"kind": "stat", "title": "Agent Autonomy (portfolio)",
         "sql": f"SELECT round(avg(autonomy_pct), 1) {latest}",
         "unit": "percent", "th": TH["autonomy"], "w": 8, "graph": "none",
         "desc": "Average share of agent PRs merged with zero human commits, "
                 "across projects. Blue marks maturity level, not health."},
        {"kind": "stat", "title": "Cost Improvement (portfolio)",
         "sql": f"SELECT round(avg(100 * (b.v - a.v) / NULLIF(b.v, 0)), 0) {cost_latest}",
         "unit": "percent", "w": 8, "graph": "none",
         "desc": "Baseline vs actual cost per unit (latest manual input per "
                 "project). Empty until cost_baseline/cost_actual are entered."},
    ]
```

Next, `_score_table` and `scorecard` (column header "Sprint" → "Period",
titles "Latest Sprint" → "Latest Period", and the B. Delivery table drops its
Predictability column entirely):

```python
    def _score_table(title: str, cols: list[str], overrides: list[dict],
                     desc: str) -> dict:
        # Project + Period are pinned first; each themed table stays narrow
        # enough (~5-7 cols) to fit w:24 with no horizontal scroll, so a long
        # list of project rows reads top-to-bottom instead of sideways.
        sql = ("SELECT project AS \"Project\", period_key AS \"Period\", "
               + ", ".join(cols) + f" {latest} ORDER BY project")
        return {"kind": "table", "title": title, "sql": sql, "unit": "none",
                "w": 24, "h": 6, "overrides": overrides, "desc": desc}

    # Themes mirror workbook «3. Monthly» raw-input groups (A/B/C/D) so the
    # dashboard and the Excel line up column-for-column.
    scorecard = [
        _score_table(
            "A. Adoption: Latest Period",
            ["n_tasks AS \"Tasks\"", "n_pr AS \"PRs\"",
             "round(ai_pr_pct, 1) AS \"AI PR %\"",
             "round(agent_task_pct, 1) AS \"Agent Task %\"",
             "round(usage_pct, 0) AS \"Usage %\"",
             "round(ai_task_pct, 1) AS \"AI Task %\"",
             "round(throughput_per_engineer, 1) AS \"Throughput/Eng\""],
            [_score_col("AI PR %", TH["ai_share"]),
             _score_col("AI Task %", TH["ai_share"]),
             _score_col("Usage %", TH["usage"])],
            "How broadly AI is used: PR share, agent task share, engineer "
            "usage rate (target ≥80%), and throughput per engineer."),
        _score_table(
            "B. Delivery (DORA): Latest Period",
            ["round(lead_time_h, 1) AS \"Lead Time h\"",
             "round(deploys_per_week, 2) AS \"Deploys/wk\"",
             "round(cfr_pct, 1) AS \"CFR %\"",
             "round(mttr_h, 1) AS \"MTTR h\""],
            [_score_col("Lead Time h", TH["lead"]),
             _score_col("Deploys/wk", TH["deploy_freq"]),
             _score_col("CFR %", TH["cfr"]),
             _score_col("MTTR h", TH["mttr"])],
            "DORA throughput + stability. Green = on target, yellow = watch, "
            "red = act."),
        _score_table(
            "C. Quality: Latest Period",
            ["round(ai_pr_review_pct, 1) AS \"Review %\"",
             "round(rework_pct, 1) AS \"Rework %\"",
             "round(ai_pr_test_pct, 1) AS \"AI PR Test %\"",
             "round(rework_from_ai_pct, 1) AS \"Rework from AI %\"",
             "security_alerts AS \"Alerts\""],
            [_score_col("Review %", TH["review"]),
             _score_col("Rework %", TH["rework"]),
             _score_col("Alerts", TH["alerts"])],
            "Verification quality: human review coverage, rework rate, AI PRs "
            "touching tests, share of rework traced to AI PRs, and open "
            "security alerts."),
        _score_table(
            "D. Agent: Latest Period",
            ["round(agent_pr_pct, 1) AS \"Agent PR %\"",
             "round(autonomy_pct, 1) AS \"Autonomy %\"",
             "round(agent_completion_pct, 1) AS \"Completion %\"",
             "round(human_intervention_pct, 1) AS \"Human-fix %\"",
             "round(agent_cycle_h, 1) AS \"Agent Cycle h\""],
            [_score_col("Autonomy %", TH["autonomy"])],
            "Agent maturity: agent PR share, autonomy (merged with zero human "
            "commits), completion vs human-fix rate, and cycle time."),
    ]
```

Next, `evidence`:

```python
    evidence = [
        {"kind": "table", "title": "Evidence: AI vs Non-AI (latest period)",
         "sql": ("SELECT project AS \"Project\", "
                 "round(lead_time_ai_h, 1) AS \"Lead AI h\", "
                 "round(lead_time_nonai_h, 1) AS \"Lead non-AI h\", "
                 "round(100 * (lead_time_nonai_h - lead_time_ai_h) "
                 "/ NULLIF(lead_time_nonai_h, 0), 0) AS \"Lead Time Faster %\", "
                 "round(pr_size_ai, 0) AS \"PR size AI\", "
                 "round(pr_size_nonai, 0) AS \"PR size non-AI\", "
                 "n_ai_pr AS \"n(AI PR)\" "
                 f"{latest} ORDER BY project"),
         "unit": "none", "w": 24, "h": 6,
         "desc": ("AI vs non-AI, as pre-computed deltas with sample size. "
                  "Lead Time Faster % is positive when AI is faster, negative "
                  "when AI is slower — a negative value is a legitimate finding "
                  "(verification overhead), not an error: read it with the "
                  "quality columns. n(AI PR) is the sample behind the AI "
                  "figures.")},
    ]
```

Next, `direction` (three trend charts, titles "by Sprint" → "by Period"):

```python
    direction = [
        {"kind": "timeseries", "title": "AI PR % by Period",
         "sql": f"SELECT r.period_start AS time, r.project, r.ai_pr_pct {trend}",
         "format": "time_series", "unit": "percent", "w": 8, "h": 8,
         "overrides": _project_colors(projects),
         "desc": "AI-labeled PR share per period, one line per project. "
                 "Adoption trajectory across the portfolio."},
        {"kind": "timeseries", "title": "Lead Time by Period",
         "sql": f"SELECT r.period_start AS time, r.project, r.lead_time_h {trend}",
         "format": "time_series", "unit": "h", "w": 8, "h": 8,
         "overrides": _project_colors(projects),
         "desc": "Lead time (hours) per period, one line per project. "
                 "Lower/flatter is better."},
        {"kind": "timeseries", "title": "Agent Autonomy % by Period",
         "sql": f"SELECT r.period_start AS time, r.project, r.autonomy_pct {trend}",
         "format": "time_series", "unit": "percent", "w": 8, "h": 8,
         "overrides": _project_colors(projects),
         "desc": "Share of agent PRs merged with no human commits, per period "
                 "and project. Rising = growing agent autonomy."},
    ]
```

Next, `usage_by_project` and `value` (project filter added to all three):

```python
    usage_by_project = (
        "SELECT DISTINCT ON (w.project) w.project AS \"Project\", "
        "round(w.usage_pct, 0)::float8 AS \"Usage %\" "
        f"FROM {RATIOS} w "
        f"WHERE w.period_type = 'month' AND {_proj('w.project')} "
        "ORDER BY w.project, w.period_key DESC")
    value = [
        {"kind": "barchart", "title": "Cost Improvement % by Project (latest)",
         "sql": (f"SELECT b.project AS \"Project\", "
                 f"round(100 * (b.v - a.v) / NULLIF(b.v, 0), 0)::float8 AS \"Cost Improvement %\" "
                 f"{cost_latest} ORDER BY 2 DESC"),
         "xfield": "Project", "unit": "percent", "w": 8, "h": 8, "color": ACCENT,
         "desc": "From monthly manual inputs (cost baseline vs actual per unit)."},
        {"kind": "barchart", "title": "Engineer Usage Rate by Project (latest month)",
         "sql": usage_by_project, "xfield": "Project", "unit": "percent", "w": 8, "h": 8,
         "color": PALETTE[1],
         "desc": ("AI engineers ÷ team size (manual input, falls back to "
                  "active PR contributors). Framework target ≥80%.")},
        {"kind": "barchart", "title": "AI Tasks by Tool (portfolio, all months)",
         "sql": ("SELECT replace(metric_key, 'ai_tasks_tool_', '') AS \"Tool\", "
                 "sum(value)::float8 AS \"Tasks\" FROM reporting.metric_counts "
                 f"WHERE period_type = 'month' AND metric_key LIKE 'ai_tasks_tool_%' "
                 f"AND {_proj('project')} "
                 "GROUP BY 1 ORDER BY 2 DESC"),
         "xfield": "Tool", "unit": "none", "w": 8, "h": 8, "color": PALETTE[2],
         "desc": "Portfolio tool mix: informs license decisions."},
    ]
```

Next, `heatmap` (project filter added):

```python
    heatmap = [
        {"kind": "table", "title": "Portfolio Maturity (A–E)",
         "sql": (f"SELECT project AS \"Project\", lvl_a AS \"A\", lvl_b AS \"B\", "
                 "lvl_c AS \"C*\", lvl_d AS \"D\", lvl_e AS \"E*\", "
                 "overall AS \"OVERALL\" FROM (" + _levels_latest_all() + ") x "
                 f"WHERE {_proj('project')} ORDER BY overall, project"),
         "unit": "none", "w": 24, "h": 8,
         "overrides": [_score_col(c, _th(CRIT, (2, WARN), (3, WARN), (4, GOOD)))
                       for c in ("A", "B", "C*", "D", "E*", "OVERALL")],
         "desc": ("Each project's A-E levels for its latest quarter. C and E are "
                  "gates (marked *). Click a project to open its dashboard. "
                  "OVERALL = MIN(E, C, round(avg)).")},
    ]
```

Finally, the `sections` list and the closing `_dashboard(...)` call are
unchanged in structure — only the templating argument changes:

```python
    sections = [
        ("Return on Investment", pulse),
        ("Project Scorecard (latest period)", scorecard),
        ("AI vs Non-AI Comparison", evidence),
    ]
    if len(cfgs) >= 2:
        sections.append(("Portfolio Maturity", heatmap))
    sections += [
        ("Delivery Health", direction),
        ("Where to Invest", value),
    ]
    links = [{"type": "link", "title": "Download Excel (all projects)", "icon": "doc",
              "targetBlank": True, "url": f"{exporter_url}/export.xlsx?project=all"}]
    return _dashboard("ai-sdlc-bod", "AI SDLC: Portfolio (BOD)",
                      _layout(sections), _bod_vars(), links)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_dashboards.py -v`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add infra/grafana/generate.py tests/test_dashboards.py
git commit -m "feat: BOD dashboard gets \$granularity (month/quarter) and \$project filters

Every latest-period and trend panel now reads through an explicit-column
UNION of v_metrics (month) and v_metrics_q (quarter), filtered by both new
template vars. Predictability column dropped from the B. Delivery table."
```

---

### Task 4: Exporter — "Monthly detail" sheet, `?months=` filter

**Files:**
- Modify: `exporter/workbook.py`
- Modify: `exporter/app.py`
- Test: `tests/test_exporter_workbook.py`
- Test: `tests/test_exporter_app.py`

**Interfaces:**
- Consumes: `exporter.data.fetch_period_rows(db_url, projects, "month")`
  (unchanged — already generic on `period_type`).
- Produces: `exporter.workbook.parse_month_range(spec: str | None) ->
  tuple[str, str] | None`, `month_in_range(period_key: str, rng) -> bool`,
  `fill_workbook(wb, projects, month_rows, manual) -> Workbook` (now takes
  ONE row-set, not `sprint_rows` + `month_rows`). `exporter.app.export`'s
  query param is `months`, not `sprints`.

- [ ] **Step 1: Write the failing tests** — replace
  `tests/test_exporter_workbook.py`:

```python
from datetime import date
from decimal import Decimal
import pytest
from exporter.template import build_workbook
from exporter.workbook import (
    parse_month_range, month_in_range, quarters_of, fill_workbook,
)


def test_parse_month_range():
    assert parse_month_range("2026-01:2026-06") == ("2026-01", "2026-06")
    assert parse_month_range("2026-03") == ("2026-03", "2026-03")
    assert parse_month_range(None) is None
    with pytest.raises(ValueError):
        parse_month_range("junk")


def test_parse_month_range_rejects_empty_range():
    with pytest.raises(ValueError):
        parse_month_range("2026-06:2026-01")   # lo > hi


def test_month_in_range():
    assert month_in_range("2026-04", ("2026-01", "2026-06")) is True
    assert month_in_range("2026-07", ("2026-01", "2026-06")) is False
    assert month_in_range("2026-07", None) is True


def test_quarters_of():
    assert quarters_of(["2026-01", "2026-04", "2026-07"]) == \
        ["2026-Q1", "2026-Q2", "2026-Q3"]


def test_fill_workbook_writes_sheets():
    month_row = {"project": "Future", "period_key": "2026-06",
                 "period_start": date(2026, 6, 1), "ai_prs": Decimal(20),
                 "total_prs": Decimal(50), "deploys": Decimal(4),
                 "weeks": Decimal("4.3"), "ai_pr_pct": Decimal(40)}
    manual = {("Future", "2026-06"): {"total_engineers": "18"},
              ("Future", "2026-Q2"): {"g1_agents_md": "Yes",
                                      "evidence_a": "Live dashboard"}}
    wb = fill_workbook(build_workbook(), ["Future"], [month_row], manual)

    proj = wb["2. Projects"]
    assert (proj["A3"].value, proj["B3"].value) == ("P01", "Future")

    monthly = wb["3. Monthly"]
    assert monthly["A4"].value == "P01"
    assert monthly["B4"].value.strftime("%Y-%m") == "2026-06"
    assert float(monthly["F4"].value) == 20.0   # ai_prs
    assert float(monthly["E4"].value) == 18.0   # manual total_engineers
    assert str(monthly["C4"].value).startswith("=")  # formula intact

    quarterly = wb["4. Quarterly"]
    assert quarterly["A4"].value == "P01"
    assert quarterly["B4"].value == "2026-Q2"
    assert quarterly["C4"].value == "Yes"        # g1_agents_md
    assert quarterly["AB4"].value == "Live dashboard"

    detail = wb["Monthly detail"]
    assert detail["A1"].value == "Project"
    assert detail["A2"].value == "Future"
```

Replace `tests/test_exporter_app.py`'s fixture and sprint-named tests:

```python
import io
from datetime import date
from decimal import Decimal
import openpyxl
import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("REPORTING_DB_URL", "postgresql://unused")
    import exporter.app as app_module
    monkeypatch.setattr(app_module, "fetch_projects", lambda db: ["Future"])
    monkeypatch.setattr(app_module, "fetch_period_rows", lambda db, ps, pt: [{
        "project": "Future", "period_key": "2026-06",
        "period_type": pt, "period_start": date(2026, 6, 1),
        "period_end": date(2026, 6, 30), "ai_prs": Decimal(3),
        "total_prs": Decimal(10), "ai_pr_pct": Decimal(30),
    }])
    monkeypatch.setattr(app_module, "fetch_manual", lambda db, ps: {})
    return TestClient(app_module.app)


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_export_returns_workbook(client):
    r = client.get("/export.xlsx", params={"project": "Future", "months": "2026-01:2026-06"})
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]
    wb = openpyxl.load_workbook(io.BytesIO(r.content))
    assert wb["2. Projects"]["B3"].value == "Future"
    assert "Monthly detail" in wb.sheetnames


def test_export_unknown_project_404(client):
    assert client.get("/export.xlsx", params={"project": "Nope"}).status_code == 404


def test_export_bad_months_422(client):
    assert client.get("/export.xlsx", params={"months": "banana"}).status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_exporter_workbook.py tests/test_exporter_app.py -v`
Expected: FAIL — `parse_month_range`/`month_in_range` don't exist yet;
`fill_workbook` still requires a `sprint_rows` positional arg; the app still
reads `sprints`, not `months`.

- [ ] **Step 3: Rewrite `exporter/workbook.py`**

Change `SPRINT_SHEET_COLS` (rename, drop the three retired columns):

```python
MONTHLY_DETAIL_COLS = [
    "period_key", "period_start", "ai_users_weekly_avg", "ai_prs", "total_prs",
    "ai_pr_pct", "agent_tasks", "ai_tasks", "total_tasks", "agent_task_pct",
    "lead_time_h", "deploys", "weeks", "deploys_per_week", "incidents",
    "cfr_pct", "mttr_h", "rework_prs", "rework_pct", "ai_prs_reviewed",
    "ai_pr_review_pct", "security_alerts", "agent_prs_total",
    "agent_prs_merged", "agent_prs_human_fixed", "agent_prs_autonomous",
    "agent_completion_pct", "human_intervention_pct", "autonomy_pct",
    "agent_cycle_h",
]
```

Replace `parse_sprint_range`/`sprint_in_range` with:

```python
def parse_month_range(spec: str | None) -> tuple[str, str] | None:
    if not spec:
        return None
    m = re.fullmatch(r"(\d{4}-\d{2})(?::(\d{4}-\d{2}))?", spec)
    if not m:
        raise ValueError(f"months must look like '2026-06' or '2026-01:2026-06', got {spec!r}")
    lo = m.group(1)
    hi = m.group(2) if m.group(2) else lo
    if lo > hi:
        raise ValueError(f"empty month range {spec!r}")
    return lo, hi


def month_in_range(period_key: str, rng: tuple[str, str] | None) -> bool:
    if rng is None:
        return True
    return rng[0] <= period_key <= rng[1]
```

Delete `months_overlapped` entirely (no longer needed — there's only one
row-set now, no "expand sprint window to overlapping months" step). Keep
`_month_iter` only if `quarters_of` still needs it — it doesn't (`quarters_of`
takes a `months: list[str]` directly), so delete `_month_iter` too.

Replace `fill_workbook`:

```python
def fill_workbook(wb: openpyxl.Workbook, projects: list[str],
                  month_rows: list[dict], manual: dict) -> openpyxl.Workbook:
    ids = {name: f"P{i + 1:02d}" for i, name in enumerate(sorted(projects))}

    ws = wb["2. Projects"]
    for i, name in enumerate(sorted(projects)):
        ws[f"A{3 + i}"], ws[f"B{3 + i}"] = ids[name], name

    ws = wb["3. Monthly"]
    for i, row in enumerate(sorted(month_rows,
                                   key=lambda r: (r["project"], r["period_key"]))):
        r = 4 + i
        ws[f"A{r}"] = ids[row["project"]]
        ws[f"B{r}"] = datetime.strptime(row["period_key"], "%Y-%m")
        for col, key in SHEET3_METRIC_COLS.items():
            ws[f"{col}{r}"] = _num(row.get(key))
        month_manual = manual.get((row["project"], row["period_key"]), {})
        for col, field in SHEET3_MANUAL_COLS.items():
            if field in month_manual:
                ws[f"{col}{r}"] = float(month_manual[field])

    ws = wb["4. Quarterly"]
    quarter_keys = sorted({(p, q) for (p, q) in manual if re.fullmatch(r"\d{4}-Q[1-4]", q)
                           and p in projects})
    for i, (project, quarter) in enumerate(quarter_keys):
        r = 4 + i
        ws[f"A{r}"], ws[f"B{r}"] = ids[project], quarter
        entries = manual[(project, quarter)]
        for j, field in enumerate(SHEET4_FIELDS):
            if field in entries:
                ws.cell(row=r, column=3 + j, value=entries[field])

    ws = wb.create_sheet("Monthly detail")
    header = ["Project"] + [c.replace("_", " ").title() for c in MONTHLY_DETAIL_COLS]
    for j, title in enumerate(header, start=1):
        ws.cell(row=1, column=j, value=title)
    for i, row in enumerate(sorted(month_rows,
                                   key=lambda r: (r["project"], r["period_start"])), start=2):
        ws.cell(row=i, column=1, value=row["project"])
        for j, key in enumerate(MONTHLY_DETAIL_COLS, start=2):
            v = row.get(key)
            if key == "period_key":
                ws.cell(row=i, column=j, value=v)
            elif key == "period_start":
                ws.cell(row=i, column=j, value=str(v))
            else:
                ws.cell(row=i, column=j, value=_num(v))

    add_charts(wb)
    return wb
```

- [ ] **Step 4: Rewrite `exporter/app.py`'s import and `export` route**

Change the import:

```python
from exporter.workbook import fill_workbook, parse_month_range, month_in_range
```

Change `export`:

```python
@app.get("/export.xlsx")
def export(project: str = "all", months: str | None = None) -> Response:
    db_url = os.environ["REPORTING_DB_URL"]
    try:
        rng = parse_month_range(months)
    except ValueError as e:
        raise HTTPException(422, str(e))

    known = fetch_projects(db_url)
    projects = known if project == "all" else [project]
    if project != "all" and project not in known:
        raise HTTPException(404, f"unknown project {project!r}")

    month_rows = [r for r in fetch_period_rows(db_url, projects, "month")
                  if month_in_range(r["period_key"], rng)]
    manual = fetch_manual(db_url, projects)

    wb = fill_workbook(build_workbook(), projects, month_rows, manual)
    buf = io.BytesIO()
    wb.save(buf)
    name = f"ai-sdlc-maturity_{project}_{months or 'all'}.xlsx"
    return Response(buf.getvalue(), media_type=XLSX,
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_exporter_workbook.py tests/test_exporter_app.py -v`
Expected: All PASS.

- [ ] **Step 6: Run the full suite to catch any other exporter consumer**

Run: `grep -rn "sprint_rows\|sprints=\|parse_sprint_range\|sprint_in_range\|months_overlapped" exporter/ infra/ tests/`
Expected: no output. Then: `pytest -v`
Expected: all PASS except `tests/test_seed.py` (Task 5 closes that gap).

- [ ] **Step 7: Commit**

```bash
git add exporter/workbook.py exporter/app.py tests/test_exporter_workbook.py tests/test_exporter_app.py
git commit -m "refactor: exporter 'Sprint data' sheet -> 'Monthly detail', ?months= filter

parse_sprint_range/sprint_in_range -> parse_month_range/month_in_range
(string-comparable YYYY-MM, no index math needed). fill_workbook takes one
month_rows set instead of sprint_rows + month_rows; months_overlapped is
gone with it (nothing left to bridge)."
```

---

### Task 5: Rewrite `seed.sql` — month-only, full quarter per project

**Files:**
- Modify: `infra/db/seed.sql` (full rewrite)

**Interfaces:**
- Consumes: `reporting.metric_counts` (Task 1's schema), the fixed
  `reporting.v_metrics_q`.
- Produces: local Grafana stack (`infra/docker/compose.local.yml`) seeds with
  month-only data; Future and TeacherZone each get 4 consecutive months
  (2026-06 through 2026-09) so 2026-Q3 (Jul/Aug/Sep) is a **complete** quarter
  — `$granularity=quarter` on the BOD dashboard has real data to show, not an
  empty partial quarter.

- [ ] **Step 1: Replace `infra/db/seed.sql` entirely**

```sql
-- Local-only seed data for the Grafana dev stack (infra/docker/compose.local.yml).
-- Loaded automatically by the local Postgres after init.sql + views.sql.
-- Never run this against a real reporting database.

-- Four months for Future: 2026-06 (Q2 tail, for trend history across a
-- quarter boundary) plus a full 2026-Q3 (07/08/09), so the BOD dashboard's
-- $granularity=quarter option has real, complete-quarter data to roll up.
WITH periods(period_key, period_start, period_end) AS (VALUES
  ('2026-06', DATE '2026-06-01', DATE '2026-06-30'),
  ('2026-07', DATE '2026-07-01', DATE '2026-07-31'),
  ('2026-08', DATE '2026-08-01', DATE '2026-08-31'),
  ('2026-09', DATE '2026-09-01', DATE '2026-09-30')
),
vals(period_key, metric_key, value) AS (VALUES
  -- adoption
  ('2026-06','ai_users_weekly_avg',7.5), ('2026-07','ai_users_weekly_avg',10.0),
  ('2026-08','ai_users_weekly_avg',11.0), ('2026-09','ai_users_weekly_avg',12.0),
  ('2026-06','engineers_active',16), ('2026-07','engineers_active',17),
  ('2026-08','engineers_active',18), ('2026-09','engineers_active',18),
  ('2026-06','ai_prs',34),  ('2026-07','ai_prs',50),  ('2026-08','ai_prs',58),  ('2026-09','ai_prs',64),
  ('2026-06','total_prs',85),('2026-07','total_prs',92),('2026-08','total_prs',96),('2026-09','total_prs',100),
  ('2026-06','agent_tasks',16), ('2026-07','agent_tasks',24),
  ('2026-08','agent_tasks',30), ('2026-09','agent_tasks',36),
  ('2026-06','ai_tasks',60),  ('2026-07','ai_tasks',68),  ('2026-08','ai_tasks',74),  ('2026-09','ai_tasks',80),
  ('2026-06','total_tasks',105),('2026-07','total_tasks',112),('2026-08','total_tasks',116),('2026-09','total_tasks',120),
  -- delivery / DORA
  ('2026-06','lead_time_h',58),('2026-07','lead_time_h',40),('2026-08','lead_time_h',34),('2026-09','lead_time_h',28),
  ('2026-06','deploys',12),  ('2026-07','deploys',18),  ('2026-08','deploys',20),  ('2026-09','deploys',22),
  ('2026-06','weeks',4.3),   ('2026-07','weeks',4.3),   ('2026-08','weeks',4.3),   ('2026-09','weeks',4.3),
  ('2026-06','incidents',3), ('2026-07','incidents',2), ('2026-08','incidents',2), ('2026-09','incidents',1),
  ('2026-06','mttr_h',8),    ('2026-07','mttr_h',5),    ('2026-08','mttr_h',5),    ('2026-09','mttr_h',4),
  -- quality / security
  ('2026-06','rework_prs',8),('2026-07','rework_prs',6),('2026-08','rework_prs',5),('2026-09','rework_prs',4),
  ('2026-06','ai_prs_reviewed',24),('2026-07','ai_prs_reviewed',36),
  ('2026-08','ai_prs_reviewed',44),('2026-09','ai_prs_reviewed',50),
  ('2026-06','security_alerts',4),('2026-07','security_alerts',3),
  ('2026-08','security_alerts',2),('2026-09','security_alerts',1),
  -- agent maturity
  -- 2026-06 stays under the 20 sample-size floor (shows the guard greying it); later months cross it.
  ('2026-06','agent_prs_total',18), ('2026-07','agent_prs_total',28),
  ('2026-08','agent_prs_total',36), ('2026-09','agent_prs_total',44),
  ('2026-06','agent_prs_merged',15),('2026-07','agent_prs_merged',24),
  ('2026-08','agent_prs_merged',32),('2026-09','agent_prs_merged',40),
  ('2026-06','agent_prs_human_fixed',7),('2026-07','agent_prs_human_fixed',9),
  ('2026-08','agent_prs_human_fixed',10),('2026-09','agent_prs_human_fixed',11),
  ('2026-06','agent_prs_autonomous',12),('2026-07','agent_prs_autonomous',20),
  ('2026-08','agent_prs_autonomous',27),('2026-09','agent_prs_autonomous',33),
  ('2026-06','agent_cycle_h',10),('2026-07','agent_cycle_h',6),
  ('2026-08','agent_cycle_h',5),('2026-09','agent_cycle_h',4)
)
INSERT INTO reporting.metric_counts
  (project, period_type, period_key, period_start, period_end, metric_key, value)
SELECT 'Future', 'month', v.period_key, p.period_start, p.period_end, v.metric_key, v.value
FROM vals v JOIN periods p USING (period_key);

-- TeacherZone: same four months, lower-but-improving adoption (second project
-- so the BOD portfolio dashboard shows real cross-project comparison).
WITH periods(period_key, period_start, period_end) AS (VALUES
  ('2026-06', DATE '2026-06-01', DATE '2026-06-30'),
  ('2026-07', DATE '2026-07-01', DATE '2026-07-31'),
  ('2026-08', DATE '2026-08-01', DATE '2026-08-31'),
  ('2026-09', DATE '2026-09-01', DATE '2026-09-30')
),
vals(period_key, metric_key, value) AS (VALUES
  ('2026-06','ai_users_weekly_avg',4.5), ('2026-07','ai_users_weekly_avg',6.0),
  ('2026-08','ai_users_weekly_avg',6.5), ('2026-09','ai_users_weekly_avg',7.0),
  ('2026-06','engineers_active',11), ('2026-07','engineers_active',12),
  ('2026-08','engineers_active',12), ('2026-09','engineers_active',13),
  ('2026-06','ai_prs',24), ('2026-07','ai_prs',38), ('2026-08','ai_prs',44), ('2026-09','ai_prs',48),
  ('2026-06','total_prs',95),('2026-07','total_prs',100),('2026-08','total_prs',104),('2026-09','total_prs',108),
  ('2026-06','agent_tasks',8), ('2026-07','agent_tasks',14),
  ('2026-08','agent_tasks',18), ('2026-09','agent_tasks',22),
  ('2026-06','ai_tasks',40),  ('2026-07','ai_tasks',46),  ('2026-08','ai_tasks',50),  ('2026-09','ai_tasks',54),
  ('2026-06','total_tasks',82),('2026-07','total_tasks',90),('2026-08','total_tasks',94),('2026-09','total_tasks',98),
  ('2026-06','lead_time_h',78),('2026-07','lead_time_h',60),('2026-08','lead_time_h',52),('2026-09','lead_time_h',46),
  ('2026-06','deploys',8),  ('2026-07','deploys',12),  ('2026-08','deploys',14),  ('2026-09','deploys',16),
  ('2026-06','weeks',4.3),  ('2026-07','weeks',4.3),   ('2026-08','weeks',4.3),   ('2026-09','weeks',4.3),
  ('2026-06','incidents',5),('2026-07','incidents',3), ('2026-08','incidents',3), ('2026-09','incidents',2),
  ('2026-06','mttr_h',11),  ('2026-07','mttr_h',7),    ('2026-08','mttr_h',7),    ('2026-09','mttr_h',6),
  ('2026-06','rework_prs',10),('2026-07','rework_prs',8),('2026-08','rework_prs',7),('2026-09','rework_prs',6),
  ('2026-06','ai_prs_reviewed',12),('2026-07','ai_prs_reviewed',24),
  ('2026-08','ai_prs_reviewed',30),('2026-09','ai_prs_reviewed',36),
  ('2026-06','security_alerts',6),('2026-07','security_alerts',4),
  ('2026-08','security_alerts',3),('2026-09','security_alerts',2),
  -- 2026-06 stays under the 20 sample-size floor here too.
  ('2026-06','agent_prs_total',14), ('2026-07','agent_prs_total',22),
  ('2026-08','agent_prs_total',28), ('2026-09','agent_prs_total',34),
  ('2026-06','agent_prs_merged',11),('2026-07','agent_prs_merged',18),
  ('2026-08','agent_prs_merged',24),('2026-09','agent_prs_merged',29),
  ('2026-06','agent_prs_human_fixed',6),('2026-07','agent_prs_human_fixed',8),
  ('2026-08','agent_prs_human_fixed',9),('2026-09','agent_prs_human_fixed',10),
  ('2026-06','agent_prs_autonomous',8),('2026-07','agent_prs_autonomous',14),
  ('2026-08','agent_prs_autonomous',19),('2026-09','agent_prs_autonomous',23),
  ('2026-06','agent_cycle_h',13),('2026-07','agent_cycle_h',9),
  ('2026-08','agent_cycle_h',8),('2026-09','agent_cycle_h',7)
)
INSERT INTO reporting.metric_counts
  (project, period_type, period_key, period_start, period_end, metric_key, value)
SELECT 'TeacherZone', 'month', v.period_key, p.period_start, p.period_end, v.metric_key, v.value
FROM vals v JOIN periods p USING (period_key);

-- Segmented AI-vs-non-AI metrics: power the "delta not two numbers" evidence
-- panels, the ROI panel (ai_time_saved_h), AI-PR test coverage, and AI
-- rework. AI PRs merge faster, smaller, with fewer review rounds than non-AI.
WITH periods(period_key, period_start, period_end) AS (VALUES
  ('2026-06', DATE '2026-06-01', DATE '2026-06-30'),
  ('2026-07', DATE '2026-07-01', DATE '2026-07-31'),
  ('2026-08', DATE '2026-08-01', DATE '2026-08-31'),
  ('2026-09', DATE '2026-09-01', DATE '2026-09-30')
),
vals(period_key, metric_key, value) AS (VALUES
  ('2026-06','lead_time_ai_h',42),('2026-07','lead_time_ai_h',30),
  ('2026-08','lead_time_ai_h',25),('2026-09','lead_time_ai_h',20),
  ('2026-06','lead_time_nonai_h',68),('2026-07','lead_time_nonai_h',50),
  ('2026-08','lead_time_nonai_h',44),('2026-09','lead_time_nonai_h',38),
  ('2026-06','pr_size_ai',170),('2026-07','pr_size_ai',155),
  ('2026-08','pr_size_ai',148),('2026-09','pr_size_ai',140),
  ('2026-06','pr_size_nonai',310),('2026-07','pr_size_nonai',290),
  ('2026-08','pr_size_nonai',280),('2026-09','pr_size_nonai',270),
  ('2026-06','first_review_ai_h',3.8),('2026-07','first_review_ai_h',3.2),
  ('2026-08','first_review_ai_h',2.8),('2026-09','first_review_ai_h',2.4),
  ('2026-06','first_review_nonai_h',7.5),('2026-07','first_review_nonai_h',6.5),
  ('2026-08','first_review_nonai_h',6.0),('2026-09','first_review_nonai_h',5.5),
  ('2026-06','review_rounds_ai',1.3),('2026-07','review_rounds_ai',1.2),
  ('2026-08','review_rounds_ai',1.1),('2026-09','review_rounds_ai',1.0),
  ('2026-06','review_rounds_nonai',2.0),('2026-07','review_rounds_nonai',1.9),
  ('2026-08','review_rounds_nonai',1.8),('2026-09','review_rounds_nonai',1.7),
  ('2026-06','ai_time_saved_h',120),('2026-07','ai_time_saved_h',180),
  ('2026-08','ai_time_saved_h',210),('2026-09','ai_time_saved_h',240),
  ('2026-06','ai_prs_with_tests',26),('2026-07','ai_prs_with_tests',42),
  ('2026-08','ai_prs_with_tests',48),('2026-09','ai_prs_with_tests',54),
  ('2026-06','rework_from_ai_prs',3),('2026-07','rework_from_ai_prs',2),
  ('2026-08','rework_from_ai_prs',2),('2026-09','rework_from_ai_prs',1)
)
INSERT INTO reporting.metric_counts
  (project, period_type, period_key, period_start, period_end, metric_key, value)
SELECT 'Future', 'month', v.period_key, p.period_start, p.period_end, v.metric_key, v.value
FROM vals v JOIN periods p USING (period_key);

WITH periods(period_key, period_start, period_end) AS (VALUES
  ('2026-06', DATE '2026-06-01', DATE '2026-06-30'),
  ('2026-07', DATE '2026-07-01', DATE '2026-07-31'),
  ('2026-08', DATE '2026-08-01', DATE '2026-08-31'),
  ('2026-09', DATE '2026-09-01', DATE '2026-09-30')
),
vals(period_key, metric_key, value) AS (VALUES
  ('2026-06','lead_time_ai_h',62),('2026-07','lead_time_ai_h',48),
  ('2026-08','lead_time_ai_h',42),('2026-09','lead_time_ai_h',36),
  ('2026-06','lead_time_nonai_h',86),('2026-07','lead_time_nonai_h',68),
  ('2026-08','lead_time_nonai_h',60),('2026-09','lead_time_nonai_h',52),
  ('2026-06','pr_size_ai',200),('2026-07','pr_size_ai',185),
  ('2026-08','pr_size_ai',178),('2026-09','pr_size_ai',170),
  ('2026-06','pr_size_nonai',330),('2026-07','pr_size_nonai',305),
  ('2026-08','pr_size_nonai',295),('2026-09','pr_size_nonai',285),
  ('2026-06','first_review_ai_h',5.5),('2026-07','first_review_ai_h',4.5),
  ('2026-08','first_review_ai_h',4.0),('2026-09','first_review_ai_h',3.5),
  ('2026-06','first_review_nonai_h',9.5),('2026-07','first_review_nonai_h',7.5),
  ('2026-08','first_review_nonai_h',7.0),('2026-09','first_review_nonai_h',6.5),
  ('2026-06','review_rounds_ai',1.5),('2026-07','review_rounds_ai',1.4),
  ('2026-08','review_rounds_ai',1.3),('2026-09','review_rounds_ai',1.2),
  ('2026-06','review_rounds_nonai',2.2),('2026-07','review_rounds_nonai',2.0),
  ('2026-08','review_rounds_nonai',1.9),('2026-09','review_rounds_nonai',1.8),
  ('2026-06','ai_time_saved_h',70),('2026-07','ai_time_saved_h',110),
  ('2026-08','ai_time_saved_h',130),('2026-09','ai_time_saved_h',150),
  ('2026-06','ai_prs_with_tests',18),('2026-07','ai_prs_with_tests',30),
  ('2026-08','ai_prs_with_tests',34),('2026-09','ai_prs_with_tests',38),
  ('2026-06','rework_from_ai_prs',4),('2026-07','rework_from_ai_prs',3),
  ('2026-08','rework_from_ai_prs',3),('2026-09','rework_from_ai_prs',2)
)
INSERT INTO reporting.metric_counts
  (project, period_type, period_key, period_start, period_end, metric_key, value)
SELECT 'TeacherZone', 'month', v.period_key, p.period_start, p.period_end, v.metric_key, v.value
FROM vals v JOIN periods p USING (period_key);

-- AI tasks split by tool (drives the "AI Tasks by Tool" bar chart). Keys look
-- like ai_tasks_tool_<Tool>; the dashboard strips the prefix for the label.
WITH periods(period_key, period_start, period_end) AS (VALUES
  ('2026-07', DATE '2026-07-01', DATE '2026-07-31'),
  ('2026-08', DATE '2026-08-01', DATE '2026-08-31'),
  ('2026-09', DATE '2026-09-01', DATE '2026-09-30')
),
vals(project, period_key, metric_key, value) AS (VALUES
  ('Future','2026-07','ai_tasks_tool_Claude Code',24),('Future','2026-07','ai_tasks_tool_GitHub Copilot',8),('Future','2026-07','ai_tasks_tool_Cursor',2),
  ('Future','2026-08','ai_tasks_tool_Claude Code',28),('Future','2026-08','ai_tasks_tool_GitHub Copilot',8),('Future','2026-08','ai_tasks_tool_Cursor',2),
  ('Future','2026-09','ai_tasks_tool_Claude Code',32),('Future','2026-09','ai_tasks_tool_GitHub Copilot',8),('Future','2026-09','ai_tasks_tool_Cursor',2),
  ('TeacherZone','2026-07','ai_tasks_tool_Claude Code',15),('TeacherZone','2026-07','ai_tasks_tool_GitHub Copilot',7),
  ('TeacherZone','2026-08','ai_tasks_tool_Claude Code',18),('TeacherZone','2026-08','ai_tasks_tool_GitHub Copilot',8),
  ('TeacherZone','2026-09','ai_tasks_tool_Claude Code',22),('TeacherZone','2026-09','ai_tasks_tool_GitHub Copilot',8)
)
INSERT INTO reporting.metric_counts
  (project, period_type, period_key, period_start, period_end, metric_key, value)
SELECT v.project, 'month', v.period_key, p.period_start, p.period_end, v.metric_key, v.value
FROM vals v JOIN periods p USING (period_key);

-- Manual inputs: monthly numbers (drive the Manual KPI panels) + quarterly
-- governance flags. 2026-Q3 is now a *complete* quarter (07/08/09 all seeded).
INSERT INTO reporting.manual_inputs (project, period_key, field, value, entered_by) VALUES
  ('Future','2026-06','total_engineers','18','seed'),
  ('Future','2026-06','coverage_ai','0.55','seed'),
  ('Future','2026-06','cost_baseline','45','seed'),
  ('Future','2026-06','cost_actual','33','seed'),
  ('Future','2026-07','total_engineers','19','seed'),
  ('Future','2026-07','coverage_ai','0.60','seed'),
  ('Future','2026-07','cost_baseline','45','seed'),
  ('Future','2026-07','cost_actual','30','seed'),
  ('Future','2026-08','total_engineers','19','seed'),
  ('Future','2026-08','coverage_ai','0.63','seed'),
  ('Future','2026-08','cost_baseline','45','seed'),
  ('Future','2026-08','cost_actual','28','seed'),
  ('Future','2026-09','total_engineers','20','seed'),
  ('Future','2026-09','coverage_ai','0.66','seed'),
  ('Future','2026-09','cost_baseline','45','seed'),
  ('Future','2026-09','cost_actual','26','seed'),
  ('Future','2026-Q3','g1_agents_md','Yes','auto-check'),
  ('Future','2026-Q3','a2_dashboard','Yes','auto-check'),
  ('Future','2026-Q3','g2_ai_policy','Yes','pm@seta'),
  ('Future','2026-Q3','g3_required_review','Yes','auto-check'),
  ('Future','2026-Q3','c3_scan_ci','Yes','auto-check'),
  ('Future','2026-Q3','b4_dora_improving','Yes','auto-check'),
  ('TeacherZone','2026-06','total_engineers','12','seed'),
  ('TeacherZone','2026-06','coverage_ai','0.40','seed'),
  ('TeacherZone','2026-06','cost_baseline','30','seed'),
  ('TeacherZone','2026-06','cost_actual','26','seed'),
  ('TeacherZone','2026-07','total_engineers','13','seed'),
  ('TeacherZone','2026-07','coverage_ai','0.48','seed'),
  ('TeacherZone','2026-07','cost_baseline','30','seed'),
  ('TeacherZone','2026-07','cost_actual','24','seed'),
  ('TeacherZone','2026-08','total_engineers','13','seed'),
  ('TeacherZone','2026-08','coverage_ai','0.50','seed'),
  ('TeacherZone','2026-08','cost_baseline','30','seed'),
  ('TeacherZone','2026-08','cost_actual','23','seed'),
  ('TeacherZone','2026-09','total_engineers','14','seed'),
  ('TeacherZone','2026-09','coverage_ai','0.53','seed'),
  ('TeacherZone','2026-09','cost_baseline','30','seed'),
  ('TeacherZone','2026-09','cost_actual','21','seed'),
  ('TeacherZone','2026-Q3','g1_agents_md','No','auto-check'),
  ('TeacherZone','2026-Q3','a2_dashboard','Yes','auto-check');

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
  ('Tiny-Sample','month','2026-07',DATE '2026-07-01',DATE '2026-07-31','total_prs',8),
  ('Tiny-Sample','month','2026-07',DATE '2026-07-01',DATE '2026-07-31','ai_prs',3),
  ('Tiny-Sample','month','2026-07',DATE '2026-07-01',DATE '2026-07-31','agent_prs_total',2);

-- A practice-change annotation for the trend charts.
INSERT INTO reporting.events (ts, project, title, tag) VALUES
  (TIMESTAMPTZ '2026-07-01 09:00+00', 'Future', 'Enabled branch protection', 'practice-change');
```

- [ ] **Step 2: Run `test_seed.py` to verify Plan 1's flagged gap is closed**

Run: `pytest tests/test_seed.py -v`
Expected: PASS (this was the one known failure after Plan 1 — it must be
green now).

- [ ] **Step 3: Run the full test suite**

Run: `pytest -v`
Expected: All PASS, no failures anywhere.

- [ ] **Step 4: Regenerate dashboards and smoke-test the local Grafana stack**

```bash
python3 infra/grafana/generate.py
docker compose -f infra/docker/compose.local.yml down
docker compose -f infra/docker/compose.local.yml up -d
```

Then open `http://localhost:3030/d/ai-sdlc-bod/ai-sdlc3a-portfolio-bod`
(admin/admin) and confirm: `$granularity` and `$project` filter dropdowns are
visible and change the score tables/trend charts when toggled; no panel
titled "Predictability" anywhere; the "Portfolio Maturity" heatmap still
renders for Future + TeacherZone (2 projects, ≥2 threshold). Also open
`http://localhost:3030/d/ai-sdlc-future/ai-sdlc3a-future` and confirm the
`$month` picker works and there's no "Sprint Predictability" panel.

- [ ] **Step 5: Commit**

```bash
git add infra/db/seed.sql
git commit -m "refactor: seed.sql is month-only with a complete Q3 per project

Closes the interim gap Plan 1 flagged — the narrowed period_type CHECK now
loads cleanly on a fresh DB. Four months (06-09) per project so 2026-Q3 is
a full quarter, exercising \$granularity=quarter with real rolled-up data."
```

---

## Self-Review

**Spec coverage:**
- ✅ Project dashboards: `$sprint` → `$month`, Predictability panel removed
  — Task 2.
- ✅ BOD dashboard: `$granularity` + `$project` added, Predictability column
  removed — Task 3.
- ✅ Exporter: "Monthly detail" sheet, `?months=` filter (per the spec's
  approved Exporter changes decision) — Task 4.
- ✅ `seed.sql` rewritten month-only, closing Plan 1's flagged gap — Task 5.
- ✅ Additional fix discovered during planning (not explicitly in the spec,
  but required for the spec's BOD filter goal to be implementable at all):
  `v_metrics_q` column gaps (`security_alerts`, `agent_cycle_h`, `deploys`
  naming) — Task 1.
- ⬜ Updating Future/TeacherZone's own CI workflows to call `--month` instead
  of `--sprint` is explicitly out of scope (spec's Rollout section — those
  workflows live in other repos).

**Placeholder scan:** no TBD/TODO; every step has literal file paths, literal
code/SQL, and literal `pytest`/`grep`/`docker compose` commands with stated
expected output.

**Type consistency:** `_bod_src()`/`_bod_union()`/`_proj()` (Task 3) are used
identically in every section of `build_bod_dashboard` — no section reverts to
the old `{RATIOS}`/`period_type = 'sprint'` pattern. `_BOD_COLS` is defined
once and referenced by both branches of every `_bod_union()` call — no drift
between the `v_metrics` and `v_metrics_q` column lists. `fill_workbook`'s
signature change (Task 4) is consistent between its test calls and
implementation — no test passes `sprint_rows` after the rewrite. `parse_month_range`/
`month_in_range` names match between `exporter/workbook.py`'s implementation,
`exporter/app.py`'s import, and both test files.
