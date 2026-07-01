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
