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

    def get_closed_issues(self, since: datetime, until: datetime) -> list[dict]:
        """All issues transitioned to Done in [since, until]."""
        jql = (
            f'project = {self._project} AND status changed to Done '
            f'AFTER "{since.strftime("%Y-%m-%d")}" '
            f'BEFORE "{until.strftime("%Y-%m-%d")}"'
        )
        return self._jql_all(jql, [self._ai_usage_field, "assignee", "resolutiondate"])

    def get_incidents(self, since: datetime, until: datetime) -> list[dict]:
        """Incident issues created in [since, until]."""
        jql = (
            f'project = {self._project} AND issuetype = Incident '
            f'AND created >= "{since.strftime("%Y-%m-%d")}" '
            f'AND created <= "{until.strftime("%Y-%m-%d")}"'
        )
        return self._jql_all(jql, ["created", "resolutiondate"])

    def resolve_board_id(self) -> str | None:
        """First sprint-capable board attached to this Jira project; None when
        the project has none (or the Agile API is unavailable). Lets sprint
        predictability work without a JIRA_BOARD_ID env var. Company-managed
        scrum boards are type 'scrum'; team-managed project boards are 'simple'."""
        r = self._s.get(
            f"{self._base}/rest/agile/1.0/board",
            params={"projectKeyOrId": self._project, "maxResults": 50},
        )
        if not r.ok:
            return None
        for board in r.json().get("values", []):
            if board.get("type") in ("scrum", "simple"):
                return str(board["id"])
        return None

    def get_sprint_issue_counts(self, board_id: str, since: datetime,
                                until: datetime) -> tuple[int, int] | None:
        """(committed, completed) for the board sprint overlapping [since, until]
        the most; None when no sprint overlaps. Used for sprint predictability."""
        def _dt(s: str) -> datetime:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))

        sprints, start_at = [], 0
        while True:
            r = self._s.get(
                f"{self._base}/rest/agile/1.0/board/{board_id}/sprint",
                params={"state": "active,closed", "startAt": start_at, "maxResults": 50},
            )
            r.raise_for_status()
            data = r.json()
            sprints.extend(data["values"])
            if data.get("isLast", True):
                break
            start_at += len(data["values"])

        def overlap(s: dict) -> float:
            if not s.get("startDate") or not s.get("endDate"):
                return 0.0
            lo = max(_dt(s["startDate"]), since)
            hi = min(_dt(s["endDate"]), until)
            return max(0.0, (hi - lo).total_seconds())

        best = max(sprints, key=overlap, default=None)
        if best is None or overlap(best) <= 0:
            return None

        issues, start_at = [], 0
        while True:
            r = self._s.get(
                f"{self._base}/rest/agile/1.0/sprint/{best['id']}/issue",
                params={"fields": "resolution", "startAt": start_at, "maxResults": 100},
            )
            r.raise_for_status()
            data = r.json()
            issues.extend(data["issues"])
            if start_at + len(data["issues"]) >= data.get("total", 0) or not data["issues"]:
                break
            start_at += len(data["issues"])

        committed = len(issues)
        completed = sum(1 for i in issues if i["fields"].get("resolution"))
        return committed, completed

    def get_issue_fields(self, key: str, fields: list[str]) -> dict:
        """Current values of the given fields on one issue."""
        r = self._s.get(f"{self._base}/rest/api/3/issue/{key}", params={"fields": ",".join(fields)})
        r.raise_for_status()
        return r.json()["fields"]

    def update_issue_fields(self, key: str, fields: dict) -> None:
        r = self._s.put(f"{self._base}/rest/api/3/issue/{key}", json={"fields": fields})
        r.raise_for_status()
