import fnmatch
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
        """All PRs merged within [since, until].

        Uses the Search API's `merged:` date filter rather than paginating
        `/pulls` sorted by `updated` with an early-exit on `merged < since`:
        `updated` (last activity — a comment, CI rerun, label change) isn't
        monotonic with `merged_at`, so a PR merged in-window but not touched
        since sorts below a stale PR that was recently commented on, and the
        early exit drops it silently. Confirmed on a real repo: 190+ actually
        in-window PRs were being missed this way."""
        q = f"repo:{self._repo} is:pr is:merged merged:{since:%Y-%m-%d}..{until:%Y-%m-%d}"
        numbers = []
        page = 1
        while True:
            r = self._s.get(f"{self._BASE}/search/issues",
                             params={"q": q, "per_page": 100, "page": page})
            r.raise_for_status()
            items = r.json()["items"]
            numbers.extend(item["number"] for item in items)
            if len(items) < 100:
                break
            page += 1
        return [self.get_pr(n) for n in numbers]

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

    def get_pr(self, pr_number: int) -> dict:
        """A single PR's metadata (title, body, labels, head branch, ...)."""
        r = self._s.get(f"{self._BASE}/repos/{self._repo}/pulls/{pr_number}")
        r.raise_for_status()
        return r.json()

    def get_pr_commits(self, pr_number: int) -> list[dict]:
        """Commits on a PR with author login info."""
        r = self._s.get(
            f"{self._BASE}/repos/{self._repo}/pulls/{pr_number}/commits",
            params={"per_page": 100},
        )
        r.raise_for_status()
        return r.json()

    def get_secret_scanning_alerts(self, since: datetime, until: datetime) -> list[dict]:
        """Secret scanning alerts created within [since, until]. [] if not enabled."""
        r = self._s.get(
            f"{self._BASE}/repos/{self._repo}/secret-scanning/alerts",
            params={"per_page": 100, "state": "open"},
        )
        if r.status_code in (403, 404):
            return []
        r.raise_for_status()
        return [
            a for a in r.json()
            if since <= datetime.fromisoformat(a["created_at"].replace("Z", "+00:00")) <= until
        ]

    def get_pr_files(self, pr_number: int) -> list[dict]:
        """Changed files on a PR: filename plus line counts (for PR-size metrics)."""
        files = self._paginate(f"/repos/{self._repo}/pulls/{pr_number}/files", {})
        return [{"filename": f["filename"],
                 "additions": f.get("additions", 0),
                 "deletions": f.get("deletions", 0)} for f in files]

    def get_pr_reviews(self, pr_number: int) -> list[dict]:
        """Submitted reviews on a PR (state, submitted_at)."""
        return self._paginate(f"/repos/{self._repo}/pulls/{pr_number}/reviews", {})

    def get_production_deploy_times(self, strategy: str, environment: str,
                                    since: datetime, until: datetime) -> list[datetime]:
        """Production deploy timestamps in [since, until], sorted ascending.
        Strategy is per-project config so every CI/CD style can be counted:
        'deployments' | 'releases' | 'tags:<pattern>' | 'workflow_runs:<file>'.
        For 'deployments', `environment` may be a comma-separated list (e.g.
        'dev,uat') to union deploys across several GitHub Environments."""
        def _dt(s: str) -> datetime:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))

        if strategy == "deployments":
            times = [
                _dt(d["created_at"])
                for env in (e.strip() for e in environment.split(",") if e.strip())
                for d in self.get_deployments(env, since, until)
            ]
        elif strategy == "releases":
            times = [
                _dt(r["published_at"])
                for r in self._paginate(f"/repos/{self._repo}/releases", {})
                if r.get("published_at") and since <= _dt(r["published_at"]) <= until
            ]
        elif strategy.startswith("workflow_runs:"):
            workflow_file = strategy.split(":", 1)[1]
            r = self._s.get(
                f"{self._BASE}/repos/{self._repo}/actions/workflows/{workflow_file}/runs",
                params={"status": "success", "per_page": 100,
                        "created": f"{since:%Y-%m-%d}..{until:%Y-%m-%d}"},
            )
            r.raise_for_status()
            times = [_dt(run["run_started_at"]) for run in r.json()["workflow_runs"]
                     if since <= _dt(run["run_started_at"]) <= until]
        elif strategy.startswith("tags:"):
            pattern = strategy.split(":", 1)[1]
            times = []
            for tag in self._paginate(f"/repos/{self._repo}/tags", {}):
                if not fnmatch.fnmatch(tag["name"], pattern):
                    continue
                r = self._s.get(tag["commit"]["url"])
                r.raise_for_status()
                when = _dt(r.json()["commit"]["committer"]["date"])
                if since <= when <= until:
                    times.append(when)
        else:
            raise ValueError(f"unknown deploy count strategy: {strategy!r}")
        return sorted(times)

    def file_exists(self, path: str) -> bool:
        r = self._s.get(f"{self._BASE}/repos/{self._repo}/contents/{path}")
        return r.status_code == 200

    def default_branch(self) -> str:
        r = self._s.get(f"{self._BASE}/repos/{self._repo}")
        r.raise_for_status()
        return r.json()["default_branch"]

    def branch_requires_review(self, branch: str) -> bool:
        r = self._s.get(f"{self._BASE}/repos/{self._repo}/branches/{branch}/protection")
        if r.status_code != 200:
            return False
        return bool(r.json().get("required_pull_request_reviews"))

    def security_scanning_status(self) -> tuple[bool, bool]:
        """(code_scanning_enabled, secret_scanning_enabled)."""
        code = self._s.get(
            f"{self._BASE}/repos/{self._repo}/code-scanning/alerts",
            params={"per_page": 1},
        ).status_code == 200
        r = self._s.get(f"{self._BASE}/repos/{self._repo}")
        r.raise_for_status()
        secret = (
            (r.json().get("security_and_analysis") or {})
            .get("secret_scanning", {}).get("status") == "enabled"
        )
        return code, secret
