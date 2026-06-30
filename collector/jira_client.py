from base64 import b64encode
from datetime import datetime
import requests

class JiraClient:
    def __init__(self, base_url: str, email: str, token: str,
                 project: str, ai_usage_field: str) -> None:
        self._base = base_url.rstrip("/")
        self._project = project
        self._ai_usage_field = ai_usage_field
        creds = b64encode(f"{email}:{token}".encode()).decode()
        self._s = requests.Session()
        self._s.headers.update({
            "Authorization": f"Basic {creds}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        })

    def _jql_all(self, jql: str, fields: list[str]) -> list[dict]:
        issues: list[dict] = []
        start = 0
        while True:
            r = self._s.get(
                f"{self._base}/rest/api/3/search",
                params={"jql": jql, "startAt": start, "maxResults": 100,
                        "fields": ",".join(fields)},
            )
            r.raise_for_status()
            data = r.json()
            issues.extend(data["issues"])
            start += len(data["issues"])
            if start >= data["total"]:
                break
        return issues

    def get_closed_issues(self, since: datetime, until: datetime) -> list[dict]:
        """All issues transitioned to Done in [since, until]."""
        jql = (
            f'project = {self._project} AND status changed to Done '
            f'AFTER "{since.strftime("%Y-%m-%d")}" '
            f'BEFORE "{until.strftime("%Y-%m-%d")}"'
        )
        return self._jql_all(jql, [self._ai_usage_field])

    def get_incidents(self, since: datetime, until: datetime) -> list[dict]:
        """Incident issues created in [since, until]."""
        jql = (
            f'project = {self._project} AND issuetype = Incident '
            f'AND created >= "{since.strftime("%Y-%m-%d")}" '
            f'AND created <= "{until.strftime("%Y-%m-%d")}"'
        )
        return self._jql_all(jql, ["created", "resolutiondate", "customfield_caused_by_deploy"])
