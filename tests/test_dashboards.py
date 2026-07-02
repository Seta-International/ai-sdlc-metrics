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


def test_dashboards_have_download_links(tmp_path):
    out = _generate(tmp_path)
    proj = json.loads((out / "Future" / "project.json").read_text())
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    assert any("export.xlsx?project=Future" in l["url"] for l in proj["links"])
    assert any("project=all" in l["url"] for l in bod["links"])


def test_future_has_no_production_panels(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    titles = [p.get("title", "") for p in future["panels"]]
    assert "Change Failure Rate" not in titles
    assert "Deploys / Week" not in titles
    assert any("Merge Lead Time" in t for t in titles)


def test_teacherzone_keeps_production_panels(tmp_path):
    out = _generate(tmp_path)
    tz = json.loads((out / "TeacherZone" / "project.json").read_text())
    titles = [p.get("title", "") for p in tz["panels"]]
    assert "Change Failure Rate" in titles


def test_config_literals_embedded_in_sql(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    sql = json.dumps(future)
    assert "ai_time_saved_h * 12" in sql          # blended rate literal
    assert ">= 80" in sql and ">= 50" in sql      # maturity gate thresholds


def test_sections_config_controls_rows(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    rows = [p["title"] for p in future["panels"] if p["type"] == "row"]
    assert rows[0].startswith("Sprint Steering")
    assert any("paying off" in r for r in rows)
    assert any("Monthly Record" in r for r in rows)


def test_tool_breakdown_reads_metric_counts(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    sql = json.dumps(future)
    assert "ai_tasks_tool_" in sql and "metric_counts" in sql


def test_bod_has_roi_and_stage(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    titles = [p.get("title", "") for p in bod["panels"]]
    assert any("AI Net $" in t for t in titles)
    body = json.dumps(bod)
    assert "\"Stage\"" in body                 # scorecard stage column
    assert "ai_tasks_tool_" in body            # portfolio tool mix
