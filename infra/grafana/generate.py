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


def _bod_vars() -> list[dict]:
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

def _score_col(name: str, th: dict) -> dict:
    return {"matcher": {"id": "byName", "options": name},
            "properties": [{"id": "thresholds", "value": th},
                           {"id": "custom.cellOptions",
                            "value": {"type": "color-background", "mode": "basic"}}]}


def build_bod_dashboard(cfgs: list[dict], exporter_url: str) -> dict:
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
    maturing = [
        {"kind": "barchart", "title": "Maturity distribution (projects per level)", "w": 12, "h": 7,
         "xfield": "Level", "unit": "none", "color": BLUE_MID,
         # v_level_distribution's quarter is each project's OWN latest quarter, not a
         # shared portfolio period — filtering to a single max(quarter) would silently
         # drop any project whose latest data is an older quarter than others'. Every
         # project already contributes exactly one row per dimension, so sum across
         # all quarters instead.
         "sql": ("SELECT ('L' || level) AS \"Level\", "
                 "sum(n_projects)::float8 AS \"Projects\" FROM reporting.v_level_distribution "
                 "WHERE dimension = 'OVERALL' GROUP BY level ORDER BY level"),
         "desc": "Portfolio shape: how many projects sit at each overall maturity "
                 "level this quarter. Scales to N projects (no per-project rows)."},
        {"kind": "timeseries", "title": "Adoption breadth (penetration)", "w": 12, "h": 7,
         "format": "time_series", "unit": "none",
         # v_penetration only has month/sprint grain (no quarter rollup exists),
         # so this is pinned to 'month' rather than following $granularity.
         "sql": ("SELECT period_start AS time, n_projects_ai AS \"On AI program\", "
                 "n_projects_total AS \"Total active\" FROM reporting.v_penetration "
                 f"WHERE period_type = 'month' AND {_tf('period_start')} "
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
