from base64 import b64encode
from datetime import datetime, timedelta
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
        page_token = None
        while True:
            params = {"jql": jql, "maxResults": 100, "fields": ",".join(fields)}
            if page_token:
                params["nextPageToken"] = page_token
            r = self._s.get(f"{self._base}/rest/api/3/search/jql", params=params)
            r.raise_for_status()
            data = r.json()
            issues.extend(data["issues"])
            if data.get("isLast", True):
                break
            page_token = data["nextPageToken"]
        return issues

    def get_closed_issues(self, since: datetime, until: datetime,
                          extra_fields: tuple[str, ...] = ()) -> list[dict]:
        """All issues transitioned to Done in [since, until] AND still
        currently sitting in Done (not e.g. later moved to Cancel) - an issue
        that passed through Done and was then cancelled didn't ship, so its
        AI-usage/time-saved credit shouldn't count.

        JQL AFTER/BEFORE are exclusive of the named calendar day, so widen the
        bounds by a day: `after` = day before `since` (include the first day),
        `before` = day after the last day with any part in the window. `since`
        is always a midnight start; `until` may be a midnight exclusive upper
        bound (completed period → its own day stays excluded, no double count)
        or a mid-day 'now' (current period → today is included)."""
        after = since.date() - timedelta(days=1)
        before = (until - timedelta(microseconds=1)).date() + timedelta(days=1)
        jql = (
            f'project = {self._project} AND status changed to Done '
            f'AFTER "{after:%Y-%m-%d}" BEFORE "{before:%Y-%m-%d}" AND status = "Done"'
        )
        fields = [self._ai_usage_field, "assignee", "resolutiondate", *extra_fields]
        return self._jql_all(jql, fields)

    def get_incidents(self, since: datetime, until: datetime) -> list[dict]:
        """Incident issues created in [since, until]."""
        jql = (
            f'project = {self._project} AND issuetype = Incident '
            f'AND created >= "{since.strftime("%Y-%m-%d")}" '
            f'AND created <= "{until.strftime("%Y-%m-%d")}"'
        )
        return self._jql_all(jql, ["created", "resolutiondate"])

    def get_issue_fields(self, key: str, fields: list[str]) -> dict:
        """Current values of the given fields on one issue."""
        r = self._s.get(f"{self._base}/rest/api/3/issue/{key}", params={"fields": ",".join(fields)})
        r.raise_for_status()
        return r.json()["fields"]

    def update_issue_fields(self, key: str, fields: dict) -> None:
        r = self._s.put(f"{self._base}/rest/api/3/issue/{key}", json={"fields": fields})
        r.raise_for_status()
