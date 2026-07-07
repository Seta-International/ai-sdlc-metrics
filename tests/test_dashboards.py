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
    assert proj["title"] == "AI SDLC: Future"
    assert bod["title"] == "AI SDLC: Portfolio (BOD)"
    assert proj["uid"] == "ai-sdlc-future"


def test_project_dashboard_is_pinned_and_reads_views(tmp_path):
    out = _generate(tmp_path)
    raw = (out / "Future" / "project.json").read_text()
    assert "reporting.v_metrics" in raw
    assert "metrics_ratios" not in raw
    assert "ai_sprint_metrics" not in raw
    assert "project = 'Future'" in raw
    proj = json.loads(raw)
    var_names = [v["name"] for v in proj["templating"]["list"]]
    assert var_names == ["sprint"]  # project pinned, no project variable


def test_usage_uses_fixed_usage_pct(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    sql = json.dumps(future)
    assert "usage_pct" in sql
    assert "usage_rate_pct" not in sql   # legacy proxy retired from the UI


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


def test_sections_config_controls_rows(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    rows = [p["title"] for p in future["panels"] if p["type"] == "row"]
    assert rows[1].startswith("Sprint Steering")
    assert any("Return on Investment" in r for r in rows)
    assert any("Monthly Record" in r for r in rows)


def test_project_has_data_quality_strip_first(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    rows = [p["title"] for p in future["panels"] if p["type"] == "row"]
    assert rows[0].startswith("Data Quality")
    titles = [p.get("title", "") for p in future["panels"]]
    assert "PRs (n)" in titles and "Agent PRs (n)" in titles
    assert any("Freshness" in t for t in titles)


def test_guarded_pct_panels_use_last_reduce(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    guarded = [p for p in future["panels"]
               if p.get("type") == "stat"
               and "< 20 THEN NULL" in json.dumps(p.get("targets", []))]
    assert guarded, "expected at least one n-guarded stat panel"
    for p in guarded:
        # must be 'last' so a NULL current sprint greys, not lastNotNull (which
        # would surface a stale earlier-sprint value as if current)
        assert p["options"]["reduceOptions"]["calcs"] == ["last"], p["title"]


def test_project_has_level_summary(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    titles = [p.get("title", "") for p in future["panels"]]
    assert any("A-E Levels" in t or "A–E Levels" in t for t in titles)
    sql = json.dumps(future)
    assert "lvl_a" in sql and "overall" in sql


def test_tool_breakdown_reads_metric_counts(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    sql = json.dumps(future)
    assert "ai_tasks_tool_" in sql and "metric_counts" in sql


def test_raw_dashboard_per_project(tmp_path):
    out = _generate(tmp_path)
    raw = json.loads((out / "Future" / "raw.json").read_text())
    assert raw["title"] == "AI SDLC: Future (Raw Data)"
    assert raw["uid"] == "ai-sdlc-future-raw"
    body = json.dumps(raw)
    assert "reporting.metric_counts" in body   # the raw collected values
    assert "reporting.manual_inputs" in body   # manual inputs
    assert "project = 'Future'" in body
    # story dashboard links to the raw board and back
    story = json.loads((out / "Future" / "project.json").read_text())
    assert any("ai-sdlc-future-raw" in l["url"] for l in story["links"])
    assert any("/d/ai-sdlc-future" == l["url"] for l in raw["links"])


def test_every_panel_has_a_description(tmp_path):
    # Every non-row panel must carry a description so Grafana renders an
    # info-tooltip explaining the metric.
    out = _generate(tmp_path)
    missing = []
    for f in out.rglob("*.json"):
        d = json.loads(f.read_text())
        for p in d["panels"]:
            if p["type"] == "row":
                continue
            if not p.get("description"):
                missing.append(f"{f.parent.name}/{f.name}: {p.get('title')!r}")
    assert not missing, "panels without description:\n" + "\n".join(missing)


def test_bod_has_roi_and_tools(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    titles = [p.get("title", "") for p in bod["panels"]]
    assert any("AI Net $" in t for t in titles)
    body = json.dumps(bod)
    assert "ai_tasks_tool_" in body            # portfolio tool mix


def test_pct_stats_are_n_guarded(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    sql = json.dumps(future)
    # AI PR % is suppressed below n=20 on n_pr
    assert "< 20 THEN NULL" in sql
    # the n is surfaced in a guarded panel's SQL
    assert "n_pr" in sql


def _all_titles(dash):
    """Every panel title, recursing into row-nested panels."""
    out = []
    for p in dash["panels"]:
        out.append(p.get("title", ""))
        out += [c.get("title", "") for c in p.get("panels", [])]
    return out


def _all_panels(dash):
    """Every panel, recursing into row-nested panels."""
    out = []
    for p in dash["panels"]:
        out.append(p)
        out += p.get("panels", [])
    return out


def test_bod_has_decisions(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    titles = _all_titles(bod)
    assert any("Decisions" in t for t in titles)              # the decision-first section
    body = json.dumps(bod)
    assert "reporting.v_attention" in body


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


def test_bod_section0_decisions_and_attention(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    titles = [p["title"] for p in bod["panels"]]
    assert any("Decision" in t for t in titles)
    assert any("Attention" in t or "Needs" in t for t in titles)
    raw = json.dumps(bod)
    assert "reporting.v_attention" in raw
    assert "/d/ai-sdlc-" in raw          # drill-down link present


def test_bod_section1_roi(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    titles = [p["title"] for p in bod["panels"]]
    assert any("Cumulative" in t and "$" in t for t in titles)
    assert any("Capacity" in t for t in titles)
    raw = json.dumps(bod)
    assert "reporting.v_portfolio_roi" in raw


def test_bod_section2_risk(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    titles = [p["title"] for p in bod["panels"]]
    assert any("Security" in t for t in titles)
    assert any("Governance" in t for t in titles)
    raw = json.dumps(bod)
    assert "security_alerts" in raw
    assert "g2_ai_policy" in raw or "g3_required_review" in raw


def test_bod_section3_paired(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    titles = [p["title"] for p in bod["panels"]]
    assert any("Lead Time" in t for t in titles)
    assert any("Change-Fail" in t or "CFR" in t or "Rework" in t for t in titles)
    assert any("AI vs Non-AI" in t for t in titles)


def test_bod_section4_maturity(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    raw = json.dumps(bod)
    assert "reporting.v_level_distribution" in raw
    assert "reporting.v_penetration" in raw
    titles = [p["title"] for p in bod["panels"]]
    assert any("Maturity" in t or "Level" in t for t in titles)
    assert any("Penetration" in t or "Adoption breadth" in t for t in titles)


def test_bod_is_decision_first_and_has_no_project_rows(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    rows = [p["title"] for p in bod["panels"] if p.get("type") == "row"]
    assert rows == ["Decisions & Attention", "Is it paying off?", "Is it safe?",
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


def test_bod_has_evidence_delta(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    titles = _all_titles(bod)
    assert any("AI vs Non-AI" in t for t in titles)
    sql = json.dumps(bod)
    assert "lead_time_ai_h" in sql and "lead_time_nonai_h" in sql
