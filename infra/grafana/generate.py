#!/usr/bin/env python3
"""
Generate Grafana dashboards from projects.json: one pinned dashboard per
project (folder = project name) plus one BOD portfolio dashboard.

  python infra/grafana/generate.py            # writes infra/grafana/dashboards/
  python infra/grafana/generate.py --out DIR  # custom output (tests)

Design notes (dataviz method):
- Color is semantic only. Status colors mark health against the framework's
  targets; project identity uses fixed categorical slots (color follows the
  project, never its rank); everything else stays in text ink.
- The categorical palette below is the dataviz reference palette's dark steps,
  validated against Grafana's dark surface #181b1f (validate_palette.js: all
  checks pass; slots 4+ rely on the legend as secondary encoding).
- Stat tiles carry sparklines (history up to the selected sprint) so "current
  value + direction" is one glance.
"""
import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
DS = {"type": "postgres", "uid": "reporting-postgres"}
RATIOS = "reporting.v_metrics"
WIDE = "reporting.metrics_wide"
MANUAL = "reporting.manual_inputs"
COUNTS = "reporting.metric_counts"
LEVELS = "reporting.v_levels"

# Fixed categorical slots for project identity (projects.json order).
PALETTE = ["#3987e5", "#199e70", "#c98500", "#008300",
           "#9085e9", "#e66767", "#d55181", "#d95926"]
ACCENT = "#3987e5"    # single-series emphasis
DEEMPH = "#898781"    # de-emphasis gray (context series)
BLUE_MID, BLUE_SOFT = "#3987e5", "#86b6ef"  # maturity intensity (not alarm)
GOOD, WARN, SERIOUS, CRIT = "#0ca30c", "#fab219", "#ec835a", "#d03b3b"


def _th(base: str, *steps: tuple[float, str]) -> dict:
    return {"mode": "absolute",
            "steps": [{"color": base, "value": None},
                      *({"color": c, "value": v} for v, c in steps)]}


_TEXT_TH = _th("text")

# Health thresholds from the framework doc + workbook «10. Thresholds»:
# AI PR % L3 >= 30 / L4 > 50; usage target >= 80%; CFR <= 15%; review = 100%;
# autonomy L4 >= 30 / L5 >= 60. Hour/count cutoffs are stated team defaults.
TH = {
    "ai_share":       _th(SERIOUS, (30, WARN), (50, GOOD)),
    "usage":          _th(SERIOUS, (50, WARN), (80, GOOD)),
    "lead":           _th(GOOD, (48, WARN), (120, CRIT)),
    "deploy_freq":    _th(WARN, (1, GOOD)),
    "cfr":            _th(GOOD, (15, WARN), (30, CRIT)),
    "mttr":           _th(GOOD, (8, WARN), (24, CRIT)),
    "review":         _th(CRIT, (80, WARN), (99.5, GOOD)),
    "rework":         _th(GOOD, (10, WARN), (20, CRIT)),
    "alerts":         _th(GOOD, (1, WARN), (4, CRIT)),
    "predictability": _th(SERIOUS, (60, WARN), (80, GOOD)),
    "incidents":      _th(GOOD, (1, WARN), (3, CRIT)),
    "autonomy":       _th("text", (30, BLUE_SOFT), (60, BLUE_MID)),
}


DEFAULTS = {
    "blended_hourly_rate": 12,
    "has_production": True,
    "sections": ["steering", "roi", "cause_effect", "dora", "maturity", "adoption"],
    "thresholds": {"lead_time_h": [72, 168], "predictability_pct": [80, 60]},
    "maturity": {"adopted_breadth_pct": 50, "adopted_ai_pr_pct": 30,
                 "agentic_pr_pct": 10, "autonomous_share_pct": 50,
                 "gate_review_pct": 80, "gate_test_pct": 50},
}


def _merge(base: dict, override: dict) -> dict:
    out = dict(base)
    for k, v in override.items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def load_config() -> tuple[str, list[dict]]:
    raw = json.loads((HERE / "projects.json").read_text())
    defaults = _merge(DEFAULTS, raw.get("defaults", {}))
    cfgs = []
    for p in raw["projects"]:
        cfg = _merge(defaults, p.get("overrides", {}))
        cfg.update({k: p[k] for k in ("name", "pm_login", "pm_email") if k in p})
        cfgs.append(cfg)
    return raw.get("exporter_url", "http://localhost:3031"), cfgs


def _cfg_th(cfg: dict) -> dict:
    t = cfg["thresholds"]
    lead_w, lead_c = t["lead_time_h"]
    pred_g, pred_w = t["predictability_pct"]
    th = dict(TH)
    th["lead"] = _th(GOOD, (lead_w, WARN), (lead_c, CRIT))
    th["predictability"] = _th(SERIOUS, (pred_w, WARN), (pred_g, GOOD))
    return th


def _latest_level(project: str, col: str) -> str:
    """Single reporting.v_levels column for a project's latest quarter."""
    return (f"SELECT {col} FROM {LEVELS} WHERE project = '{project}' "
            "ORDER BY quarter DESC LIMIT 1")


def _levels_latest_all() -> str:
    """One row per project: its most recent quarter's levels."""
    return (f"SELECT DISTINCT ON (project) project, quarter, lvl_a, lvl_b, "
            f"lvl_c, lvl_d, lvl_e, overall FROM {LEVELS} "
            "ORDER BY project, quarter DESC")


def _target(sql: str, fmt: str) -> dict:
    return {"datasource": DS, "format": fmt, "rawQuery": True,
            "rawSql": sql, "refId": "A"}


def _options(kind: str, spec: dict) -> dict:
    if kind == "text":
        return {"mode": "markdown", "content": spec.get("content", "")}
    if kind == "stat":
        # A text-valued stat (e.g. the Verdict sentence) has no numeric field,
        # so the default fields:"" (numeric only) reduces to nothing → "No data".
        # Point the reducer at all fields and render the string value.
        text_stat = spec.get("text_stat", False)
        return {"reduceOptions": {"calcs": [spec.get("reduce", "lastNotNull")],
                                  "fields": "/.*/" if text_stat else "", "values": False},
                "graphMode": "none" if text_stat else spec.get("graph", "area"),
                "colorMode": "value", "justifyMode": "auto",
                "textMode": "value" if text_stat else "auto"}
    if kind == "timeseries":
        # Table legend with Mean/Max/Last per series — doubles as the
        # non-color table view and gives each trend a numeric summary.
        return {"legend": {"displayMode": "table", "placement": "bottom",
                           "calcs": ["mean", "max", "lastNotNull"]},
                "tooltip": {"mode": "multi", "sort": "desc"}}
    if kind == "barchart":
        # xField must name the category column explicitly — auto-detection can
        # fail under the scenes engine and the panel then renders blank
        # (grafana/grafana#96821). Category is always the first (string) column.
        opts = {"orientation": "horizontal", "xField": spec["xfield"],
                "showValue": "always", "stacking": "none",
                "groupWidth": 0.7, "barWidth": 0.9, "fullHighlight": False,
                "tooltip": {"mode": "single", "sort": "none"},
                "legend": {"showLegend": False, "displayMode": "hidden",
                           "placement": "bottom", "calcs": []}}
        return opts
    if kind == "table":
        # Compact rows so a long list of projects stays dense; per-column
        # header filter/sort for quick triage across many projects.
        return {"showHeader": True, "cellHeight": "sm"}
    return {}


def _panel(spec: dict, x: int, y: int) -> dict:
    defaults: dict = {"unit": spec.get("unit", "none"),
                      "thresholds": spec.get("th", _TEXT_TH)}
    if "color" in spec:
        defaults["color"] = {"mode": "fixed", "fixedColor": spec["color"]}
    elif "th" in spec:
        defaults["color"] = {"mode": "thresholds"}
    if spec["kind"] == "timeseries":
        # A one-sprint history (every project's first weeks) draws no line;
        # always render the points so a single sprint is still visible.
        # Area fill + gradient gives the filled-line look; low opacity keeps
        # overlapping multi-project series readable, linear stays honest.
        defaults["custom"] = {"showPoints": "always", "pointSize": 6,
                              "lineWidth": 2, "fillOpacity": 14,
                              "gradientMode": "opacity", "spanNulls": True,
                              **spec.get("custom", {})}
    elif spec["kind"] == "table":
        # Per-column header filter + sort so a long project list is triageable.
        defaults["custom"] = {"filterable": True, **spec.get("custom", {})}
    elif spec["kind"] == "barchart":
        # Without an explicit custom block the bars render at zero fill/width
        # (invisible). These are Grafana's own barchart defaults.
        defaults["custom"] = {"lineWidth": 1, "fillOpacity": 80,
                              "gradientMode": "none", "axisPlacement": "auto",
                              "axisColorMode": "text", "axisBorderShow": False,
                              "scaleDistribution": {"type": "linear"},
                              "axisCenteredZero": False,
                              "hideFrom": {"tooltip": False, "viz": False, "legend": False},
                              "thresholdsStyle": {"mode": "off"},
                              **spec.get("custom", {})}
    elif "custom" in spec:
        defaults["custom"] = spec["custom"]
    panel = {
        "type": spec["kind"], "title": spec["title"], "datasource": DS,
        "gridPos": {"x": x, "y": y, "w": spec.get("w", 6), "h": spec.get("h", 4)},
        "fieldConfig": {"defaults": defaults, "overrides": spec.get("overrides", [])},
        "options": _options(spec["kind"], spec),
    }
    if spec["kind"] != "text":
        panel["targets"] = [_target(spec["sql"], spec.get("format", "table"))]
    if "desc" in spec:
        panel["description"] = spec["desc"]
    return panel


def _row(title: str, y: int) -> dict:
    return {"type": "row", "title": title, "collapsed": False,
            "gridPos": {"x": 0, "y": y, "w": 24, "h": 1}, "panels": []}


def _layout(sections: list[tuple[str, list[dict]]]) -> list[dict]:
    """Pack panels left-to-right into 24-wide lines; line height = tallest panel."""
    panels, y = [], 0
    for row_title, specs in sections:
        panels.append(_row(row_title, y))
        y += 1
        x = line_h = 0
        for spec in specs:
            w = spec.get("w", 6)
            if x + w > 24:
                y += line_h
                x = line_h = 0
            panels.append(_panel(spec, x, y))
            x += w
            line_h = max(line_h, spec.get("h", 4))
        y += line_h
    return panels


def _dashboard(uid: str, title: str, panels: list[dict],
               templating: list[dict], links: list[dict]) -> dict:
    return {
        "uid": uid, "title": title, "schemaVersion": 39, "version": 1,
        "editable": True, "timezone": "Asia/Ho_Chi_Minh",  # UTC+7 (Vietnam)
        # Default to a focused recent window (~2 sprints) with a little forward
        # headroom so the current sprint's start point sits inside the range;
        # users can zoom out for older history.
        "time": {"from": "now-30d", "to": "now+7d"},
        "templating": {"list": templating},
        "links": links,
        "panels": panels,
    }


def _sprint_var(project: str) -> dict:
    return {
        "name": "sprint", "type": "query", "datasource": DS,
        "refresh": 2, "sort": 0,
        "query": (f"SELECT period_key FROM {RATIOS} WHERE project = '{project}' "
                  "AND period_type = 'sprint' ORDER BY period_start DESC"),
        "current": {}, "options": [],
    }


# ---------------------------------------------------------------- project ---

def _spark(project: str, col: str) -> str:
    """Value at the selected sprint + history sparkline up to it."""
    anchor = (f"(SELECT period_start FROM {RATIOS} WHERE project = '{project}' "
              "AND period_type = 'sprint' AND period_key = '$sprint')")
    return (f"SELECT period_start AS time, {col} AS value FROM {RATIOS} "
            f"WHERE project = '{project}' AND period_type = 'sprint' "
            f"AND period_start <= {anchor} ORDER BY period_start")


def _stat(project: str, title: str, col: str, unit: str = "none",
          th: dict | None = None, w: int = 6, h: int = 4, desc: str = "") -> dict:
    spec = {"kind": "stat", "title": title, "sql": _spark(project, col),
            "format": "time_series", "unit": unit, "w": w, "h": h}
    if th:
        spec["th"] = th
    if desc:
        spec["desc"] = desc
    return spec


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
            "unit": "percent", "w": w, "h": h, "reduce": "last",
            "desc": desc + " Greyed when n<20 (too small to trust)."}
    if th:
        spec["th"] = th
    return spec


def build_project_dashboard(cfg: dict, exporter_url: str) -> dict:
    project = cfg["name"]
    th = _cfg_th(cfg)
    rate = cfg["blended_hourly_rate"]
    has_prod = cfg["has_production"]
    p = f"project = '{project}'"
    trend = (f"FROM {RATIOS} WHERE {p} AND period_type = 'sprint' "
             "ORDER BY period_start")

    steering = [
        _stat(project, "Sprint Predictability", "predictability_pct", "percent",
              th["predictability"],
              desc="Completed ÷ committed issues in the Jira sprint."),
        _stat(project, "Lead Time" if has_prod else "Merge Lead Time (no prod env)",
              "lead_time_h", "h", th["lead"],
              desc="Median hours from PR merge to next production deploy."
                   if has_prod else "Median hours from PR open to merge (no "
                   "production env yet). Lower is faster delivery."),
        _stat(project, "Incidents", "incidents", th=TH["incidents"], w=4,
              desc="Jira issues of type Incident created this sprint. "
                   "Green 0, amber 1-2, red 3+."),
        _stat(project, "MTTR", "mttr_h", "h", TH["mttr"], w=4,
              desc="Mean time to resolve: hours from an incident being "
                   "created to resolved. Lower is better."),
        _stat(project, "Rework %", "rework_pct", "percent", TH["rework"], w=4,
              desc="Share of merged PRs that revert or re-touch files changed "
                   "in the prior 14 days. Lower is healthier."),
    ]

    monthly_roi_sql = (
        f"SELECT w.period_start AS time, w.ai_time_saved_h * {rate} AS \"Savings $\", "
        "t.value::numeric AS \"Tool cost $\" "
        f"FROM {WIDE} w LEFT JOIN {MANUAL} t ON t.project = w.project "
        "AND t.period_key = w.period_key AND t.field = 'ai_tool_cost_monthly' "
        f"WHERE w.{p} AND w.period_type = 'month' ORDER BY w.period_start")
    net_sql = (
        f"SELECT (w.ai_time_saved_h * {rate}) - COALESCE(t.value::numeric, 0) "
        f"FROM {WIDE} w LEFT JOIN {MANUAL} t ON t.project = w.project "
        "AND t.period_key = w.period_key AND t.field = 'ai_tool_cost_monthly' "
        f"WHERE w.{p} AND w.period_type = 'month' AND w.ai_time_saved_h IS NOT NULL "
        "ORDER BY w.period_key DESC LIMIT 1")
    tools_sql = (
        "SELECT replace(metric_key, 'ai_tasks_tool_', '') AS \"Tool\", "
        "value::float8 AS \"Tasks\" FROM reporting.metric_counts "
        f"WHERE {p} AND period_type = 'sprint' AND period_key = '$sprint' "
        "AND metric_key LIKE 'ai_tasks_tool_%' ORDER BY value DESC")
    roi = [
        {"kind": "stat", "title": "AI Net $ (latest month)", "sql": net_sql,
         "unit": "currencyUSD", "w": 8, "h": 6, "graph": "none",
         "th": _th(CRIT, (0, GOOD)),
         "desc": f"Hours saved × ${rate}/h blended rate − monthly AI tool cost "
                 "(seats + API). Green when net-positive."},
        _stat(project, "AI Hours Saved", "ai_time_saved_h", "h", w=8, h=6,
              desc="Sum of per-ticket 'AI Time Saved' on issues done this sprint."),
        _stat(project, "Throughput / Engineer", "throughput_per_engineer", w=8, h=6,
              desc="Tasks done ÷ active engineers: ROI supporting evidence."),
        {"kind": "timeseries", "title": "Savings vs Tool Cost by Month",
         "sql": monthly_roi_sql, "format": "time_series", "unit": "currencyUSD",
         "w": 12, "h": 7,
         "desc": f"Monthly AI hours saved × ${rate}/h (Savings) vs the entered "
                 "AI tool cost. Savings above cost = positive ROI."},
        {"kind": "barchart", "title": "AI Tasks by Tool ($sprint)", "sql": tools_sql,
         "xfield": "Tool", "unit": "none", "w": 12, "h": 7, "color": ACCENT,
         "desc": "Which tool's licenses produce. From the Jira AI Tool field."},
    ]

    cause_effect = [
        {"kind": "timeseries", "title": "Lead Time (AI vs Non-AI)",
         "sql": ("SELECT period_start AS time, lead_time_ai_h AS \"AI PRs\", "
                 f"lead_time_nonai_h AS \"Non-AI PRs\" {trend}"),
         "format": "time_series", "unit": "h", "w": 12, "h": 8,
         "overrides": [
             {"matcher": {"id": "byName", "options": "AI PRs"},
              "properties": [{"id": "color", "value": {"mode": "fixed", "fixedColor": ACCENT}}]},
             {"matcher": {"id": "byName", "options": "Non-AI PRs"},
              "properties": [{"id": "color", "value": {"mode": "fixed", "fixedColor": DEEMPH}}]}],
         "desc": ("Neutral comparison: AI being slower on some work is a "
                  "legitimate finding (verification overhead), not an error.")},
        {"kind": "timeseries", "title": "Hours to First Review (AI vs Non-AI)",
         "sql": ("SELECT period_start AS time, first_review_ai_h AS \"AI PRs\", "
                 f"first_review_nonai_h AS \"Non-AI PRs\" {trend}"),
         "format": "time_series", "unit": "h", "w": 12, "h": 8,
         "overrides": [
             {"matcher": {"id": "byName", "options": "AI PRs"},
              "properties": [{"id": "color", "value": {"mode": "fixed", "fixedColor": ACCENT}}]},
             {"matcher": {"id": "byName", "options": "Non-AI PRs"},
              "properties": [{"id": "color", "value": {"mode": "fixed", "fixedColor": DEEMPH}}]}],
         "desc": ("Median hours from PR open to its first submitted review, by "
                  "segment. A rising AI line can signal review-queue pressure "
                  "from higher AI PR volume.")},
        _stat(project, "PR Size (AI)", "pr_size_ai", w=4, h=4,
              desc="Median lines changed (additions + deletions) per AI PR."),
        _stat(project, "PR Size (non-AI)", "pr_size_nonai", w=4, h=4,
              desc="Median lines changed per non-AI PR: the comparison "
                   "baseline for PR Size (AI)."),
        _stat(project, "Review Rounds (AI)", "review_rounds_ai", w=4, h=4,
              desc="Mean CHANGES_REQUESTED per AI PR: verification burden."),
        _stat(project, "Rework from AI %", "rework_from_ai_pct", "percent", w=4, h=4,
              desc="Share of rework whose culprit PR was AI-labeled."),
        _stat(project, "AI PR Test %", "ai_pr_test_pct", "percent", w=4, h=4,
              desc="AI PRs touching test files. Maturity gate input."),
        _guarded_pct(project, "AI PR Review %", "ai_pr_review_pct", "n_ai_pr",
                     TH["review"], w=4, h=4,
                     desc="Share of AI PRs with a human approval. Gate for "
                          "stages 3-4; target ~100%."),
    ]

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
    dora.append(_stat(project, "Sprint Predictability", "predictability_pct",
                      "percent", th["predictability"],
                      desc="Completed ÷ committed issues in the Jira sprint. "
                           "Higher = more reliable delivery."))
    if len(dora) == 3:            # no-prod env: 3 tiles fill the 24-wide row
        for pnl in dora:
            pnl["w"] = 8

    adoption = [
        _stat(project, "AI Engineers / Week", "ai_users_weekly_avg", w=4,
              desc="Distinct people using AI per week (PR + Jira proxy)."),
        _stat(project, "Contributors", "engineers_active", w=4,
              desc="Distinct engineers who merged a PR this sprint (bots excluded)."),
        _stat(project, "Engineer Usage Rate", "usage_pct", "percent",
              TH["usage"], w=4,
              desc="AI engineers ÷ active contributors. Target ≥80%."),
        _guarded_pct(project, "AI PR %", "ai_pr_pct", "n_pr", TH["ai_share"], w=4,
                     desc="Merged PRs labeled ai-assisted. Framework: ≥30% = L3, >50% = L4."),
        _stat(project, "AI Task %", "ai_task_pct", "percent", TH["ai_share"], w=4,
              desc="Done Jira issues with any AI usage."),
        _stat(project, "Agent Task %", "agent_task_pct", "percent", w=4,
              desc="Done Jira issues delegated to autonomous agents."),
        {"kind": "timeseries", "title": "AI Share of Work",
         "sql": ("SELECT period_start AS time, ai_pr_pct AS \"AI PR %\", "
                 "ai_task_pct AS \"AI Task %\", agent_task_pct AS \"Agent Task %\" "
                 f"{trend}"),
         "format": "time_series", "unit": "percent", "w": 24, "h": 8,
         "desc": ("Trend of AI-labeled PRs, AI-usage Jira tasks, and agent tasks "
                  "as a share of all work: adoption breadth over time."),
         "overrides": [
             {"matcher": {"id": "byName", "options": name},
              "properties": [{"id": "color",
                              "value": {"mode": "fixed", "fixedColor": color}}]}
             for name, color in [("AI PR %", PALETTE[0]), ("AI Task %", PALETTE[1]),
                                 ("Agent Task %", PALETTE[2])]]},
    ]

    agent_bars_sql = (
        "SELECT period_start AS time, agent_prs_autonomous AS \"Autonomous\", "
        f"agent_prs_human_fixed AS \"Human-fixed\" {trend}")
    agent = [
        {"kind": "timeseries", "title": "Agent PRs by Sprint", "sql": agent_bars_sql,
         "format": "time_series", "unit": "none", "w": 12, "h": 8,
         "custom": {"drawStyle": "bars", "stacking": {"mode": "normal"},
                    "fillOpacity": 80, "lineWidth": 0},
         "overrides": [
             {"matcher": {"id": "byName", "options": "Autonomous"},
              "properties": [{"id": "color",
                              "value": {"mode": "fixed", "fixedColor": ACCENT}}]},
             {"matcher": {"id": "byName", "options": "Human-fixed"},
              "properties": [{"id": "color",
                              "value": {"mode": "fixed", "fixedColor": DEEMPH}}]},
         ],
         "desc": "Merged agent PRs: shipped untouched (blue) vs needing human commits (gray)."},
        _guarded_pct(project, "Autonomy %", "autonomy_pct", "n_agent_pr", TH["autonomy"],
                     w=6, h=8, desc="Agent PRs with zero human commits. L4 ≥30%, L5 ≥60%."),
        _stat(project, "Completion %", "agent_completion_pct", "percent",
              w=8, h=6, desc="Agent PRs merged ÷ agent PRs opened."),
        _stat(project, "Intervention %", "human_intervention_pct", "percent",
              w=8, h=6, desc="Agent PRs needing human commits. Lower is better."),
        _stat(project, "Agent Cycle Time", "agent_cycle_h", "h",
              w=8, h=6, desc="Median hours from agent PR opened to merged."),
    ]

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

    monthly_sql = (
        "SELECT w.period_key AS \"Month\", "
        "round(w.ai_users_weekly_avg, 1) AS \"AI Engineers/wk\", "
        "w.engineers_active AS \"Contributors\", "
        "e.value::numeric AS \"Team Size\", "
        "round(w.usage_pct, 0) AS \"Usage %\", "
        "round(100.0 * w.ai_prs / NULLIF(w.total_prs, 0), 1) AS \"AI PR %\", "
        "w.total_tasks AS \"Tasks\", w.deploys AS \"Deploys\", "
        f"round(w.ai_time_saved_h * {rate}, 0) AS \"AI $ Saved\", "
        "tc.value::numeric AS \"Tool Cost $\", "
        "round(100 * c.value::numeric, 0) AS \"Coverage %\", "
        "cb.value::numeric AS \"Cost Baseline\", ca.value::numeric AS \"Cost Actual\", "
        "round(100 * (cb.value::numeric - ca.value::numeric) "
        "/ NULLIF(cb.value::numeric, 0), 0) AS \"Cost Improvement %\" "
        f"FROM {RATIOS} w "
        f"LEFT JOIN {MANUAL} e ON e.project = w.project AND e.period_key = w.period_key "
        "AND e.field = 'total_engineers' "
        f"LEFT JOIN {MANUAL} tc ON tc.project = w.project AND tc.period_key = w.period_key "
        "AND tc.field = 'ai_tool_cost_monthly' "
        f"LEFT JOIN {MANUAL} c ON c.project = w.project AND c.period_key = w.period_key "
        "AND c.field = 'coverage_ai' "
        f"LEFT JOIN {MANUAL} cb ON cb.project = w.project AND cb.period_key = w.period_key "
        "AND cb.field = 'cost_baseline' "
        f"LEFT JOIN {MANUAL} ca ON ca.project = w.project AND ca.period_key = w.period_key "
        "AND ca.field = 'cost_actual' "
        f"WHERE w.{p} AND w.period_type = 'month' ORDER BY w.period_key DESC")
    monthly = [
        {"kind": "table", "title": "Monthly Record (auto + manual inputs)",
         "sql": monthly_sql, "unit": "none", "w": 24, "h": 8,
         "overrides": [
             {"matcher": {"id": "byName", "options": "Usage %"},
              "properties": [{"id": "thresholds", "value": TH["usage"]},
                             {"id": "custom.cellOptions",
                              "value": {"type": "color-background", "mode": "basic"}}]}],
         "desc": ("Empty cells mean a manual input is missing: run the "
                  "'AI SDLC — Metrics Collection' workflow with manual_period=<month> "
                  "(total_engineers, ai_tool_cost_monthly, coverage_ai, "
                  "cost_baseline, cost_actual).")},
    ]

    dq = [
        _stat(project, "PRs (n)", "n_pr", w=4,
              desc="Merged PRs in the selected sprint: the sample size behind "
                   "every PR-based %. Below 20, percentages are greyed."),
        _stat(project, "Agent PRs (n)", "n_agent_pr", w=4,
              desc="Count of agent PRs this sprint. Agent-section percentages "
                   "stay hidden until this reaches the sample-size floor."),
        {"kind": "stat", "title": "Months of data",
         "sql": (f"SELECT count(*) FROM {RATIOS} WHERE {p} "
                 "AND period_type = 'month'"),
         "unit": "none", "w": 4, "graph": "none",
         "desc": "How many monthly rows exist: trend/ROI need ≥3."},
        _stat(project, "Usage %", "usage_pct", "percent", th["usage"], w=4,
              desc="AI users ÷ team size (capped at 100%). >100% raw input "
                   "raises a data-quality alert instead of rendering."),
        {"kind": "stat", "title": "Data Freshness",
         "sql": (f"SELECT extract(epoch FROM max(collected_at)) * 1000 FROM {COUNTS} WHERE {p}"),
         "format": "table", "unit": "dateTimeFromNow", "w": 8, "graph": "none",
         "desc": "When the collector last wrote data for this project."},
    ]

    story_sections = {
        "steering": ("Sprint Steering ($sprint)", steering),
        "roi": ("Return on Investment", roi),
        "cause_effect": ("Speed and Quality (AI vs Non-AI)", cause_effect),
        "dora": ("Delivery Health (DORA)", dora),
        "maturity": ("Maturity Ladder", maturity),
        "adoption": ("Adoption Breadth", adoption),
    }
    sections = [("Data Quality (read this first)", dq)]
    sections += [story_sections[key] for key in cfg["sections"] if key in story_sections]
    sections.append(("Monthly Record", monthly))

    level_summary = [
        {"kind": "table", "title": "A–E Levels (latest quarter)",
         "sql": (f"SELECT quarter AS \"Quarter\", lvl_a AS \"A Adoption\", "
                 "lvl_b AS \"B Delivery\", lvl_c AS \"C Quality*\", "
                 "lvl_d AS \"D Agent\", lvl_e AS \"E Governance*\", "
                 f"overall AS \"OVERALL\" FROM {LEVELS} WHERE project = '{project}' "
                 "ORDER BY quarter DESC LIMIT 1"),
         "unit": "none", "w": 24, "h": 4,
         "overrides": [_score_col(c, _th(CRIT, (2, WARN), (3, WARN), (4, GOOD)))
                       for c in ("A Adoption", "B Delivery", "C Quality*",
                                 "D Agent", "E Governance*", "OVERALL")],
         "desc": ("OVERALL = MIN(E-Governance, C-Quality, round(avg(A..E))). "
                  "C and E are gates (marked *): a low governance or quality level "
                  "caps the whole score. Source: reporting.v_levels (Excel workbook).")},
    ]
    sections.append(("A–E Level Summary", level_summary))

    links = [
        {"type": "link", "title": "Raw Data", "icon": "doc", "targetBlank": False,
         "url": f"/d/ai-sdlc-{project.lower()}-raw"},
        {"type": "link", "title": "Download Excel (all sprints)", "icon": "doc",
         "targetBlank": True, "url": f"{exporter_url}/export.xlsx?project={project}"},
        {"type": "link", "title": "Download Excel (selected sprint)", "icon": "doc",
         "targetBlank": True,
         "url": f"{exporter_url}/export.xlsx?project={project}&sprints=${{sprint}}"},
    ]
    return _dashboard(f"ai-sdlc-{project.lower()}", f"AI SDLC: {project}",
                      _layout(sections), [_sprint_var(project)], links)


def build_raw_dashboard(cfg: dict, exporter_url: str) -> dict:
    """Per-project audit board: the unaggregated collected values, the derived
    views, and manual inputs: so a team can trace any panel to its source."""
    project = cfg["name"]
    p = f"project = '{project}'"
    raw_counts = [
        {"kind": "table", "title": "All Collected Metrics",
         "sql": ("SELECT period_type AS \"Type\", period_key AS \"Period\", "
                 "metric_key AS \"Metric\", value AS \"Value\", "
                 "period_start AS \"From\", period_end AS \"To\", "
                 f"collected_at AS \"Collected\" FROM {COUNTS} WHERE {p} "
                 "ORDER BY period_start DESC, period_type, metric_key"),
         "unit": "none", "w": 24, "h": 12,
         "desc": "Every raw metric value the collector wrote "
                 "(reporting.metric_counts), newest period first: the "
                 "unaggregated source behind every dashboard panel."},
    ]
    derived = [
        {"kind": "table", "title": "Derived Values (wide + ratios)",
         "sql": (f"SELECT * FROM {RATIOS} WHERE {p} "
                 "ORDER BY period_type, period_start DESC"),
         "unit": "none", "w": 24, "h": 10,
         "desc": "The v_metrics view: one row per period, every metric "
                 "pivoted into columns plus the computed ratios."},
    ]
    manual = [
        {"kind": "table", "title": "Manual Inputs",
         "sql": ("SELECT period_key AS \"Period\", field AS \"Field\", "
                 "value AS \"Value\", entered_by AS \"By\", "
                 f"entered_at AS \"Entered\" FROM {MANUAL} WHERE {p} "
                 "ORDER BY period_key DESC, field"),
         "unit": "none", "w": 24, "h": 8,
         "desc": "PM/BOD-entered monthly and quarterly values "
                 "(reporting.manual_inputs) for this project."},
    ]
    sections = [
        ("Raw Metrics: all collected values", raw_counts),
        ("Derived Values (views)", derived),
        ("Manual Inputs", manual),
    ]
    links = [
        {"type": "link", "title": "← Story Dashboard", "icon": "dashboard",
         "targetBlank": False, "url": f"/d/ai-sdlc-{project.lower()}"},
        {"type": "link", "title": "Download Excel (all sprints)", "icon": "doc",
         "targetBlank": True, "url": f"{exporter_url}/export.xlsx?project={project}"},
    ]
    return _dashboard(f"ai-sdlc-{project.lower()}-raw",
                      f"AI SDLC: {project} (Raw Data)",
                      _layout(sections), [], links)


# -------------------------------------------------------------------- BOD ---

def _project_colors(projects: list[str]) -> list[dict]:
    return [{"matcher": {"id": "byName", "options": name},
             "properties": [{"id": "color",
                             "value": {"mode": "fixed",
                                       "fixedColor": PALETTE[i % len(PALETTE)]}}]}
            for i, name in enumerate(projects)]


def _score_col(name: str, th: dict) -> dict:
    return {"matcher": {"id": "byName", "options": name},
            "properties": [{"id": "thresholds", "value": th},
                           {"id": "custom.cellOptions",
                            "value": {"type": "color-background", "mode": "basic"}}]}


def build_bod_dashboard(cfgs: list[dict], exporter_url: str) -> dict:
    projects = [c["name"] for c in cfgs]
    rate_case = ("CASE w.project " +
                 " ".join(f"WHEN '{c['name']}' THEN {c['blended_hourly_rate']}"
                          for c in cfgs) + " ELSE 0 END")
    latest_month = (f"FROM (SELECT DISTINCT ON (project) * FROM {WIDE} "
                    "WHERE period_type = 'month' AND ai_time_saved_h IS NOT NULL "
                    "ORDER BY project, period_key DESC) w "
                    f"LEFT JOIN {MANUAL} t ON t.project = w.project "
                    "AND t.period_key = w.period_key AND t.field = 'ai_tool_cost_monthly'")
    latest = (f"FROM {RATIOS} r WHERE period_type = 'sprint' AND period_start = "
              f"(SELECT max(period_start) FROM {RATIOS} r2 WHERE r2.project = r.project "
              "AND r2.period_type = 'sprint')")
    trend = f"FROM {RATIOS} WHERE period_type = 'sprint' ORDER BY period_start"

    cost_latest = (
        f"FROM (SELECT project, period_key, value::numeric v FROM {MANUAL} "
        "WHERE field = 'cost_baseline') b "
        f"JOIN (SELECT project, period_key, value::numeric v FROM {MANUAL} "
        "WHERE field = 'cost_actual') a USING (project, period_key) "
        f"JOIN (SELECT project, max(period_key) mk FROM {MANUAL} "
        "WHERE field = 'cost_actual' GROUP BY project) m "
        "ON m.project = b.project AND m.mk = b.period_key")
    pulse = [
        {"kind": "stat", "title": "Projects Tracked",
         "sql": f"SELECT count(DISTINCT project) FROM {RATIOS} WHERE period_type = 'sprint'",
         "unit": "none", "w": 8, "graph": "none",
         "desc": "Distinct projects with at least one collected sprint."},
        {"kind": "stat", "title": "AI Net $ (portfolio, latest month)",
         "sql": (f"SELECT sum(w.ai_time_saved_h * {rate_case}) "
                 f"- sum(COALESCE(t.value::numeric, 0)) {latest_month}"),
         "unit": "currencyUSD", "th": _th(CRIT, (0, GOOD)), "w": 8, "graph": "none",
         "desc": "Sum across projects of (AI hours saved × that project's blended "
                 "rate) − monthly AI tool cost. Green when net-positive."},
        {"kind": "stat", "title": "AI PR % (portfolio)",
         "sql": f"SELECT round(avg(ai_pr_pct), 1) {latest}",
         "unit": "percent", "th": TH["ai_share"], "w": 8, "graph": "none",
         "desc": "Average AI-labeled PR share across projects, latest sprint each."},
        {"kind": "stat", "title": "Lead Time (portfolio)",
         "sql": f"SELECT round(avg(lead_time_h), 1) {latest}",
         "unit": "h", "th": TH["lead"], "w": 8, "graph": "none",
         "desc": "Average lead time across projects (latest sprint each). "
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

    def _score_table(title: str, cols: list[str], overrides: list[dict],
                     desc: str) -> dict:
        # Project + Sprint are pinned first; each themed table stays narrow
        # enough (~5-7 cols) to fit w:24 with no horizontal scroll, so a long
        # list of project rows reads top-to-bottom instead of sideways.
        sql = ("SELECT project AS \"Project\", period_key AS \"Sprint\", "
               + ", ".join(cols) + f" {latest} ORDER BY project")
        return {"kind": "table", "title": title, "sql": sql, "unit": "none",
                "w": 24, "h": 6, "overrides": overrides, "desc": desc}

    # Themes mirror workbook «3. Monthly» raw-input groups (A/B/C/D) so the
    # dashboard and the Excel line up column-for-column.
    scorecard = [
        _score_table(
            "A. Adoption: Latest Sprint",
            ["total_tasks AS \"Tasks\"", "total_prs AS \"PRs\"",
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
            "B. Delivery (DORA): Latest Sprint",
            ["round(lead_time_h, 1) AS \"Lead Time h\"",
             "round(deploys_per_week, 2) AS \"Deploys/wk\"",
             "round(cfr_pct, 1) AS \"CFR %\"",
             "round(mttr_h, 1) AS \"MTTR h\"",
             "round(predictability_pct, 0) AS \"Predictability %\""],
            [_score_col("Lead Time h", TH["lead"]),
             _score_col("Deploys/wk", TH["deploy_freq"]),
             _score_col("CFR %", TH["cfr"]),
             _score_col("MTTR h", TH["mttr"]),
             _score_col("Predictability %", TH["predictability"])],
            "DORA throughput + stability plus sprint predictability. "
            "Green = on target, yellow = watch, red = act."),
        _score_table(
            "C. Quality: Latest Sprint",
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
            "D. Agent: Latest Sprint",
            ["round(agent_pr_pct, 1) AS \"Agent PR %\"",
             "round(autonomy_pct, 1) AS \"Autonomy %\"",
             "round(agent_completion_pct, 1) AS \"Completion %\"",
             "round(human_intervention_pct, 1) AS \"Human-fix %\"",
             "round(agent_cycle_h, 1) AS \"Agent Cycle h\""],
            [_score_col("Autonomy %", TH["autonomy"])],
            "Agent maturity: agent PR share, autonomy (merged with zero human "
            "commits), completion vs human-fix rate, and cycle time."),
    ]

    evidence = [
        {"kind": "table", "title": "Evidence: AI vs Non-AI (latest sprint)",
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

    direction = [
        {"kind": "timeseries", "title": "AI PR % by Sprint",
         "sql": f"SELECT period_start AS time, project, ai_pr_pct {trend}",
         "format": "time_series", "unit": "percent", "w": 8, "h": 8,
         "overrides": _project_colors(projects),
         "desc": "AI-labeled PR share per sprint, one line per project. "
                 "Adoption trajectory across the portfolio."},
        {"kind": "timeseries", "title": "Lead Time by Sprint",
         "sql": f"SELECT period_start AS time, project, lead_time_h {trend}",
         "format": "time_series", "unit": "h", "w": 8, "h": 8,
         "overrides": _project_colors(projects),
         "desc": "Lead time (hours) per sprint, one line per project. "
                 "Lower/flatter is better."},
        {"kind": "timeseries", "title": "Agent Autonomy % by Sprint",
         "sql": f"SELECT period_start AS time, project, autonomy_pct {trend}",
         "format": "time_series", "unit": "percent", "w": 8, "h": 8,
         "overrides": _project_colors(projects),
         "desc": "Share of agent PRs merged with no human commits, per sprint "
                 "and project. Rising = growing agent autonomy."},
    ]

    usage_by_project = (
        "SELECT DISTINCT ON (w.project) w.project AS \"Project\", "
        "round(w.usage_pct, 0)::float8 AS \"Usage %\" "
        f"FROM {RATIOS} w "
        "WHERE w.period_type = 'month' ORDER BY w.project, w.period_key DESC")
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
        {"kind": "barchart", "title": "AI Tasks by Tool (portfolio, all sprints)",
         "sql": ("SELECT replace(metric_key, 'ai_tasks_tool_', '') AS \"Tool\", "
                 "sum(value)::float8 AS \"Tasks\" FROM reporting.metric_counts "
                 "WHERE period_type = 'sprint' AND metric_key LIKE 'ai_tasks_tool_%' "
                 "GROUP BY 1 ORDER BY 2 DESC"),
         "xfield": "Tool", "unit": "none", "w": 8, "h": 8, "color": PALETTE[2],
         "desc": "Portfolio tool mix: informs license decisions."},
    ]

    heatmap = [
        {"kind": "table", "title": "Portfolio Maturity (A–E)",
         "sql": (f"SELECT project AS \"Project\", lvl_a AS \"A\", lvl_b AS \"B\", "
                 "lvl_c AS \"C*\", lvl_d AS \"D\", lvl_e AS \"E*\", "
                 "overall AS \"OVERALL\" FROM (" + _levels_latest_all() + ") x "
                 "ORDER BY overall, project"),
         "unit": "none", "w": 24, "h": 8,
         "overrides": [_score_col(c, _th(CRIT, (2, WARN), (3, WARN), (4, GOOD)))
                       for c in ("A", "B", "C*", "D", "E*", "OVERALL")],
         "desc": ("Each project's A-E levels for its latest quarter. C and E are "
                  "gates (marked *). Click a project to open its dashboard. "
                  "OVERALL = MIN(E, C, round(avg)).")},
    ]
    sections = [
        ("Return on Investment", pulse),
        ("Project Scorecard (latest sprint)", scorecard),
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
                      _layout(sections), [], links)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(HERE / "dashboards"))
    args = parser.parse_args()
    out = Path(args.out)

    exporter, cfgs = load_config()

    for cfg in cfgs:
        for kind, builder in (("project", build_project_dashboard),
                              ("raw", build_raw_dashboard)):
            d = builder(cfg, exporter)
            path = out / cfg["name"] / f"{kind}.json"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(d, indent=2))
            print(f"wrote {path}")

    bod = build_bod_dashboard(cfgs, exporter)
    path = out / "BOD" / "portfolio.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(bod, indent=2))
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
