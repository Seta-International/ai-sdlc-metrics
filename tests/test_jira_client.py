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
    rsps_lib.add(rsps_lib.GET, f"{BASE}/rest/api/3/search", json={
        "total": 1, "startAt": 0, "maxResults": 100,
        "issues": [{"id": "10001", "fields": {FIELD: {"value": "Có hỗ trợ"}}}],
    })
    client = make_client()
    issues = client.get_closed_issues(SINCE, UNTIL)
    assert len(issues) == 1
    assert issues[0]["fields"][FIELD]["value"] == "Có hỗ trợ"

@rsps_lib.activate
def test_get_closed_issues_paginates():
    rsps_lib.add(rsps_lib.GET, f"{BASE}/rest/api/3/search", json={
        "total": 2, "startAt": 0, "maxResults": 100,
        "issues": [{"id": "10001", "fields": {FIELD: None}}, {"id": "10002", "fields": {FIELD: None}}],
    })
    client = make_client()
    issues = client.get_closed_issues(SINCE, UNTIL)
    assert len(issues) == 2

@rsps_lib.activate
def test_get_incidents_filters_by_type():
    rsps_lib.add(rsps_lib.GET, f"{BASE}/rest/api/3/search", json={
        "total": 1, "startAt": 0, "maxResults": 100,
        "issues": [{"id": "20001", "fields": {"created": "2026-07-01T10:00:00.000+0000", "resolutiondate": "2026-07-01T12:00:00.000+0000", "customfield_caused_by_deploy": None}}],
    })
    client = make_client()
    incidents = client.get_incidents(SINCE, UNTIL)
    assert len(incidents) == 1
