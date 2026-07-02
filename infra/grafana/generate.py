#!/usr/bin/env python3
"""
Generate Grafana dashboards from projects.json: one pinned dashboard per
project (folder = project name) plus one BOD portfolio dashboard.

  python infra/grafana/generate.py            # writes infra/grafana/dashboards/
  python infra/grafana/generate.py --out DIR  # custom output (tests)
"""
import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
DS = {"type": "postgres", "uid": "reporting-postgres"}
RATIOS = "reporting.metrics_ratios"
MANUAL = "reporting.manual_inputs"


def _target(sql: str) -> dict:
    return {"datasource": DS, "format": "table", "rawQuery": True, "rawSql": sql, "refId": "A"}


def _panel(kind: str, title: str, sql: str, unit: str, x: int, y: int,
           w: int = 6, h: int = 4) -> dict:
    return {
        "type": kind, "title": title, "datasource": DS,
        "gridPos": {"x": x, "y": y, "w": w, "h": h},
        "targets": [_target(sql)],
        "fieldConfig": {"defaults": {"unit": unit}, "overrides": []},
        "options": {},
    }


def _row(title: str, y: int) -> dict:
    return {"type": "row", "title": title, "collapsed": False,
            "gridPos": {"x": 0, "y": y, "w": 24, "h": 1}, "panels": []}


def _layout(sections: list[tuple[str, list[tuple]]]) -> list[dict]:
    """sections: [(row_title, [(kind, title, sql, unit), ...])]. 4 panels per line."""
    panels, y = [], 0
    for row_title, defs in sections:
        panels.append(_row(row_title, y))
        y += 1
        for i, (kind, title, sql, unit) in enumerate(defs):
            if i and i % 4 == 0:
                y += 4
            panels.append(_panel(kind, title, sql, unit, x=(i % 4) * 6, y=y))
        y += 4
    return panels


def _dashboard(uid: str, title: str, panels: list[dict],
               templating: list[dict]) -> dict:
    return {
        "uid": uid, "title": title, "schemaVersion": 39, "version": 1,
        "editable": True, "timezone": "utc",
        "time": {"from": "now-180d", "to": "now"},
        "templating": {"list": templating},
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


def build_project_dashboard(project: str) -> dict:
    p, s = f"project = '{project}'", "period_type = 'sprint' AND period_key = '$sprint'"
    cur = f"FROM {RATIOS} WHERE {p} AND {s}"
    trend = (f"FROM {RATIOS} WHERE {p} AND period_type = 'sprint' "
             "ORDER BY period_start")
    sections = [
        ("Selected Sprint — Adoption", [
            ("stat", "AI PR %", f"SELECT ai_pr_pct {cur}", "percent"),
            ("stat", "AI Task %", f"SELECT ai_task_pct {cur}", "percent"),
            ("stat", "Agent Task %", f"SELECT agent_task_pct {cur}", "percent"),
            ("stat", "AI Engineers / Week", f"SELECT ai_users_weekly_avg {cur}", "none"),
        ]),
        ("Selected Sprint — DORA", [
            ("stat", "Lead Time (h)", f"SELECT lead_time_h {cur}", "h"),
            ("stat", "Deploys / Week", f"SELECT deploys_per_week {cur}", "none"),
            ("stat", "Change Failure Rate", f"SELECT cfr_pct {cur}", "percent"),
            ("stat", "MTTR (h)", f"SELECT mttr_h {cur}", "h"),
        ]),
        ("Selected Sprint — Quality & Security", [
            ("stat", "Rework %", f"SELECT rework_pct {cur}", "percent"),
            ("stat", "AI PR Review Coverage", f"SELECT ai_pr_review_pct {cur}", "percent"),
            ("stat", "Security Alerts", f"SELECT security_alerts {cur}", "none"),
            ("stat", "Sprint Predictability", f"SELECT predictability_pct {cur}", "percent"),
        ]),
        ("Selected Sprint — Agent Maturity", [
            ("gauge", "Agent Completion %", f"SELECT agent_completion_pct {cur}", "percent"),
            ("gauge", "Human Intervention %", f"SELECT human_intervention_pct {cur}", "percent"),
            ("gauge", "Autonomy %", f"SELECT autonomy_pct {cur}", "percent"),
            ("stat", "Agent Cycle Time (h)", f"SELECT agent_cycle_h {cur}", "h"),
        ]),
        ("Sprint Trends", [
            ("timeseries", "AI PR % by Sprint",
             f"SELECT period_start AS time, ai_pr_pct AS \"AI PR %\" {trend}", "percent"),
            ("timeseries", "Autonomy % by Sprint",
             f"SELECT period_start AS time, autonomy_pct AS \"Autonomy %\" {trend}", "percent"),
            ("timeseries", "Lead Time by Sprint",
             f"SELECT period_start AS time, lead_time_h AS \"Lead time h\" {trend}", "h"),
            ("timeseries", "Deploys/Week by Sprint",
             f"SELECT period_start AS time, deploys_per_week AS \"Deploys/wk\" {trend}", "none"),
        ]),
        ("Manual Monthly KPIs (latest)", [
            ("stat", "Team Size",
             f"SELECT value::numeric FROM {MANUAL} WHERE {p} AND field = 'total_engineers' "
             "ORDER BY period_key DESC LIMIT 1", "none"),
            ("stat", "AI Code Coverage %",
             f"SELECT 100 * value::numeric FROM {MANUAL} WHERE {p} AND field = 'coverage_ai' "
             "ORDER BY period_key DESC LIMIT 1", "percent"),
            ("stat", "Cost Improvement %",
             "SELECT 100 * (b.v - a.v) / NULLIF(b.v, 0) FROM "
             f"(SELECT period_key, value::numeric v FROM {MANUAL} WHERE {p} AND field = 'cost_baseline') b "
             f"JOIN (SELECT period_key, value::numeric v FROM {MANUAL} WHERE {p} AND field = 'cost_actual') a "
             "USING (period_key) ORDER BY period_key DESC LIMIT 1", "percent"),
        ]),
    ]
    return _dashboard(f"ai-sdlc-{project.lower()}", f"AI SDLC — {project}",
                      _layout(sections), [_sprint_var(project)])


def build_bod_dashboard(projects: list[str]) -> dict:
    latest = (f"FROM {RATIOS} r WHERE period_type = 'sprint' AND period_start = "
              f"(SELECT max(period_start) FROM {RATIOS} r2 WHERE r2.project = r.project "
              "AND r2.period_type = 'sprint')")
    trend = f"FROM {RATIOS} WHERE period_type = 'sprint' ORDER BY period_start"
    sections = [
        ("Portfolio Scorecard — Latest Sprint per Project", [
            ("table", "Latest Sprint Overview",
             "SELECT project, period_key AS sprint, round(ai_pr_pct, 1) AS \"AI PR %\", "
             "round(lead_time_h, 1) AS \"Lead time h\", round(deploys_per_week, 2) AS \"Deploys/wk\", "
             "round(cfr_pct, 1) AS \"CFR %\", round(mttr_h, 1) AS \"MTTR h\", "
             "round(autonomy_pct, 1) AS \"Autonomy %\", security_alerts AS \"Alerts\" "
             f"{latest} ORDER BY project", "none"),
        ]),
        ("Adoption Across Projects", [
            ("timeseries", "AI PR % by Sprint (all projects)",
             f"SELECT period_start AS time, project, ai_pr_pct {trend}", "percent"),
            ("timeseries", "Agent Task % by Sprint (all projects)",
             f"SELECT period_start AS time, project, agent_task_pct {trend}", "percent"),
        ]),
        ("Delivery Across Projects", [
            ("timeseries", "Lead Time by Sprint (all projects)",
             f"SELECT period_start AS time, project, lead_time_h {trend}", "h"),
            ("timeseries", "Deploys/Week by Sprint (all projects)",
             f"SELECT period_start AS time, project, deploys_per_week {trend}", "none"),
            ("timeseries", "CFR % by Sprint (all projects)",
             f"SELECT period_start AS time, project, cfr_pct {trend}", "percent"),
            ("timeseries", "MTTR by Sprint (all projects)",
             f"SELECT period_start AS time, project, mttr_h {trend}", "h"),
        ]),
        ("Quality & Agent Maturity", [
            ("timeseries", "Rework % by Sprint (all projects)",
             f"SELECT period_start AS time, project, rework_pct {trend}", "percent"),
            ("timeseries", "Autonomy % by Sprint (all projects)",
             f"SELECT period_start AS time, project, autonomy_pct {trend}", "percent"),
        ]),
    ]
    return _dashboard("ai-sdlc-bod", "AI SDLC — Portfolio (BOD)", _layout(sections), [])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(HERE / "dashboards"))
    args = parser.parse_args()
    out = Path(args.out)

    config = json.loads((HERE / "projects.json").read_text())
    names = [p["name"] for p in config["projects"]]

    for name in names:
        d = build_project_dashboard(name)
        path = out / name / "project.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(d, indent=2))
        print(f"wrote {path}")

    bod = build_bod_dashboard(names)
    path = out / "BOD" / "portfolio.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(bod, indent=2))
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
