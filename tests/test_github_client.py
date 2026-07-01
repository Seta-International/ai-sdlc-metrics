import responses as rsps_lib
import pytest
from datetime import datetime, timezone
from collector.github_client import GitHubClient

SINCE = datetime(2026, 6, 30, tzinfo=timezone.utc)
UNTIL = datetime(2026, 7, 13, 23, 59, tzinfo=timezone.utc)
BASE = "https://api.github.com"
REPO = "seta-international/agent-platform"

@rsps_lib.activate
def test_get_merged_prs_returns_prs_in_window():
    rsps_lib.add(rsps_lib.GET, f"{BASE}/repos/{REPO}/pulls", json=[
        {
            "number": 1, "title": "Add feature",
            "merged_at": "2026-07-01T10:00:00Z",
            "created_at": "2026-07-01T08:00:00Z",
            "labels": [{"name": "ai-assisted"}],
        },
        {
            "number": 2, "title": "Fix bug",
            "merged_at": "2026-06-28T10:00:00Z",  # before window
            "created_at": "2026-06-28T08:00:00Z",
            "labels": [],
        },
    ], status=200)

    client = GitHubClient("fake-token", REPO)
    prs = client.get_merged_prs(SINCE, UNTIL)
    assert len(prs) == 1
    assert prs[0]["number"] == 1

@rsps_lib.activate
def test_get_merged_prs_excludes_unmerged():
    rsps_lib.add(rsps_lib.GET, f"{BASE}/repos/{REPO}/pulls", json=[
        {"number": 3, "title": "Draft", "merged_at": None, "created_at": "2026-07-01T08:00:00Z", "labels": []},
    ], status=200)

    client = GitHubClient("fake-token", REPO)
    prs = client.get_merged_prs(SINCE, UNTIL)
    assert prs == []

@rsps_lib.activate
def test_get_code_scanning_alerts_returns_404_gracefully():
    rsps_lib.add(rsps_lib.GET, f"{BASE}/repos/{REPO}/code-scanning/alerts", status=404)

    client = GitHubClient("fake-token", REPO)
    alerts = client.get_code_scanning_alerts(SINCE, UNTIL)
    assert alerts == []

@rsps_lib.activate
def test_get_code_scanning_alerts_returns_403_gracefully():
    rsps_lib.add(rsps_lib.GET, f"{BASE}/repos/{REPO}/code-scanning/alerts", status=403)

    client = GitHubClient("fake-token", REPO)
    alerts = client.get_code_scanning_alerts(SINCE, UNTIL)
    assert alerts == []

@rsps_lib.activate
def test_get_pr_returns_metadata():
    rsps_lib.add(rsps_lib.GET, f"{BASE}/repos/{REPO}/pulls/7", json={
        "number": 7, "title": "feat(planner): FUT-123 add thing",
        "body": "AI time saved (hours): 2", "labels": [{"name": "ai-assisted"}],
        "head": {"ref": "feat/FUT-123-add-thing"},
    }, status=200)

    client = GitHubClient("fake-token", REPO)
    pr = client.get_pr(7)
    assert pr["title"] == "feat(planner): FUT-123 add thing"
    assert pr["head"]["ref"] == "feat/FUT-123-add-thing"

@rsps_lib.activate
def test_get_deployments_filters_by_env():
    rsps_lib.add(rsps_lib.GET, f"{BASE}/repos/{REPO}/deployments", json=[
        {"id": 1, "environment": "production", "created_at": "2026-07-02T12:00:00Z"},
    ], status=200)

    client = GitHubClient("fake-token", REPO)
    deploys = client.get_deployments("production", SINCE, UNTIL)
    assert len(deploys) == 1
