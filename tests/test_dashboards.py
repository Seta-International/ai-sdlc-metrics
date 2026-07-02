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
