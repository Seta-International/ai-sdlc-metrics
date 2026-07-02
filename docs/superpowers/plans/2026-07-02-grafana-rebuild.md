# Grafana Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Grafana on the raw-count schema: a read-time SQL view layer, generated per-project dashboards + one company BOD dashboard (all English), per-project folders, and PM viewer accounts restricted to their own folder.

**Architecture:** Plan 3 of 4 (spec §9). A `reporting.metrics_wide` view pivots `metric_counts` into one wide row per (project, period) and `reporting.metrics_ratios` adds derived percentages — panels and the Plan-4 exporter read views, never the tall table. Dashboards are **generated** by `infra/grafana/generate.py` from a panel spec plus `infra/grafana/projects.json`: one pinned dashboard per project in its own folder, one BOD portfolio dashboard in a `BOD` folder (Grafana file provisioning with `foldersFromFilesStructure`). `infra/grafana/setup_access.py` creates PM viewer users and locks folder permissions via the admin HTTP API (all Grafana OSS features).

**Tech Stack:** PostgreSQL views, Grafana 12 file provisioning, Python 3.12 (stdlib + requests), pytest.

## Global Constraints

- All dashboard titles, panel names, labels in English.
- Current dashboards read the dropped `ai_sprint_metrics` table — they are dead; **delete** `ai-sdlc-team.json` / `ai-sdlc-bod.json`, no migration.
- Datasource stays `reporting-postgres` (uid) — do not touch `provisioning/datasources/`.
- Folder permission values (Grafana API): 1=View, 2=Edit, 4=Admin. POSTing `items` **replaces** all permissions on a folder; org Admins always retain access.
- Only `Future` is onboarded now; `projects.json` is the single place a new project is added (TeacherZone later = one array entry + re-run generator + access script).
- Run tests with `python -m pytest`.

---

### Task 1: SQL view layer

**Files:**
- Create: `infra/db/views.sql`
- Modify: `tests/conftest.py` (apply views.sql after init.sql)
- Create: `tests/test_views.py`

**Interfaces:**
- Produces: `reporting.metrics_wide` (one row per project/period_type/period_key; one column per canonical metric key + `period_start`) and `reporting.metrics_ratios` (everything in `metrics_wide` plus `ai_pr_pct, agent_task_pct, ai_task_pct, deploys_per_week, cfr_pct, rework_pct, ai_pr_review_pct, agent_completion_pct, human_intervention_pct, autonomy_pct, predictability_pct, cost_improvement_pct` — the last one NULL here, it lives in manual inputs and is computed by consumers).

- [ ] **Step 1: Write the failing test**

Create `tests/test_views.py`:

```python
from datetime import date
import psycopg2
from collector.db import upsert_counts


def test_metrics_ratios_view(pg_url):
    upsert_counts(pg_url, "P-View", "sprint", "S1", date(2026, 6, 29), date(2026, 7, 13), {
        "ai_prs": 3, "total_prs": 10, "deploys": 4, "weeks": 2.0, "incidents": 1,
        "agent_prs_total": 2, "agent_prs_merged": 2, "agent_prs_human_fixed": 1,
        "agent_prs_autonomous": 1, "ai_prs_reviewed": 3,
        "sprint_committed": 10, "sprint_completed": 8,
    })
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT ai_pr_pct, deploys_per_week, cfr_pct, autonomy_pct,
                   ai_pr_review_pct, predictability_pct
            FROM reporting.metrics_ratios
            WHERE project = 'P-View' AND period_key = 'S1'
        """)
        row = cur.fetchone()
    assert [round(float(v), 2) for v in row] == [30.0, 2.0, 25.0, 50.0, 100.0, 80.0]


def test_metrics_wide_null_for_missing_metrics(pg_url):
    upsert_counts(pg_url, "P-View2", "month", "2026-06", date(2026, 6, 1), date(2026, 6, 30),
                  {"total_prs": 5})
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT total_prs, ai_prs, lead_time_h FROM reporting.metrics_wide
            WHERE project = 'P-View2' AND period_key = '2026-06'
        """)
        total, ai, lead = cur.fetchone()
    assert float(total) == 5 and ai is None and lead is None
```

- [ ] **Step 2: Update `tests/conftest.py` to apply views**

In the `pg_url` fixture, replace the single-file execution with both files:

```python
        conn = psycopg2.connect(url)
        base = os.path.join(os.path.dirname(__file__), "..", "infra", "db")
        with conn.cursor() as cur:
            for sql_file in ("init.sql", "views.sql"):
                with open(os.path.join(base, sql_file)) as f:
                    cur.execute(f.read())
        conn.commit()
        conn.close()
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `python -m pytest tests/test_views.py -v`
Expected: ERROR (views.sql missing) or FAIL (relation does not exist)

- [ ] **Step 4: Create `infra/db/views.sql`**

```sql
-- Read-time layer over metric_counts: consumers (Grafana, exporter) read these
-- views; ratios are never stored. Apply after init.sql:
--   psql "$REPORTING_DB_URL" -f infra/db/views.sql

CREATE OR REPLACE VIEW reporting.metrics_wide AS
SELECT
  project, period_type, period_key,
  min(period_start) AS period_start,
  max(period_end)   AS period_end,
  max(value) FILTER (WHERE metric_key = 'ai_users_weekly_avg')   AS ai_users_weekly_avg,
  max(value) FILTER (WHERE metric_key = 'ai_prs')                AS ai_prs,
  max(value) FILTER (WHERE metric_key = 'total_prs')             AS total_prs,
  max(value) FILTER (WHERE metric_key = 'agent_tasks')           AS agent_tasks,
  max(value) FILTER (WHERE metric_key = 'ai_tasks')              AS ai_tasks,
  max(value) FILTER (WHERE metric_key = 'total_tasks')           AS total_tasks,
  max(value) FILTER (WHERE metric_key = 'lead_time_h')           AS lead_time_h,
  max(value) FILTER (WHERE metric_key = 'deploys')               AS deploys,
  max(value) FILTER (WHERE metric_key = 'weeks')                 AS weeks,
  max(value) FILTER (WHERE metric_key = 'incidents')             AS incidents,
  max(value) FILTER (WHERE metric_key = 'mttr_h')                AS mttr_h,
  max(value) FILTER (WHERE metric_key = 'rework_prs')            AS rework_prs,
  max(value) FILTER (WHERE metric_key = 'ai_prs_reviewed')       AS ai_prs_reviewed,
  max(value) FILTER (WHERE metric_key = 'security_alerts')       AS security_alerts,
  max(value) FILTER (WHERE metric_key = 'agent_prs_total')       AS agent_prs_total,
  max(value) FILTER (WHERE metric_key = 'agent_prs_merged')      AS agent_prs_merged,
  max(value) FILTER (WHERE metric_key = 'agent_prs_human_fixed') AS agent_prs_human_fixed,
  max(value) FILTER (WHERE metric_key = 'agent_prs_autonomous')  AS agent_prs_autonomous,
  max(value) FILTER (WHERE metric_key = 'agent_cycle_h')         AS agent_cycle_h,
  max(value) FILTER (WHERE metric_key = 'sprint_committed')      AS sprint_committed,
  max(value) FILTER (WHERE metric_key = 'sprint_completed')      AS sprint_completed
FROM reporting.metric_counts
GROUP BY project, period_type, period_key;

CREATE OR REPLACE VIEW reporting.metrics_ratios AS
SELECT
  w.*,
  100.0 * ai_prs               / NULLIF(total_prs, 0)        AS ai_pr_pct,
  100.0 * agent_tasks          / NULLIF(total_tasks, 0)      AS agent_task_pct,
  100.0 * ai_tasks             / NULLIF(total_tasks, 0)      AS ai_task_pct,
  deploys                      / NULLIF(weeks, 0)            AS deploys_per_week,
  100.0 * incidents            / NULLIF(deploys, 0)          AS cfr_pct,
  100.0 * rework_prs           / NULLIF(total_prs, 0)        AS rework_pct,
  100.0 * ai_prs_reviewed      / NULLIF(ai_prs, 0)           AS ai_pr_review_pct,
  100.0 * agent_prs_merged     / NULLIF(agent_prs_total, 0)  AS agent_completion_pct,
  100.0 * agent_prs_human_fixed / NULLIF(agent_prs_total, 0) AS human_intervention_pct,
  100.0 * agent_prs_autonomous / NULLIF(agent_prs_total, 0)  AS autonomy_pct,
  100.0 * sprint_completed     / NULLIF(sprint_committed, 0) AS predictability_pct
FROM reporting.metrics_wide w;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_views.py tests/test_db.py -v`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add infra/db/views.sql tests/conftest.py tests/test_views.py
git commit -m "feat: metrics_wide and metrics_ratios read-time views"
```

---

### Task 2: Dashboard generator

**Files:**
- Create: `infra/grafana/projects.json`
- Create: `infra/grafana/generate.py`
- Create: `tests/test_dashboards.py`
- Modify: `infra/grafana/provisioning/dashboards/default.yml`
- Delete: `infra/grafana/dashboards/ai-sdlc-team.json`, `infra/grafana/dashboards/ai-sdlc-bod.json`

**Interfaces:**
- Consumes: `reporting.metrics_ratios`, `reporting.manual_inputs` (Task 1 / Plan 1), datasource uid `reporting-postgres`.
- Produces: `infra/grafana/dashboards/<Project>/project.json` per project and `infra/grafana/dashboards/BOD/portfolio.json`; importable `build_project_dashboard(project: str) -> dict` and `build_bod_dashboard(projects: list[str]) -> dict`.

- [ ] **Step 1: Create `infra/grafana/projects.json`**

```json
{
  "projects": [
    {"name": "Future", "pm_login": "pm-future", "pm_email": "pm-future@seta-international.vn"}
  ],
  "bod_viewers": [
    {"login": "bod-viewer", "email": "bod@seta-international.vn"}
  ]
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/test_dashboards.py`:

```python
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GRAFANA = ROOT / "infra" / "grafana"


def _generate(tmp_path):
    subprocess.run(
        [sys.executable, str(GRAFANA / "generate.py"), "--out", str(tmp_path)],
        check=True, cwd=ROOT,
    )
    return tmp_path


def test_generates_project_and_bod_dashboards(tmp_path):
    out = _generate(tmp_path)
    proj = json.loads((out / "Future" / "project.json").read_text())
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    assert proj["title"] == "AI SDLC — Future"
    assert bod["title"] == "AI SDLC — Portfolio (BOD)"
    assert proj["uid"] == "ai-sdlc-future"


def test_project_dashboard_is_pinned_and_reads_views(tmp_path):
    out = _generate(tmp_path)
    raw = (out / "Future" / "project.json").read_text()
    assert "metrics_ratios" in raw
    assert "ai_sprint_metrics" not in raw
    assert "project = 'Future'" in raw
    proj = json.loads(raw)
    var_names = [v["name"] for v in proj["templating"]["list"]]
    assert var_names == ["sprint"]  # project pinned, no project variable


def test_all_panel_sql_targets_reporting_schema(tmp_path):
    out = _generate(tmp_path)
    for f in out.rglob("*.json"):
        d = json.loads(f.read_text())
        for p in d["panels"]:
            for t in p.get("targets", []):
                assert "reporting." in t["rawSql"], f"{f.name}: {p['title']}"
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `python -m pytest tests/test_dashboards.py -v`
Expected: FAIL (generate.py missing)

- [ ] **Step 4: Implement `infra/grafana/generate.py`**

```python
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
```

- [ ] **Step 5: Update provisioning + delete dead dashboards**

Replace `infra/grafana/provisioning/dashboards/default.yml` with:

```yaml
apiVersion: 1

providers:
  - name: default
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
      foldersFromFilesStructure: true
```

Then:

```bash
git rm infra/grafana/dashboards/ai-sdlc-team.json infra/grafana/dashboards/ai-sdlc-bod.json
python3 infra/grafana/generate.py
```

Expected: `wrote .../dashboards/Future/project.json` and `wrote .../dashboards/BOD/portfolio.json`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `python -m pytest tests/test_dashboards.py -v`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add infra/grafana tests/test_dashboards.py
git commit -m "feat: generated per-project and BOD dashboards on metrics views"
```

---

### Task 3: Access setup script (PM viewer accounts + folder permissions)

**Files:**
- Create: `infra/grafana/setup_access.py`
- Create: `tests/test_setup_access.py`

**Interfaces:**
- Consumes: `infra/grafana/projects.json` (Task 2), Grafana admin HTTP API.
- Produces: importable `plan_permissions(config: dict, folder_uids: dict[str, str], user_ids: dict[str, int]) -> dict[str, list[dict]]` (folder uid → permission items; pure, unit-tested) and CLI `python infra/grafana/setup_access.py --base http://localhost:3030 --admin-password ... --pm-password ...` (idempotent; creates users if missing, replaces folder permissions).

- [ ] **Step 1: Write the failing test**

Create `tests/test_setup_access.py`:

```python
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "infra" / "grafana"))
from setup_access import plan_permissions  # noqa: E402

CONFIG = {
    "projects": [{"name": "Future", "pm_login": "pm-future", "pm_email": "x@y"}],
    "bod_viewers": [{"login": "bod-viewer", "email": "b@y"}],
}


def test_plan_permissions_isolates_folders():
    plans = plan_permissions(
        CONFIG,
        folder_uids={"Future": "uid-fut", "BOD": "uid-bod"},
        user_ids={"pm-future": 11, "bod-viewer": 22},
    )
    assert plans["uid-fut"] == [{"userId": 11, "permission": 1}]
    assert plans["uid-bod"] == [{"userId": 22, "permission": 1}]


def test_plan_permissions_skips_missing_folder():
    plans = plan_permissions(CONFIG, folder_uids={"BOD": "uid-bod"},
                             user_ids={"pm-future": 11, "bod-viewer": 22})
    assert list(plans) == ["uid-bod"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_setup_access.py -v`
Expected: FAIL with ImportError

- [ ] **Step 3: Implement `infra/grafana/setup_access.py`**

```python
#!/usr/bin/env python3
"""
Create PM viewer accounts and lock Grafana folder permissions so each PM sees
only their own project folder; BOD viewers see only the BOD folder. Org Admins
always keep full access. Idempotent — safe to re-run after onboarding a project.

  python infra/grafana/setup_access.py --base http://localhost:3030 \
      --admin-password "$GF_ADMIN_PASSWORD" --pm-password "$PM_INITIAL_PASSWORD"

Uses only Grafana OSS APIs (admin user create, folder permissions).
"""
import argparse
import json
from pathlib import Path
import requests

HERE = Path(__file__).resolve().parent


def plan_permissions(config: dict, folder_uids: dict[str, str],
                     user_ids: dict[str, int]) -> dict[str, list[dict]]:
    """folder uid -> permission items (replaces existing). Pure function."""
    plans: dict[str, list[dict]] = {}
    for proj in config["projects"]:
        uid = folder_uids.get(proj["name"])
        if uid:
            plans[uid] = [{"userId": user_ids[proj["pm_login"]], "permission": 1}]
    bod_uid = folder_uids.get("BOD")
    if bod_uid:
        plans[bod_uid] = [{"userId": user_ids[v["login"]], "permission": 1}
                          for v in config["bod_viewers"]]
    return plans


def ensure_user(s: requests.Session, base: str, login: str, email: str,
                password: str) -> int:
    r = s.get(f"{base}/api/users/lookup", params={"loginOrEmail": login})
    if r.status_code == 200:
        return r.json()["id"]
    r = s.post(f"{base}/api/admin/users",
               json={"name": login, "login": login, "email": email,
                     "password": password})
    r.raise_for_status()
    print(f"created user {login}")
    return r.json()["id"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:3030")
    parser.add_argument("--admin-user", default="admin")
    parser.add_argument("--admin-password", required=True)
    parser.add_argument("--pm-password", required=True,
                        help="Initial password for newly created viewer accounts")
    args = parser.parse_args()

    s = requests.Session()
    s.auth = (args.admin_user, args.admin_password)

    config = json.loads((HERE / "projects.json").read_text())
    accounts = ([(p["pm_login"], p["pm_email"]) for p in config["projects"]]
                + [(v["login"], v["email"]) for v in config["bod_viewers"]])
    user_ids = {login: ensure_user(s, args.base, login, email, args.pm_password)
                for login, email in accounts}

    r = s.get(f"{args.base}/api/folders")
    r.raise_for_status()
    folder_uids = {f["title"]: f["uid"] for f in r.json()}

    for uid, items in plan_permissions(config, folder_uids, user_ids).items():
        r = s.post(f"{args.base}/api/folders/{uid}/permissions",
                   json={"items": items})
        r.raise_for_status()
        print(f"locked folder {uid}: {items}")

    missing = [p["name"] for p in config["projects"]
               if p["name"] not in folder_uids]
    if missing:
        print(f"WARNING: folders not found (provisioning not loaded yet?): {missing}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_setup_access.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add infra/grafana/setup_access.py tests/test_setup_access.py
git commit -m "feat: Grafana PM viewer accounts and folder permission script"
```

---

### Task 4: Live verification + housekeeping

**Files:**
- Modify: `infra/docker/compose.yml` (comment only: `reporting.ai_sprint_metrics` → `reporting.metric_counts` views)

- [ ] **Step 1: Apply views to the real database**

```bash
psql "$REPORTING_DB_URL" -f infra/db/views.sql
psql "$REPORTING_DB_URL" -c "SELECT project, period_key, ai_pr_pct FROM reporting.metrics_ratios WHERE period_type='sprint' ORDER BY period_start DESC LIMIT 5;"
```

Expected: rows for Future's collected sprints with computed percentages.

- [ ] **Step 2: Update the stale compose comment and restart the stack**

In `infra/docker/compose.yml`, change the header comment's `reporting.ai_sprint_metrics table` to `reporting.metric_counts (via metrics_wide/metrics_ratios views)`. Then on the Grafana host:

```bash
docker compose -f infra/docker/compose.yml up -d --force-recreate grafana
```

- [ ] **Step 3: Verify dashboards render**

Open `https://ai-metrics.seta-international.com` as admin. Expected: folders `Future` and `BOD` with English dashboards, live numbers on Future's current sprint (blank panels only where a metric has no data yet).

- [ ] **Step 4: Run access setup and verify isolation**

```bash
python3 infra/grafana/setup_access.py --admin-password "$GF_ADMIN_PASSWORD" --pm-password "$PM_INITIAL_PASSWORD"
curl -s -u pm-future:"$PM_INITIAL_PASSWORD" http://localhost:3030/api/search | python3 -m json.tool
```

Expected: the PM account's search returns only the `Future` folder's dashboard — no BOD, no other projects.

- [ ] **Step 5: Commit**

```bash
git add infra/docker/compose.yml
git commit -m "chore: point compose docs at metric views; verified dashboards live"
```

---

## Not in this plan

- Plan 4: English workbook template + FastAPI exporter + Grafana "Download Excel" links (link panels will be added to the generator's sections then).
- TeacherZone: when config arrives — add one entry to `projects.json`, re-run `generate.py` + `setup_access.py`.
