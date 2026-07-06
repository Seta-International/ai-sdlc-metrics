# Grafana Dashboard Rebuild Implementation Plan (Plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the generated Grafana dashboards to the board's two-audience spec — a verdict-first BoD Executive View and an A–E Project Operational View with sample-size guards — and make maturity read from `reporting.v_levels` so Grafana and the workbook stop disagreeing (delete the in-Grafana `_maturity_case`).

**Architecture:** `infra/grafana/generate.py` stays a pure renderer over `projects.json`, emitting dashboard JSON (tested by running it to a tmp dir and asserting on the JSON). It already has reusable primitives — `_th`, `_stat`, `_spark`, `_panel`, `_layout`, `_score_table`, `_score_col`, `_project_colors`, `_dashboard`. This plan composes new spec-dicts and a few new helpers over those primitives; it does not restructure the file. Maturity comes from the Plan-1 `v_levels` view; the usage% fix comes from `v_metrics.usage_pct`.

**Tech Stack:** Python (stdlib json), Grafana schemaVersion 39 dashboard JSON, Postgres SQL in panel targets, pytest (runs the generator as a subprocess).

## Global Constraints

- The generator reads DB views only; every panel's `rawSql` must reference `reporting.` (a test enforces this). Use the module constants: change `RATIOS = "reporting.v_metrics"`, add `LEVELS = "reporting.v_levels"`; keep `WIDE`, `MANUAL`, `COUNTS`.
- Maturity is `reporting.v_levels` (`lvl_a..lvl_e`, `overall`, keyed by `project` + `quarter`), NEVER computed in Grafana SQL. Delete `_maturity_case` and every call to it.
- Usage% is `v_metrics.usage_pct` (team_size-based, capped), NOT the legacy `usage_rate_pct`.
- Every non-row panel MUST carry a `description` (a test enforces this).
- `has_production: false` (Future) must still hide Deploy/CFR panels and label lead time "Merge Lead Time …" (existing tests enforce this — keep them green).
- Sample-size guard (board P5): a percentage panel shows its `n` and renders NULL (grey) when `n < 20`. Use the `n_min = 20` value inline (matches the seeded `thresholds` row); the guard is applied in SQL via `CASE WHEN <n> < 20 THEN NULL ELSE <pct> END` and the `n` is surfaced in the panel (title suffix or a second series/column).
- Portfolio heatmap renders only with ≥ 2 projects (`len(cfgs) >= 2`); with one project it is omitted (the board must not see a 1-row "portfolio").
- Thresholds stay in the `TH` dict in code (single source there); do NOT introduce the DB-table "Config from query results" transformation in this plan (deferred).
- Timezone `Asia/Ho_Chi_Minh`, default time `now-30d`/`now+7d`, schemaVersion 39 — unchanged (`_dashboard` already sets these).

## Quarter-join helper (used by every maturity read)

`v_levels` is keyed by quarter; dashboards show the latest quarter per project. Add one helper the maturity panels reuse:

```python
LEVELS = "reporting.v_levels"

def _latest_level(project: str, col: str) -> str:
    """A single v_levels column for the project's most recent quarter."""
    return (f"SELECT {col} FROM {LEVELS} WHERE project = '{project}' "
            "ORDER BY quarter DESC LIMIT 1")
```

For the BoD (all projects, one row each) use a `DISTINCT ON`:

```python
def _levels_latest_all() -> str:
    return (f"SELECT DISTINCT ON (project) project, lvl_a, lvl_b, lvl_c, lvl_d, "
            f"lvl_e, overall FROM {LEVELS} ORDER BY project, quarter DESC")
```

---

## Task 1: Repoint the generator to `v_metrics`/`v_levels` + fix usage%

**Files:**
- Modify: `infra/grafana/generate.py`
- Test: `tests/test_dashboards.py`

**Interfaces:**
- Produces: `RATIOS = "reporting.v_metrics"`, `LEVELS = "reporting.v_levels"`. All existing panels keep working (v_metrics is a superset of the old metrics_ratios). Usage panels read `usage_pct`.

- [ ] **Step 1: Update the failing test**

In `tests/test_dashboards.py`, change `test_project_dashboard_is_pinned_and_reads_views` (line 30) from `assert "metrics_ratios" in raw` to:

```python
    assert "reporting.v_metrics" in raw
    assert "metrics_ratios" not in raw
```

Add a new test:

```python
def test_usage_uses_fixed_usage_pct(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    sql = json.dumps(future)
    assert "usage_pct" in sql
    assert "usage_rate_pct" not in sql   # legacy proxy retired from the UI
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_dashboards.py -k "reads_views or usage_uses_fixed" -v`
Expected: FAIL (still emits `metrics_ratios` / `usage_rate_pct`).

- [ ] **Step 3: Repoint constants and usage columns**

In `infra/grafana/generate.py`:
- Line 25: `RATIOS = "reporting.v_metrics"`.
- After line 26, add `LEVELS = "reporting.v_levels"`.
- Replace every `usage_rate_pct` with `usage_pct`: the Adoption "Engineer Usage Rate" stat (line ~387), the BoD scorecard "Usage %" column (line ~659), and the `_maturity_case` `adopted` clause (will be removed in Task 2 anyway).
- In the Monthly-Record SQL (line ~454) and the BoD `usage_by_project` SQL (line ~733), replace the hand-rolled `100 * ai_users_weekly_avg / NULLIF(COALESCE(e.value::numeric, w.engineers_active),0)` with `w.usage_pct` (the view now computes it correctly). Keep the `Team Size` column (`e.value::numeric`).

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_dashboards.py -v`
Expected: all PASS (existing + the two changed/new). If `test_config_literals_embedded_in_sql` fails on the gate literals, that's Task 2's concern — if it fails now, leave it and note it; otherwise proceed.

- [ ] **Step 5: Commit**

```bash
git add infra/grafana/generate.py tests/test_dashboards.py
git commit -m "feat: point dashboards at v_metrics/v_levels; use fixed usage_pct"
```

---

## Task 2: Delete `_maturity_case`; maturity reads `v_levels`

**Files:**
- Modify: `infra/grafana/generate.py`
- Test: `tests/test_dashboards.py`

**Interfaces:**
- Consumes: `_latest_level`, `_levels_latest_all` (add these per the header section).
- Produces: the project "Overall Maturity" stat reads `v_levels.overall`; the BoD scorecard "Level" column reads `v_levels.overall`. No SQL `CASE WHEN ... THEN 4` maturity ladder anywhere.

- [ ] **Step 1: Update the failing test**

Replace `test_config_literals_embedded_in_sql` (asserts the gate literals `>= 80`/`>= 50`, which only existed inside `_maturity_case`) with:

```python
def test_maturity_reads_v_levels_not_computed(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    body = json.dumps(future) + json.dumps(bod)
    assert "reporting.v_levels" in body
    # the blended-rate literal still embeds (ROI panel), proving config still flows
    assert "ai_time_saved_h * 12" in json.dumps(future)
    # no in-Grafana maturity ladder
    assert "THEN 4 " not in body and "THEN 3 " not in body
```

Also update `test_bod_has_roi_and_stage` — the BoD `Stage` column is being removed here (portfolio levels arrive in Task 6's heatmap), so drop the `assert "\"Stage\"" in body` line but KEEP the `"AI Net $"` and `ai_tasks_tool_` assertions. Rename the test to `test_bod_has_roi_and_tools` for accuracy.

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_dashboards.py -k "maturity_reads or bod_has_roi" -v`
Expected: FAIL.

- [ ] **Step 3: Remove `_maturity_case`, wire `v_levels`**

In `infra/grafana/generate.py`:
- Add `_latest_level` and `_levels_latest_all` (from the header section) near the other helpers.
- Delete the whole `_maturity_case` function (lines ~105-118).
- In `build_project_dashboard`, replace the "Maturity Stage (1-4)" stat (lines ~438-445) with an Overall-Maturity stat reading the level view:

```python
    maturity = [
        {"kind": "stat", "title": "Overall Maturity (1-5)",
         "sql": _latest_level(project, "overall"),
         "format": "table", "unit": "none", "w": 6, "h": 8,
         "th": _th(CRIT, (2, WARN), (3, WARN), (4, GOOD)),
         "desc": ("A-E gated model: OVERALL = MIN(E-Governance, C-Quality, "
                  "round(avg(A..E))). Computed in reporting.v_levels, identical "
                  "to the Excel workbook.")},
        *agent,
    ]
```

- In `build_bod_dashboard`, delete the `stage_case` definition (lines ~637-639). In the "D. Agent" scorecard table, replace the `f"{stage_case} AS \"Stage\""` column and its `_score_col("Stage", ...)` override with a join-free level lookup. Simplest: add a separate one-row-per-project **Level** via a small dedicated table panel fed by `_levels_latest_all()` (see Task 6 heatmap — the D-table's Stage column is replaced there). For THIS task, just drop the `Stage` column and its override from the D-table (the heatmap in Task 6 carries levels); keep the D-table's other columns.

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_dashboards.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/grafana/generate.py tests/test_dashboards.py
git commit -m "feat: maturity reads v_levels; delete in-Grafana _maturity_case ladder"
```

---

## Task 3: Project Operational View — Data Quality Strip (R0)

**Files:**
- Modify: `infra/grafana/generate.py`
- Test: `tests/test_dashboards.py`

**Interfaces:**
- Produces: a "Data Quality" row at the TOP of every project dashboard with small tiles: n PRs, n agent tasks, months of data, usage-guard status, ETL freshness.

- [ ] **Step 1: Write the failing test**

```python
def test_project_has_data_quality_strip_first(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    rows = [p["title"] for p in future["panels"] if p["type"] == "row"]
    assert rows[0].startswith("Data Quality")
    titles = [p.get("title", "") for p in future["panels"]]
    assert "PRs (n)" in titles and "Agent tasks (n)" in titles
    assert any("Freshness" in t for t in titles)
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_dashboards.py::test_project_has_data_quality_strip_first -v`
Expected: FAIL.

- [ ] **Step 3: Add the strip and prepend it**

In `build_project_dashboard`, before the `story_sections` dict, build the strip (uses the selected sprint's row and the freshest collected_at):

```python
    dq = [
        _stat(project, "PRs (n)", "n_pr", w=4,
              desc="Merged PRs in the selected sprint — the sample size behind "
                   "every PR-based %. Below 20, percentages are greyed."),
        _stat(project, "Agent tasks (n)", "n_agent_pr", w=4,
              desc="Agent PRs in the sprint — sample size for the Agent section."),
        {"kind": "stat", "title": "Months of data",
         "sql": (f"SELECT count(*) FROM {RATIOS} WHERE {p} "
                 "AND period_type = 'month'"),
         "unit": "none", "w": 4, "graph": "none",
         "desc": "How many monthly rows exist — trend/ROI need ≥3."},
        _stat(project, "Usage %", "usage_pct", "percent", th["usage"], w=4,
              desc="AI users ÷ team size (capped at 100%). >100% raw input "
                   "raises a data-quality alert instead of rendering."),
        {"kind": "stat", "title": "ETL Freshness",
         "sql": (f"SELECT max(collected_at) FROM {COUNTS} WHERE {p}"),
         "format": "table", "unit": "dateTimeFromNow", "w": 8, "graph": "none",
         "desc": "When the collector last wrote data for this project."},
    ]
```

Then prepend the strip as the first section:

```python
    sections = [("Data Quality — read this first", dq)]
    sections += [story_sections[key] for key in cfg["sections"] if key in story_sections]
    sections.append(("Monthly Record", monthly))
```

(Replace the existing `sections = [...]` assembly at lines ~498-499 with the above.)

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_dashboards.py -v`
Expected: all PASS (the steering row is no longer `rows[0]` — update `test_sections_config_controls_rows` if it asserts `rows[0]` starts with "Sprint Steering": change it to `rows[1]`).

- [ ] **Step 5: Commit**

```bash
git add infra/grafana/generate.py tests/test_dashboards.py
git commit -m "feat: project Data Quality Strip (n, months, usage guard, freshness)"
```

---

## Task 4: Sample-size guard on percentage stats (P5)

**Files:**
- Modify: `infra/grafana/generate.py`
- Test: `tests/test_dashboards.py`

**Interfaces:**
- Produces: a `_guarded_pct(project, col, n_col, ...)` helper whose SQL suppresses the % when `n_col < 20`, and appends the `n` to the panel title. Applied to AI PR %, AI PR Review %, Autonomy %.

- [ ] **Step 1: Write the failing test**

```python
def test_pct_stats_are_n_guarded(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    sql = json.dumps(future)
    # AI PR % is suppressed below n=20 on n_pr
    assert "< 20 THEN NULL" in sql
    # the n is surfaced in a guarded panel's SQL
    assert "n_pr" in sql
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_dashboards.py::test_pct_stats_are_n_guarded -v`
Expected: FAIL.

- [ ] **Step 3: Add `_guarded_pct` and apply it**

Add near `_stat`:

```python
def _guarded_pct(project: str, title: str, pct_col: str, n_col: str,
                 th: dict | None = None, w: int = 6, h: int = 4,
                 desc: str = "") -> dict:
    """A pct stat greyed to NULL when its sample size (n_col) < 20 (board P5)."""
    anchor = (f"(SELECT period_start FROM {RATIOS} WHERE project = '{project}' "
              "AND period_type = 'sprint' AND period_key = '$sprint')")
    guarded = f"CASE WHEN {n_col} < 20 THEN NULL ELSE {pct_col} END"
    sql = (f"SELECT period_start AS time, {guarded} AS value FROM {RATIOS} "
           f"WHERE project = '{project}' AND period_type = 'sprint' "
           f"AND period_start <= {anchor} ORDER BY period_start")
    spec = {"kind": "stat", "title": title, "sql": sql, "format": "time_series",
            "unit": "percent", "w": w, "h": h,
            "desc": desc + " Greyed when n<20 (too small to trust)."}
    if th:
        spec["th"] = th
    return spec
```

In `build_project_dashboard`, swap the plain `_stat` for `_guarded_pct` on the three highest-stakes percentages:
- Adoption "AI PR %": `_guarded_pct(project, "AI PR %", "ai_pr_pct", "n_pr", TH["ai_share"], w=4, desc="Merged PRs labeled ai-assisted. Framework: ≥30% = L3, >50% = L4.")`
- cause_effect "AI PR Review %": `_guarded_pct(project, "AI PR Review %", "ai_pr_review_pct", "n_ai_pr", TH["review"], w=4, h=4, desc="Share of AI PRs with a human approval. Gate for stages 3-4; target ~100%.")`
- agent "Autonomy %": `_guarded_pct(project, "Autonomy %", "autonomy_pct", "n_agent_pr", TH["autonomy"], w=6, h=8, desc="Agent PRs with zero human commits. L4 ≥30%, L5 ≥60%.")`

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_dashboards.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/grafana/generate.py tests/test_dashboards.py
git commit -m "feat: sample-size guard (n<20 -> grey) on key percentage panels"
```

---

## Task 5: Project Operational View — Level Summary (R6)

**Files:**
- Modify: `infra/grafana/generate.py`
- Test: `tests/test_dashboards.py`

**Interfaces:**
- Produces: a "Maturity — A–E Levels" table at the end of the project dashboard reading `v_levels` (lvl_a..e + overall) for the latest quarter, with the MIN formula in the description.

- [ ] **Step 1: Write the failing test**

```python
def test_project_has_level_summary(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    titles = [p.get("title", "") for p in future["panels"]]
    assert any("A-E Levels" in t or "A–E Levels" in t for t in titles)
    sql = json.dumps(future)
    assert "lvl_a" in sql and "overall" in sql
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_dashboards.py::test_project_has_level_summary -v`
Expected: FAIL.

- [ ] **Step 3: Add the Level Summary section**

In `build_project_dashboard`, add a section (before or after Monthly Record):

```python
    level_summary = [
        {"kind": "table", "title": "Maturity — A–E Levels (latest quarter)",
         "sql": (f"SELECT quarter AS \"Quarter\", lvl_a AS \"A Adoption\", "
                 "lvl_b AS \"B Delivery\", lvl_c AS \"C Quality ★\", "
                 "lvl_d AS \"D Agent\", lvl_e AS \"E Governance ★\", "
                 f"overall AS \"OVERALL\" FROM {LEVELS} WHERE project = '{project}' "
                 "ORDER BY quarter DESC LIMIT 1"),
         "unit": "none", "w": 24, "h": 4,
         "overrides": [_score_col(c, _th(CRIT, (2, WARN), (3, WARN), (4, GOOD)))
                       for c in ("A Adoption", "B Delivery", "C Quality ★",
                                 "D Agent", "E Governance ★", "OVERALL")],
         "desc": ("OVERALL = MIN(E-Governance, C-Quality, round(avg(A..E))). "
                  "C and E are gates: a low governance or quality level caps the "
                  "whole score. Source: reporting.v_levels (≡ Excel workbook).")},
    ]
    sections.append(("Maturity — A–E Level Summary", level_summary))
```

(Append after the `sections.append(("Monthly Record", monthly))` line.)

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_dashboards.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/grafana/generate.py tests/test_dashboards.py
git commit -m "feat: project A-E Level Summary from v_levels with MIN-gate caption"
```

---

## Task 6: BoD Executive View — Verdict (R0) + Portfolio heatmap + ASK (R3)

**Files:**
- Modify: `infra/grafana/generate.py`
- Test: `tests/test_dashboards.py`

**Interfaces:**
- Produces: a verdict text panel first on the BoD; an A–E heatmap table (one row per project) rendered only when `len(cfgs) >= 2`; an ASK text panel.

- [ ] **Step 1: Write the failing test**

```python
def test_bod_has_verdict_and_heatmap(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    rows = [p["title"] for p in bod["panels"] if p["type"] == "row"]
    titles = [p.get("title", "") for p in bod["panels"]]
    assert any("Verdict" in t for t in titles)
    assert any("Portfolio Maturity" in t for t in titles)   # heatmap (2 projects in config)
    body = json.dumps(bod)
    assert "reporting.v_levels" in body
    assert any("Ask" in t or "ASK" in t for t in titles)
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_dashboards.py::test_bod_has_verdict_and_heatmap -v`
Expected: FAIL.

- [ ] **Step 3: Build verdict, heatmap, ASK**

In `build_bod_dashboard`, add a verdict panel (data-generated sentence). Put it in its own first section:

```python
    verdict_sql = (
        "WITH lv AS (" + _levels_latest_all() + "), "
        "agg AS (SELECT min(lvl_c) mc, min(lvl_e) me, min(overall) mo, "
        "count(*) n FROM lv) "
        "SELECT CASE "
        "WHEN me <= 1 OR mc <= 1 THEN "
        "'🔴 A gate is red (governance/quality at L1) — stabilise before scaling AI.' "
        "WHEN mo >= 3 THEN "
        "'🟢 Portfolio maturing — median discipline holds; keep investing.' "
        "ELSE '🟡 Building the baseline — measurement in place, levels still forming.' "
        "END AS verdict FROM agg")
    verdict = [
        {"kind": "stat", "title": "Verdict", "sql": verdict_sql,
         "format": "table", "unit": "none", "w": 24, "h": 4,
         "custom": {}, "color": DEEMPH,
         "desc": ("One-line conclusion generated from reporting.v_levels: red if "
                  "any project's C-Quality or E-Governance gate is at L1, green if "
                  "every project is L3+, amber while the baseline forms.")},
    ]
```

Make the verdict a text-forward Stat: set its options to text mode by adding `"graph": "none"` and rely on `colorMode value`; the sentence is the value.

Add the heatmap (only ≥2 projects) and ASK:

```python
    heatmap = [
        {"kind": "table", "title": "Portfolio Maturity — A–E Heatmap",
         "sql": (f"SELECT project AS \"Project\", lvl_a AS \"A\", lvl_b AS \"B\", "
                 "lvl_c AS \"C ★\", lvl_d AS \"D\", lvl_e AS \"E ★\", "
                 "overall AS \"OVERALL\" FROM (" + _levels_latest_all() + ") x "
                 "ORDER BY overall, project"),
         "unit": "none", "w": 24, "h": 8,
         "overrides": [_score_col(c, _th(CRIT, (2, WARN), (3, WARN), (4, GOOD)))
                       for c in ("A", "B", "C ★", "D", "E ★", "OVERALL")],
         "desc": ("Each project's A-E levels for its latest quarter. C and E are "
                  "gates (★). Click a project to open its dashboard. "
                  "OVERALL = MIN(E, C, round(avg)).")},
    ]
    ask = [
        {"kind": "text", "title": "ASK — decisions for the board this quarter",
         "sql": "SELECT 1", "unit": "none", "w": 24, "h": 4,
         "desc": "Board decisions requested this quarter. Edit per meeting.",
         "content": ("### Requested decisions\\n"
                     "- (update each quarter) Approve/defer expanding AI to project X\\n"
                     "- (update) Renew/adjust tool licences per the tool-mix panel\\n"
                     "- (update) Fund the governance gap flagged in the heatmap")},
    ]
```

Note: the `text` panel kind needs handling — in `_panel`, a `text` panel uses `options.content`, not a target. Add a minimal branch: in `_options`, `if kind == "text": return {"mode": "markdown", "content": spec.get("content", "")}`; and in `_panel`, skip `targets` for `text` panels (guard `if spec["kind"] != "text"`). Keep the change small and localized.

Assemble the BoD sections with the heatmap gated on project count:

```python
    sections = [
        ("Verdict", verdict),
        ("Is AI paying off? — Portfolio", pulse),
        ("Project Scorecard — Latest Sprint (A·B·C·D, mirrors Excel)", scorecard),
    ]
    if len(cfgs) >= 2:
        sections.append(("Portfolio Maturity", heatmap))
    sections += [
        ("Delivery Health & Direction", direction),
        ("Where to Invest / Train", value),
        ("Ask", ask),
    ]
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_dashboards.py -v`
Expected: all PASS (`test_every_panel_has_a_description` must stay green — the text/verdict panels have descriptions).

- [ ] **Step 5: Commit**

```bash
git add infra/grafana/generate.py tests/test_dashboards.py
git commit -m "feat: BoD verdict panel + A-E portfolio heatmap (>=2 projects) + ASK"
```

---

## Task 7: BoD Evidence delta — AI vs non-AI (R2)

**Files:**
- Modify: `infra/grafana/generate.py`
- Test: `tests/test_dashboards.py`

**Interfaces:**
- Produces: a BoD table comparing AI vs non-AI lead time and PR size as pre-computed deltas with the sample size, in the scorecard area.

- [ ] **Step 1: Write the failing test**

```python
def test_bod_has_evidence_delta(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    titles = [p.get("title", "") for p in bod["panels"]]
    assert any("AI vs non-AI" in t for t in titles)
    sql = json.dumps(bod)
    assert "lead_time_ai_h" in sql and "lead_time_nonai_h" in sql
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_dashboards.py::test_bod_has_evidence_delta -v`
Expected: FAIL.

- [ ] **Step 3: Add the delta table**

In `build_bod_dashboard`, add a per-project AI-vs-non-AI table (latest sprint each, using the existing `latest` clause):

```python
    evidence = [
        {"kind": "table", "title": "Evidence — AI vs non-AI (latest sprint)",
         "sql": ("SELECT project AS \"Project\", "
                 "round(lead_time_ai_h, 1) AS \"Lead AI h\", "
                 "round(lead_time_nonai_h, 1) AS \"Lead non-AI h\", "
                 "round(100 * (lead_time_nonai_h - lead_time_ai_h) "
                 "/ NULLIF(lead_time_nonai_h, 0), 0) AS \"Lead Δ%\", "
                 "round(pr_size_ai, 0) AS \"PR size AI\", "
                 "round(pr_size_nonai, 0) AS \"PR size non-AI\", "
                 "n_ai_pr AS \"n(AI PR)\" "
                 f"{latest} ORDER BY project"),
         "unit": "none", "w": 24, "h": 6,
         "desc": ("AI vs non-AI, as pre-computed deltas with sample size. A "
                  "slower AI lead time is a legitimate finding (verification "
                  "overhead), not an error — read it with the quality columns. "
                  "n(AI PR) is the sample behind the AI figures.")},
    ]
```

Insert it into the BoD `sections` after the scorecard (and before/around the heatmap):

```python
        ("Evidence — AI vs non-AI", evidence),
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_dashboards.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/grafana/generate.py tests/test_dashboards.py
git commit -m "feat: BoD Evidence delta table — AI vs non-AI with sample size"
```

---

## Task 8: full suite + local Grafana visual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite**

Run: `pytest -q`
Expected: all pass.

- [ ] **Step 2: Regenerate dashboards and bring up the local stack**

```bash
python3 infra/grafana/generate.py
docker compose -f infra/docker/compose.local.yml up -d --build
sleep 12
```

- [ ] **Step 3: Eyeball each board (the board's QA checklist)**

Open `http://localhost:3030` (admin/admin) and confirm on the seeded data:
- BoD: a **Verdict** sentence renders; the **A–E heatmap** shows Future/TeacherZone/Gated-Demo with Gated-Demo OVERALL red (1); no panel shows a % > 100; the Evidence table shows deltas with n.
- Future project board: the **Data Quality Strip** is first; **Usage %** reads ~41–53% (not 200%); the **A–E Level Summary** shows the MIN-gated overall; guarded % panels grey out where n<20 (the agent section on low-n sprints).
- Confirm no empty panels render as blank numbers (sentinels/greys instead).

Record anything off; fix in the generator (with a test) before declaring done.

- [ ] **Step 4: Tear down + commit any fixes**

```bash
docker compose -f infra/docker/compose.local.yml down
git add -A && git commit -m "chore: dashboard rebuild local visual verification" || echo "nothing to commit"
```

---

## Self-Review

- **Spec coverage (design Sections 3–4):** verdict-first BoD ✓ (Task 6); 3 questions ≈ pulse tiles (kept) + verdict; evidence delta ✓ (Task 7); portfolio heatmap gated ≥2 ✓ (Task 6); ASK ✓ (Task 6); data-quality strip ✓ (Task 3); A–E operational sections — the existing story sections remain, with the Level Summary ✓ (Task 5) tying them to the model; n-guards ✓ (Task 4); usage% fix ✓ (Task 1); maturity from v_levels, `_maturity_case` deleted ✓ (Task 2).
- **Explicitly deferred (stated in Global Constraints):** DB-table "Config from query results" thresholds (TH stays in code — still single-source); repointing the exporter's Excel formulas at v_levels; a fuller A–E-sectioned operational layout (kept the existing story sections + Level Summary rather than renaming every section, to avoid churn the board didn't ask for). Log these for a follow-up.
- **Placeholder scan:** none — every step has concrete code.
- **Type consistency:** `_latest_level(project, col)` and `_levels_latest_all()` return SQL strings; `_guarded_pct(...)` returns a spec dict like `_stat`; the `text` panel branch in `_panel`/`_options` is the only structural change to the primitives.
- **Test-green invariants:** the `has_production` tests, the description test, and the reporting-schema test must stay green through every task.
