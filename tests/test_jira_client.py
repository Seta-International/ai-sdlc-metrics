import responses as rsps_lib
import pytest
from datetime import datetime, timezone
from collector.jira_client import JiraClient

SINCE = datetime(2026, 6, 30, tzinfo=timezone.utc)
UNTIL = datetime(2026, 7, 13, 23, 59, tzinfo=timezone.utc)
BASE = "https://all-it.atlassian.net"
FIELD = "customfield_10200"

def make_client():
    return JiraClient(BASE, "user@seta.com", "token", "FUT", FIELD)

@rsps_lib.activate
def test_get_closed_issues_returns_issues():
    rsps_lib.add(rsps_lib.GET, f"{BASE}/rest/api/3/search/jql", json={
        "isLast": True,
        "issues": [{"id": "10001", "fields": {FIELD: {"value": "Assisted"}}}],
    })
    client = make_client()
    issues = client.get_closed_issues(SINCE, UNTIL)
    assert len(issues) == 1
    assert issues[0]["fields"][FIELD]["value"] == "Assisted"

@rsps_lib.activate
def test_get_closed_issues_paginates():
    rsps_lib.add(rsps_lib.GET, f"{BASE}/rest/api/3/search/jql", json={
        "isLast": False, "nextPageToken": "token-page-2",
        "issues": [{"id": "10001", "fields": {FIELD: None}}],
    })
    rsps_lib.add(rsps_lib.GET, f"{BASE}/rest/api/3/search/jql", json={
        "isLast": True,
        "issues": [{"id": "10002", "fields": {FIELD: None}}],
    })
    client = make_client()
    issues = client.get_closed_issues(SINCE, UNTIL)
    assert len(issues) == 2

@rsps_lib.activate
def test_get_incidents_filters_by_type():
    rsps_lib.add(rsps_lib.GET, f"{BASE}/rest/api/3/search/jql", json={
        "isLast": True,
        "issues": [{"id": "20001", "fields": {"created": "2026-07-01T10:00:00.000+0000", "resolutiondate": "2026-07-01T12:00:00.000+0000"}}],
    })
    client = make_client()
    incidents = client.get_incidents(SINCE, UNTIL)
    assert len(incidents) == 1

@rsps_lib.activate
def test_get_issue_fields_returns_fields():
    rsps_lib.add(rsps_lib.GET, f"{BASE}/rest/api/3/issue/FUT-123", json={
        "fields": {FIELD: {"value": "Assisted"}},
    })
    client = make_client()
    fields = client.get_issue_fields("FUT-123", [FIELD])
    assert fields[FIELD]["value"] == "Assisted"

@rsps_lib.activate
def test_update_issue_fields_puts_payload():
    rsps_lib.add(rsps_lib.PUT, f"{BASE}/rest/api/3/issue/FUT-123", status=204)
    client = make_client()
    client.update_issue_fields("FUT-123", {FIELD: {"value": "Agent"}})
    assert len(rsps_lib.calls) == 1
    assert rsps_lib.calls[0].request.url == f"{BASE}/rest/api/3/issue/FUT-123"


# ---------------------------------------------------------------------------
# Raw-counts refactor: assignee/resolution fields + sprint predictability
# ---------------------------------------------------------------------------
from datetime import datetime, timezone
import responses
from collector.jira_client import JiraClient

_SINCE = datetime(2026, 7, 13, tzinfo=timezone.utc)
_UNTIL = datetime(2026, 7, 27, tzinfo=timezone.utc)


def _jc():
    return JiraClient("https://x.atlassian.net", "e@x.com", "tok", "FUT", "customfield_10200")


@responses.activate
def test_closed_issues_request_assignee_and_resolutiondate():
    rsp = responses.get(
        "https://x.atlassian.net/rest/api/3/search/jql",
        json={"issues": [], "isLast": True},
    )
    _jc().get_closed_issues(_SINCE, _UNTIL)
    assert "assignee" in rsp.calls[0].request.params["fields"]
    assert "resolutiondate" in rsp.calls[0].request.params["fields"]


@responses.activate
def test_closed_issues_window_includes_boundary_days():
    # JQL AFTER/BEFORE are exclusive of the named day, so the window must be
    # widened by one day on each side to include work done on the first day
    # (sprint start) and the last day ('now' for the current sprint).
    rsp = responses.get(
        "https://x.atlassian.net/rest/api/3/search/jql",
        json={"issues": [], "isLast": True},
    )
    since = datetime(2026, 6, 29, tzinfo=timezone.utc)
    until = datetime(2026, 7, 2, 14, 0, tzinfo=timezone.utc)  # mid-day 'now'
    _jc().get_closed_issues(since, until)
    jql = rsp.calls[0].request.params["jql"]
    assert 'AFTER "2026-06-28"' in jql   # include the 06-29 start day
    assert 'BEFORE "2026-07-03"' in jql  # include today (07-02)


@responses.activate
def test_closed_issues_window_excludes_exclusive_upper_bound():
    # A completed period's `until` is the next period's midnight start
    # (exclusive) — that day must NOT be pulled in (no double counting).
    rsp = responses.get(
        "https://x.atlassian.net/rest/api/3/search/jql",
        json={"issues": [], "isLast": True},
    )
    since = datetime(2026, 6, 29, tzinfo=timezone.utc)
    until = datetime(2026, 7, 13, tzinfo=timezone.utc)  # next sprint start (midnight)
    _jc().get_closed_issues(since, until)
    jql = rsp.calls[0].request.params["jql"]
    assert 'AFTER "2026-06-28"' in jql    # include 06-29
    assert 'BEFORE "2026-07-13"' in jql   # through 07-12, exclude 07-13


@responses.activate
def test_closed_issues_requests_extra_fields():
    rsp = responses.get(
        "https://x.atlassian.net/rest/api/3/search/jql",
        json={"issues": [], "isLast": True},
    )
    _jc().get_closed_issues(_SINCE, _UNTIL,
                            extra_fields=("customfield_10301", "customfield_10302"))
    fields = rsp.calls[0].request.params["fields"]
    assert "customfield_10301" in fields and "customfield_10302" in fields
