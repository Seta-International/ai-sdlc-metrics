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


# ---------------------------------------------------------------------------
# Raw-counts refactor: deploy strategies, secret alerts, PR files
# ---------------------------------------------------------------------------
from datetime import datetime, timezone
import responses
from collector.github_client import GitHubClient

_SINCE = datetime(2026, 7, 1, tzinfo=timezone.utc)
_UNTIL = datetime(2026, 7, 31, tzinfo=timezone.utc)


def _client():
    return GitHubClient("tok", "org/repo")


@responses.activate
def test_secret_scanning_alerts_filtered_by_window():
    responses.get(
        "https://api.github.com/repos/org/repo/secret-scanning/alerts",
        json=[
            {"created_at": "2026-07-10T00:00:00Z"},
            {"created_at": "2026-06-01T00:00:00Z"},
        ],
    )
    assert len(_client().get_secret_scanning_alerts(_SINCE, _UNTIL)) == 1


@responses.activate
def test_secret_scanning_disabled_returns_empty():
    responses.get(
        "https://api.github.com/repos/org/repo/secret-scanning/alerts", status=404
    )
    assert _client().get_secret_scanning_alerts(_SINCE, _UNTIL) == []


@responses.activate
def test_get_pr_files_returns_paths():
    responses.get(
        "https://api.github.com/repos/org/repo/pulls/7/files",
        json=[{"filename": "a.py"}, {"filename": "b/c.ts"}],
    )
    assert _client().get_pr_files(7) == ["a.py", "b/c.ts"]


@responses.activate
def test_deploy_times_strategy_deployments():
    responses.get(
        "https://api.github.com/repos/org/repo/deployments",
        json=[
            {"created_at": "2026-07-05T10:00:00Z"},
            {"created_at": "2026-07-02T10:00:00Z"},
        ],
    )
    times = _client().get_production_deploy_times("deployments", "uat", _SINCE, _UNTIL)
    assert [t.day for t in times] == [2, 5]  # sorted ascending


@responses.activate
def test_deploy_times_strategy_releases():
    responses.get(
        "https://api.github.com/repos/org/repo/releases",
        json=[{"published_at": "2026-07-09T08:00:00Z"}, {"published_at": None}],
    )
    times = _client().get_production_deploy_times("releases", "uat", _SINCE, _UNTIL)
    assert len(times) == 1


@responses.activate
def test_deploy_times_strategy_workflow_runs():
    responses.get(
        "https://api.github.com/repos/org/repo/actions/workflows/deploy.yml/runs",
        json={"workflow_runs": [{"run_started_at": "2026-07-04T09:00:00Z"}]},
    )
    times = _client().get_production_deploy_times(
        "workflow_runs:deploy.yml", "uat", _SINCE, _UNTIL
    )
    assert len(times) == 1


@responses.activate
def test_deploy_times_strategy_tags():
    responses.get(
        "https://api.github.com/repos/org/repo/tags",
        json=[
            {"name": "v1.2.0", "commit": {"url": "https://api.github.com/repos/org/repo/commits/aaa"}},
            {"name": "beta-x", "commit": {"url": "https://api.github.com/repos/org/repo/commits/bbb"}},
        ],
    )
    responses.get(
        "https://api.github.com/repos/org/repo/commits/aaa",
        json={"commit": {"committer": {"date": "2026-07-15T00:00:00Z"}}},
    )
    times = _client().get_production_deploy_times("tags:v*", "uat", _SINCE, _UNTIL)
    assert len(times) == 1  # beta-x never fetched (doesn't match pattern)


def test_unknown_strategy_raises():
    import pytest
    with pytest.raises(ValueError):
        _client().get_production_deploy_times("carrier-pigeon", "uat", _SINCE, _UNTIL)
