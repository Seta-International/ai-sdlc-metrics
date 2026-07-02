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
  validated against Grafana's dark surface #181b1f (validate_palette.js — all
  checks pass; slots 4+ rely on the legend as secondary encoding).
- Stat tiles carry sparklines (history up to the selected sprint) so "current
  value + direction" is one glance.
"""
import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
DS = {"type": "postgres", "uid": "reporting-postgres"}
RATIOS = "reporting.metrics_ratios"
WIDE = "reporting.metrics_wide"
MANUAL = "reporting.manual_inputs"

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


def _target(sql: str, fmt: str) -> dict:
    return {"datasource": DS, "format": fmt, "rawQuery": True,
            "rawSql": sql, "refId": "A"}


def _options(kind: str, spec: dict) -> dict:
    if kind == "stat":
        return {"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                "graphMode": spec.get("graph", "area"),
                "colorMode": "value", "justifyMode": "auto", "textMode": "auto"}
    if kind == "timeseries":
        legend = "hidden" if spec.get("single") else "list"
        return {"legend": {"displayMode": legend, "placement": "bottom"},
                "tooltip": {"mode": "multi", "sort": "desc"}}
    if kind == "barchart":
        return {"orientation": "horizontal", "showValue": "always",
                "legend": {"displayMode": "hidden", "placement": "bottom"}}
    if kind == "table":
        return {"showHeader": True}
    return {}


def _panel(spec: dict, x: int, y: int) -> dict:
    defaults: dict = {"unit": spec.get("unit", "none"),
                      "thresholds": spec.get("th", _TEXT_TH)}
    if "color" in spec:
        defaults["color"] = {"mode": "fixed", "fixedColor": spec["color"]}
    elif "th" in spec:
        defaults["color"] = {"mode": "thresholds"}
    if "custom" in spec:
        defaults["custom"] = spec["custom"]
    panel = {
        "type": spec["kind"], "title": spec["title"], "datasource": DS,
        "gridPos": {"x": x, "y": y, "w": spec.get("w", 6), "h": spec.get("h", 4)},
        "targets": [_target(spec["sql"], spec.get("format", "table"))],
        "fieldConfig": {"defaults": defaults, "overrides": spec.get("overrides", [])},
        "options": _options(spec["kind"], spec),
    }
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
        "time": {"from": "now-180d", "to": "now"},
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


def build_project_dashboard(project: str, exporter_url: str) -> dict:
    p = f"project = '{project}'"
    trend = (f"FROM {RATIOS} WHERE {p} AND period_type = 'sprint' "
             "ORDER BY period_start")

    throughput = [
        _stat(project, "Tasks Completed", "total_tasks", w=4,
              desc="Jira issues moved to Done this sprint."),
        _stat(project, "PRs Merged", "total_prs", w=4),
        _stat(project, "Deploys", "deploys", w=4),
        _stat(project, "Incidents", "incidents", th=TH["incidents"], w=4),
        _stat(project, "AI Engineers / Week", "ai_users_weekly_avg", w=4,
              desc="Distinct people using AI per week (PR + Jira proxy)."),
        _stat(project, "Agent Tasks", "agent_tasks", w=4,
              desc="Jira issues done with AI usage = Agent."),
    ]

    usage_rate_sql = (
        "SELECT w.period_start AS time, "
        "100 * w.ai_users_weekly_avg / NULLIF(e.value::numeric, 0) AS value "
        f"FROM {WIDE} w JOIN {MANUAL} e ON e.project = w.project "
        "AND e.period_key = w.period_key AND e.field = 'total_engineers' "
        f"WHERE w.{p} AND w.period_type = 'month' ORDER BY w.period_start")
    adoption = [
        _stat(project, "AI PR %", "ai_pr_pct", "percent", TH["ai_share"],
              desc="Merged PRs labeled ai-assisted. Framework: ≥30% = L3, >50% = L4."),
        _stat(project, "AI Task %", "ai_task_pct", "percent", TH["ai_share"],
              desc="Done Jira issues with any AI usage."),
        _stat(project, "Agent Task %", "agent_task_pct", "percent",
              desc="Done Jira issues delegated to autonomous agents."),
        {"kind": "stat", "title": "Engineer Usage Rate (monthly)",
         "sql": usage_rate_sql, "format": "time_series", "unit": "percent",
         "th": TH["usage"], "w": 6, "h": 4,
         "desc": "AI engineers ÷ team size (manual input). Target ≥80%."},
    ]

    dora = [
        _stat(project, "Lead Time", "lead_time_h", "h", TH["lead"],
              desc="Median hours from PR merge to the next production deploy."),
        _stat(project, "Deploys / Week", "deploys_per_week", "none", TH["deploy_freq"]),
        _stat(project, "Change Failure Rate", "cfr_pct", "percent", TH["cfr"],
              desc="Incidents per deploy. Target ≤15%."),
        _stat(project, "MTTR", "mttr_h", "h", TH["mttr"],
              desc="Mean hours from incident created to resolved."),
    ]

    quality = [
        _stat(project, "AI PR Review Coverage", "ai_pr_review_pct", "percent",
              TH["review"], desc="AI PRs with ≥1 human approval. Gate: 100%."),
        _stat(project, "Rework %", "rework_pct", "percent", TH["rework"],
              desc="PRs reverted or re-touching files merged in the prior 14 days."),
        _stat(project, "Security Alerts", "security_alerts", "none", TH["alerts"],
              desc="Code-scanning + secret-scanning alerts opened this sprint."),
        _stat(project, "Sprint Predictability", "predictability_pct", "percent",
              TH["predictability"],
              desc="Completed ÷ committed issues in the Jira sprint. Needs JIRA_BOARD_ID."),
    ]

    agent_bars_sql = (
        "SELECT period_start AS time, agent_prs_autonomous AS \"Autonomous\", "
        f"agent_prs_human_fixed AS \"Human-fixed\" {trend}")
    agent = [
        {"kind": "timeseries", "title": "Agent PRs by Sprint", "sql": agent_bars_sql,
         "format": "time_series", "unit": "none", "w": 8, "h": 8,
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
        _stat(project, "Autonomy %", "autonomy_pct", "percent", TH["autonomy"],
              w=4, h=8, desc="Agent PRs with zero human commits. L4 ≥30%, L5 ≥60%."),
        _stat(project, "Completion %", "agent_completion_pct", "percent",
              w=4, h=8, desc="Agent PRs merged ÷ agent PRs opened."),
        _stat(project, "Intervention %", "human_intervention_pct", "percent",
              w=4, h=8, desc="Agent PRs needing human commits. Lower is better."),
        _stat(project, "Agent Cycle Time", "agent_cycle_h", "h",
              w=4, h=8, desc="Median hours from agent PR opened to merged."),
    ]

    trends = [
        {"kind": "timeseries", "title": "AI Share of Work",
         "sql": ("SELECT period_start AS time, ai_pr_pct AS \"AI PR %\", "
                 "ai_task_pct AS \"AI Task %\", agent_task_pct AS \"Agent Task %\" "
                 f"{trend}"),
         "format": "time_series", "unit": "percent", "w": 8, "h": 8,
         "overrides": [
             {"matcher": {"id": "byName", "options": name},
              "properties": [{"id": "color",
                              "value": {"mode": "fixed", "fixedColor": color}}]}
             for name, color in [("AI PR %", PALETTE[0]), ("AI Task %", PALETTE[1]),
                                 ("Agent Task %", PALETTE[2])]]},
        {"kind": "timeseries", "title": "Lead Time by Sprint",
         "sql": f"SELECT period_start AS time, lead_time_h AS \"Lead time\" {trend}",
         "format": "time_series", "unit": "h", "w": 8, "h": 8,
         "single": True, "color": ACCENT},
        {"kind": "timeseries", "title": "Deploys per Week by Sprint",
         "sql": f"SELECT period_start AS time, deploys_per_week AS \"Deploys/wk\" {trend}",
         "format": "time_series", "unit": "none", "w": 8, "h": 8,
         "single": True, "color": PALETTE[1],
         "custom": {"drawStyle": "bars", "fillOpacity": 80, "lineWidth": 0}},
    ]

    monthly_sql = (
        "SELECT w.period_key AS \"Month\", "
        "round(w.ai_users_weekly_avg, 1) AS \"AI Engineers/wk\", "
        "e.value::numeric AS \"Team Size\", "
        "round(100 * w.ai_users_weekly_avg / NULLIF(e.value::numeric, 0), 0) AS \"Usage %\", "
        "round(100.0 * w.ai_prs / NULLIF(w.total_prs, 0), 1) AS \"AI PR %\", "
        "w.total_tasks AS \"Tasks\", w.deploys AS \"Deploys\", "
        "round(100 * c.value::numeric, 0) AS \"Coverage %\", "
        "cb.value::numeric AS \"Cost Baseline\", ca.value::numeric AS \"Cost Actual\", "
        "round(100 * (cb.value::numeric - ca.value::numeric) "
        "/ NULLIF(cb.value::numeric, 0), 0) AS \"Cost Improvement %\" "
        f"FROM {WIDE} w "
        f"LEFT JOIN {MANUAL} e ON e.project = w.project AND e.period_key = w.period_key "
        "AND e.field = 'total_engineers' "
        f"LEFT JOIN {MANUAL} c ON c.project = w.project AND c.period_key = w.period_key "
        "AND c.field = 'coverage_ai' "
        f"LEFT JOIN {MANUAL} cb ON cb.project = w.project AND cb.period_key = w.period_key "
        "AND cb.field = 'cost_baseline' "
        f"LEFT JOIN {MANUAL} ca ON ca.project = w.project AND ca.period_key = w.period_key "
        "AND ca.field = 'cost_actual' "
        f"WHERE w.{p} AND w.period_type = 'month' ORDER BY w.period_key DESC")
    monthly = [
        {"kind": "table", "title": "Monthly Record — auto + manual inputs",
         "sql": monthly_sql, "unit": "none", "w": 24, "h": 8,
         "overrides": [
             {"matcher": {"id": "byName", "options": "Usage %"},
              "properties": [{"id": "thresholds", "value": TH["usage"]},
                             {"id": "custom.cellOptions",
                              "value": {"type": "color-background", "mode": "basic"}}]}],
         "desc": ("Empty cells mean a manual input is missing — run the "
                  "'AI SDLC Metrics' workflow with manual_period=<month> "
                  "(total_engineers, coverage_ai, cost_baseline, cost_actual).")},
    ]

    sections = [
        ("Sprint Throughput ($sprint)", throughput),
        ("AI Adoption", adoption),
        ("Delivery — DORA", dora),
        ("Quality Gate", quality),
        ("Agent Maturity", agent),
        ("Trends", trends),
        ("Monthly Record", monthly),
    ]
    links = [
        {"type": "link", "title": "Download Excel (all sprints)", "icon": "doc",
         "targetBlank": True, "url": f"{exporter_url}/export.xlsx?project={project}"},
        {"type": "link", "title": "Download Excel (selected sprint)", "icon": "doc",
         "targetBlank": True,
         "url": f"{exporter_url}/export.xlsx?project={project}&sprints=${{sprint}}"},
    ]
    return _dashboard(f"ai-sdlc-{project.lower()}", f"AI SDLC — {project}",
                      _layout(sections), [_sprint_var(project)], links)


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


def build_bod_dashboard(projects: list[str], exporter_url: str) -> dict:
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
         "unit": "none", "w": 4, "graph": "none"},
        {"kind": "stat", "title": "AI PR % (portfolio)",
         "sql": f"SELECT round(avg(ai_pr_pct), 1) {latest}",
         "unit": "percent", "th": TH["ai_share"], "w": 5, "graph": "none",
         "desc": "Average across projects, latest sprint each."},
        {"kind": "stat", "title": "Lead Time (portfolio)",
         "sql": f"SELECT round(avg(lead_time_h), 1) {latest}",
         "unit": "h", "th": TH["lead"], "w": 5, "graph": "none"},
        {"kind": "stat", "title": "Agent Autonomy (portfolio)",
         "sql": f"SELECT round(avg(autonomy_pct), 1) {latest}",
         "unit": "percent", "th": TH["autonomy"], "w": 5, "graph": "none"},
        {"kind": "stat", "title": "Cost Improvement (portfolio)",
         "sql": f"SELECT round(avg(100 * (b.v - a.v) / NULLIF(b.v, 0)), 0) {cost_latest}",
         "unit": "percent", "w": 5, "graph": "none",
         "desc": "Baseline vs actual cost per unit, latest manual input per project."},
    ]

    scorecard_sql = (
        "SELECT project AS \"Project\", period_key AS \"Sprint\", "
        "total_tasks AS \"Tasks\", total_prs AS \"PRs\", "
        "round(ai_pr_pct, 1) AS \"AI PR %\", round(agent_task_pct, 1) AS \"Agent Task %\", "
        "round(lead_time_h, 1) AS \"Lead Time h\", round(deploys_per_week, 2) AS \"Deploys/wk\", "
        "round(cfr_pct, 1) AS \"CFR %\", round(mttr_h, 1) AS \"MTTR h\", "
        "round(ai_pr_review_pct, 1) AS \"Review %\", round(rework_pct, 1) AS \"Rework %\", "
        "security_alerts AS \"Alerts\", round(autonomy_pct, 1) AS \"Autonomy %\", "
        "round(predictability_pct, 1) AS \"Predictability %\" "
        f"{latest} ORDER BY project")
    scorecard = [
        {"kind": "table", "title": "Project Scorecard — Latest Sprint",
         "sql": scorecard_sql, "unit": "none", "w": 24, "h": 9,
         "overrides": [
             _score_col("AI PR %", TH["ai_share"]),
             _score_col("Lead Time h", TH["lead"]),
             _score_col("Deploys/wk", TH["deploy_freq"]),
             _score_col("CFR %", TH["cfr"]),
             _score_col("MTTR h", TH["mttr"]),
             _score_col("Review %", TH["review"]),
             _score_col("Rework %", TH["rework"]),
             _score_col("Alerts", TH["alerts"]),
             _score_col("Autonomy %", TH["autonomy"]),
             _score_col("Predictability %", TH["predictability"]),
         ],
         "desc": ("Green = on target, yellow = watch, red = act "
                  "(thresholds from the maturity framework). "
                  "Blue on Autonomy marks agent maturity level, not health.")},
    ]

    direction = [
        {"kind": "timeseries", "title": "AI PR % by Sprint",
         "sql": f"SELECT period_start AS time, project, ai_pr_pct {trend}",
         "format": "time_series", "unit": "percent", "w": 8, "h": 8,
         "overrides": _project_colors(projects)},
        {"kind": "timeseries", "title": "Lead Time by Sprint",
         "sql": f"SELECT period_start AS time, project, lead_time_h {trend}",
         "format": "time_series", "unit": "h", "w": 8, "h": 8,
         "overrides": _project_colors(projects)},
        {"kind": "timeseries", "title": "Agent Autonomy % by Sprint",
         "sql": f"SELECT period_start AS time, project, autonomy_pct {trend}",
         "format": "time_series", "unit": "percent", "w": 8, "h": 8,
         "overrides": _project_colors(projects)},
    ]

    usage_by_project = (
        "SELECT DISTINCT ON (w.project) w.project AS \"Project\", "
        "round(100 * w.ai_users_weekly_avg / NULLIF(e.value::numeric, 0), 0) AS \"Usage %\" "
        f"FROM {WIDE} w JOIN {MANUAL} e ON e.project = w.project "
        "AND e.period_key = w.period_key AND e.field = 'total_engineers' "
        "WHERE w.period_type = 'month' ORDER BY w.project, w.period_key DESC")
    value = [
        {"kind": "barchart", "title": "Cost Improvement % by Project (latest)",
         "sql": (f"SELECT b.project AS \"Project\", "
                 f"round(100 * (b.v - a.v) / NULLIF(b.v, 0), 0) AS \"Cost Improvement %\" "
                 f"{cost_latest} ORDER BY 2 DESC"),
         "unit": "percent", "w": 12, "h": 8, "color": ACCENT,
         "desc": "From monthly manual inputs (cost baseline vs actual per unit)."},
        {"kind": "barchart", "title": "Engineer Usage Rate by Project (latest month)",
         "sql": usage_by_project, "unit": "percent", "w": 12, "h": 8,
         "color": PALETTE[1],
         "desc": "AI engineers ÷ team size. Framework target ≥80%."},
    ]

    sections = [
        ("Portfolio Pulse — Latest Sprint", pulse),
        ("Project Scorecard", scorecard),
        ("Direction of Travel", direction),
        ("Value", value),
    ]
    links = [{"type": "link", "title": "Download Excel (all projects)", "icon": "doc",
              "targetBlank": True, "url": f"{exporter_url}/export.xlsx?project=all"}]
    return _dashboard("ai-sdlc-bod", "AI SDLC — Portfolio (BOD)",
                      _layout(sections), [], links)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(HERE / "dashboards"))
    args = parser.parse_args()
    out = Path(args.out)

    config = json.loads((HERE / "projects.json").read_text())
    names = [p["name"] for p in config["projects"]]
    exporter = config.get("exporter_url", "http://localhost:3031")

    for name in names:
        d = build_project_dashboard(name, exporter)
        path = out / name / "project.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(d, indent=2))
        print(f"wrote {path}")

    bod = build_bod_dashboard(names, exporter)
    path = out / "BOD" / "portfolio.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(bod, indent=2))
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
