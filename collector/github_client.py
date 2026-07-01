from datetime import datetime
from typing import Optional
import requests

class GitHubClient:
    _BASE = "https://api.github.com"

    def __init__(self, token: str, repo: str) -> None:
        self._repo = repo
        self._s = requests.Session()
        self._s.headers.update({
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        })

    def _paginate(self, path: str, params: dict) -> list[dict]:
        results: list[dict] = []
        page = 1
        while True:
            r = self._s.get(f"{self._BASE}{path}", params={**params, "page": page, "per_page": 100})
            r.raise_for_status()
            batch = r.json()
            if not batch:
                break
            results.extend(batch)
            if len(batch) < 100:
                break
            page += 1
        return results

    def get_merged_prs(self, since: datetime, until: datetime) -> list[dict]:
        """All PRs merged within [since, until]."""
        prs = []
        page = 1
        while True:
            r = self._s.get(
                f"{self._BASE}/repos/{self._repo}/pulls",
                params={"state": "closed", "sort": "updated", "direction": "desc",
                        "per_page": 100, "page": page},
            )
            r.raise_for_status()
            batch = r.json()
            if not batch:
                break
            for pr in batch:
                if not pr.get("merged_at"):
                    continue
                merged = datetime.fromisoformat(pr["merged_at"].replace("Z", "+00:00"))
                if merged < since:
                    return prs
                if merged <= until:
                    prs.append(pr)
            if len(batch) < 100:
                break
            page += 1
        return prs

    def get_deployments(self, environment: str, since: datetime, until: datetime) -> list[dict]:
        """Production deployments within [since, until]."""
        deploys = []
        for deploy in self._paginate(f"/repos/{self._repo}/deployments",
                                     {"environment": environment}):
            created = datetime.fromisoformat(deploy["created_at"].replace("Z", "+00:00"))
            if since <= created <= until:
                deploys.append(deploy)
        return deploys

    def get_code_scanning_alerts(self, since: datetime, until: datetime) -> list[dict]:
        """Code scanning alerts created within [since, until]. Returns [] if scanning not enabled."""
        r = self._s.get(
            f"{self._BASE}/repos/{self._repo}/code-scanning/alerts",
            params={"per_page": 100, "state": "open"},
        )
        if r.status_code in (403, 404):
            # 404 = code scanning never configured; 403 = no GitHub Advanced
            # Security license on this private repo. Both mean "no alerts to report".
            return []
        r.raise_for_status()
        alerts = r.json()
        return [
            a for a in alerts
            if since <= datetime.fromisoformat(a["created_at"].replace("Z", "+00:00")) <= until
        ]

    def get_pr_commits(self, pr_number: int) -> list[dict]:
        """Commits on a PR with author login info."""
        r = self._s.get(
            f"{self._BASE}/repos/{self._repo}/pulls/{pr_number}/commits",
            params={"per_page": 100},
        )
        r.raise_for_status()
        return r.json()
