# Collector Raw-Counts Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ratio-per-sprint metrics pipeline with a raw-count schema (`metric_counts` + `manual_inputs`), a sprint/month window abstraction, and five new automated metrics (lead time merge→deploy, rework ≤14d, weekly AI users, secret alerts, sprint predictability).

**Architecture:** Clean refactor per `docs/superpowers/specs/2026-07-02-maturity-data-capture-design.md` — no back-compat. The collector fetches from GitHub/Jira, computes **raw counts** (one row per metric key), and upserts into `reporting.metric_counts` keyed by (project, period_type, period_key, metric_key). Ratios are computed at read time by consumers (Grafana/exporter — later plans). Deployment counting is a per-project strategy (`deployments` | `releases` | `tags:<pattern>` | `workflow_runs:<file>`) that always yields a list of deploy timestamps.

**Tech Stack:** Python 3.12, requests, psycopg2, pytest + responses (HTTP mocks) + testcontainers (Postgres).

**Plan 1 of 4.** Later plans (separate documents): reusable GitHub workflows + onboarding; Grafana rebuild; Excel exporter. This plan intentionally breaks the old caller workflow's `--a1/--b5/--c3` flags — Plan 2 replaces the callers.

## Global Constraints

- Clean refactor: delete replaced code; no legacy columns, flags, or dual paths.
- All new code, comments, and outputs in English.
- Storage refinement of the spec: `metric_counts` stores a single `value` per `metric_key` (a denominator is just another metric row, e.g. `total_prs`) — simpler than numerator/denominator columns and strictly equivalent.
- Canonical metric keys (the only keys ever written):
  `ai_users_weekly_avg, ai_prs, total_prs, agent_tasks, ai_tasks, total_tasks, lead_time_h, deploys, weeks, incidents, mttr_h, rework_prs, ai_prs_reviewed, security_alerts, agent_prs_total, agent_prs_merged, agent_prs_human_fixed, agent_prs_autonomous, agent_cycle_h, sprint_committed, sprint_completed`
- PR label conventions (existing): `ai-assisted` = AI-assisted PR, `ai-agent` = agent-authored PR. Jira AI-usage field values: `None | Assisted | Agent` (string `"None"` means no AI).
- Run tests with `python -m pytest` from the repo root.

---

### Task 1: Schema + DB upserts (`metric_counts`, `manual_inputs`)

**Files:**
- Modify: `infra/db/init.sql` (full rewrite)
- Modify: `collector/db.py` (full rewrite)
- Modify: `tests/test_db.py` (full rewrite)

**Interfaces:**
- Produces: `upsert_counts(db_url: str, project: str, period_type: str, period_key: str, period_start: date, period_end: date, counts: dict[str, float | int | None]) -> int` (rows written; `None` values skipped) and `upsert_manual_input(db_url: str, project: str, period_key: str, field: str, value: str, entered_by: str | None = None) -> None`.
- Consumes: nothing (foundation task).

- [ ] **Step 1: Rewrite the schema**

Replace the entire contents of `infra/db/init.sql` with:

```sql
CREATE SCHEMA IF NOT EXISTS reporting;

-- Clean refactor: the ratio-per-sprint table is replaced by raw counts.
DROP TABLE IF EXISTS reporting.ai_sprint_metrics;

CREATE TABLE IF NOT EXISTS reporting.metric_counts (
  project      text        NOT NULL,
  period_type  text        NOT NULL CHECK (period_type IN ('sprint', 'month')),
  period_key   text        NOT NULL,  -- 'S6' or '2026-06'
  period_start date        NOT NULL,
  period_end   date        NOT NULL,
  metric_key   text        NOT NULL,  -- e.g. 'ai_prs', 'total_prs', 'lead_time_h'
  value        numeric     NOT NULL,
  collected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project, period_type, period_key, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_metric_counts_lookup
  ON reporting.metric_counts (project, period_type, period_start);

CREATE TABLE IF NOT EXISTS reporting.manual_inputs (
  project     text        NOT NULL,
  period_key  text        NOT NULL,  -- '2026-06' or '2026-Q2'
  field       text        NOT NULL,  -- 'total_engineers', 'cost_baseline', 'g2_ai_policy', ...
  value       text        NOT NULL,  -- numbers, Yes/No, and free text stored uniformly
  entered_by  text,
  entered_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project, period_key, field)
);
```

- [ ] **Step 2: Write the failing tests**

Replace the entire contents of `tests/test_db.py` with:

```python
from datetime import date
import psycopg2
import pytest
from collector.db import upsert_counts, upsert_manual_input


def _fetch_counts(pg_url, project):
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT metric_key, value FROM reporting.metric_counts WHERE project = %s",
            (project,),
        )
        return dict(cur.fetchall())


def test_upsert_counts_inserts_and_skips_none(pg_url):
    n = upsert_counts(
        pg_url, "Future", "sprint", "S1", date(2026, 6, 29), date(2026, 7, 13),
        {"ai_prs": 3, "total_prs": 10, "lead_time_h": None},
    )
    assert n == 2
    rows = _fetch_counts(pg_url, "Future")
    assert rows == {"ai_prs": 3, "total_prs": 10}


def test_upsert_counts_is_idempotent_and_updates(pg_url):
    args = (pg_url, "P-Idem", "month", "2026-06", date(2026, 6, 1), date(2026, 6, 30))
    upsert_counts(*args, {"deploys": 4})
    upsert_counts(*args, {"deploys": 7})
    assert _fetch_counts(pg_url, "P-Idem") == {"deploys": 7}


def test_upsert_counts_empty_returns_zero(pg_url):
    assert upsert_counts(
        pg_url, "P-Empty", "sprint", "S1", date(2026, 1, 1), date(2026, 1, 14), {}
    ) == 0


def test_upsert_manual_input_roundtrip_and_overwrite(pg_url):
    upsert_manual_input(pg_url, "Future", "2026-06", "total_engineers", "18", "pm@seta")
    upsert_manual_input(pg_url, "Future", "2026-06", "total_engineers", "19", "pm@seta")
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT value, entered_by FROM reporting.manual_inputs "
            "WHERE project='Future' AND period_key='2026-06' AND field='total_engineers'"
        )
        assert cur.fetchone() == ("19", "pm@seta")
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `python -m pytest tests/test_db.py -v`
Expected: FAIL with `ImportError: cannot import name 'upsert_counts'`

- [ ] **Step 4: Rewrite `collector/db.py`**

Replace the entire contents with:

```python
from datetime import date
import psycopg2


def upsert_counts(db_url: str, project: str, period_type: str, period_key: str,
                  period_start: date, period_end: date,
                  counts: dict[str, float | int | None]) -> int:
    """Upsert one metric_counts row per non-None metric. Returns rows written."""
    rows = [
        (project, period_type, period_key, period_start, period_end, key, value)
        for key, value in counts.items() if value is not None
    ]
    if not rows:
        return 0
    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.executemany("""
                INSERT INTO reporting.metric_counts
                    (project, period_type, period_key, period_start, period_end,
                     metric_key, value)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (project, period_type, period_key, metric_key)
                DO UPDATE SET
                    value = EXCLUDED.value,
                    period_start = EXCLUDED.period_start,
                    period_end = EXCLUDED.period_end,
                    collected_at = now()
            """, rows)
    return len(rows)


def upsert_manual_input(db_url: str, project: str, period_key: str, field: str,
                        value: str, entered_by: str | None = None) -> None:
    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO reporting.manual_inputs
                    (project, period_key, field, value, entered_by)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (project, period_key, field)
                DO UPDATE SET
                    value = EXCLUDED.value,
                    entered_by = EXCLUDED.entered_by,
                    entered_at = now()
            """, (project, period_key, field, value, entered_by))
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_db.py -v`
Expected: 4 PASS (testcontainers spins up Postgres; needs Docker running)

- [ ] **Step 6: Commit**

```bash
git add infra/db/init.sql collector/db.py tests/test_db.py
git commit -m "feat: metric_counts + manual_inputs schema replacing ratio table"
```

---

### Task 2: Window abstraction (`--sprint` / `--month`)

**Files:**
- Create: `collector/windows.py`
- Create: `tests/test_windows.py`
- (Removal of `resolve_sprint` from `collector/collect.py` happens in Task 6.)

**Interfaces:**
- Produces: `Window` frozen dataclass with fields `period_type: str`, `period_key: str`, `since: datetime`, `until: datetime` and property `weeks: float`; `resolve_window(sprint: str | None, month: str | None, anchor: date, length_days: int, now: datetime | None = None) -> Window`. Raises `ValueError` on bad input (callers convert to exit code 1).
- Consumes: nothing.

Behavior notes the implementer needs:
- Exactly one of `sprint`/`month` may be given; with neither, resolve the sprint containing `now`.
- Sprint N starts at `anchor + (N-1) * length_days`; `until` is capped at `min(now, sprint_start + length_days)` — a **fix** over the old code, which used `now` even for past sprints and so polluted old sprints when re-collected.
- Month `YYYY-MM`: `since` = first of month 00:00 UTC, `until` = `min(now, first of next month)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_windows.py`:

```python
from datetime import date, datetime, timezone
import pytest
from collector.windows import Window, resolve_window

ANCHOR = date(2026, 6, 29)
NOW = datetime(2026, 7, 20, 12, 0, tzinfo=timezone.utc)  # inside sprint S2


def test_current_sprint_resolved_from_now():
    w = resolve_window(None, None, ANCHOR, 14, now=NOW)
    assert (w.period_type, w.period_key) == ("sprint", "S2")
    assert w.since == datetime(2026, 7, 13, tzinfo=timezone.utc)
    assert w.until == NOW  # current sprint: collect up to now


def test_past_sprint_is_capped_at_sprint_end():
    w = resolve_window("S1", None, ANCHOR, 14, now=NOW)
    assert w.since == datetime(2026, 6, 29, tzinfo=timezone.utc)
    assert w.until == datetime(2026, 7, 13, tzinfo=timezone.utc)  # not NOW


def test_month_window():
    w = resolve_window(None, "2026-06", ANCHOR, 14, now=NOW)
    assert (w.period_type, w.period_key) == ("month", "2026-06")
    assert w.since == datetime(2026, 6, 1, tzinfo=timezone.utc)
    assert w.until == datetime(2026, 7, 1, tzinfo=timezone.utc)


def test_current_month_capped_at_now():
    w = resolve_window(None, "2026-07", ANCHOR, 14, now=NOW)
    assert w.until == NOW


def test_weeks_property():
    w = resolve_window("S1", None, ANCHOR, 14, now=NOW)
    assert w.weeks == pytest.approx(2.0)


@pytest.mark.parametrize("sprint,month", [("S1", "2026-06"), ("X9", None), (None, "2026-13"), (None, "junk"), ("S0", None)])
def test_invalid_inputs_raise(sprint, month):
    with pytest.raises(ValueError):
        resolve_window(sprint, month, ANCHOR, 14, now=NOW)


def test_anchor_in_future_raises():
    with pytest.raises(ValueError):
        resolve_window(None, None, date(2027, 1, 1), 14, now=NOW)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_windows.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'collector.windows'`

- [ ] **Step 3: Implement `collector/windows.py`**

```python
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone


@dataclass(frozen=True)
class Window:
    period_type: str  # 'sprint' | 'month'
    period_key: str   # 'S6' | '2026-06'
    since: datetime
    until: datetime

    @property
    def weeks(self) -> float:
        return (self.until - self.since).total_seconds() / (7 * 86400)


def _utc(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


def resolve_window(sprint: str | None, month: str | None, anchor: date,
                   length_days: int, now: datetime | None = None) -> Window:
    """Resolve a collection window. Exactly one of sprint/month, or neither
    (current sprint). Past windows are capped at their natural end so
    re-collecting an old period never absorbs newer activity."""
    now = now or datetime.now(timezone.utc)
    if sprint and month:
        raise ValueError("pass --sprint or --month, not both")

    if month:
        m = re.fullmatch(r"(\d{4})-(\d{2})", month)
        if not m or not 1 <= int(m.group(2)) <= 12:
            raise ValueError(f"month must look like YYYY-MM, got {month!r}")
        year, mon = int(m.group(1)), int(m.group(2))
        since = datetime(year, mon, 1, tzinfo=timezone.utc)
        next_month = datetime(year + (mon == 12), mon % 12 + 1, 1, tzinfo=timezone.utc)
        return Window("month", month, since, min(now, next_month))

    if sprint:
        m = re.fullmatch(r"S(\d+)", sprint)
        if not m or int(m.group(1)) < 1:
            raise ValueError(f"sprint label must look like 'S<n>' (n >= 1), got {sprint!r}")
        index = int(m.group(1))
    else:
        if now.date() < anchor:
            raise ValueError(f"SPRINT_ANCHOR ({anchor}) is in the future")
        index = (now.date() - anchor).days // length_days + 1

    start = anchor + timedelta(days=(index - 1) * length_days)
    since = _utc(start)
    until = min(now, since + timedelta(days=length_days))
    return Window("sprint", f"S{index}", since, until)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_windows.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add collector/windows.py tests/test_windows.py
git commit -m "feat: sprint/month window abstraction with past-window capping"
```

---

### Task 3: GitHub client — deploy strategies, secret alerts, PR files

**Files:**
- Modify: `collector/github_client.py` (add methods; keep existing ones unchanged)
- Modify: `tests/test_github_client.py` (append tests)

**Interfaces:**
- Consumes: existing `GitHubClient._paginate`, `get_deployments`.
- Produces (all on `GitHubClient`):
  - `get_secret_scanning_alerts(since: datetime, until: datetime) -> list[dict]` (empty list on 403/404, like code scanning)
  - `get_pr_files(pr_number: int) -> list[str]` (changed file paths)
  - `get_production_deploy_times(strategy: str, environment: str, since: datetime, until: datetime) -> list[datetime]` (sorted ascending; strategies: `deployments`, `releases`, `tags:<fnmatch-pattern>`, `workflow_runs:<workflow-file.yml>`; unknown → `ValueError`)

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_github_client.py` (imports at top of the appended block; keep existing file contents):

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_github_client.py -v`
Expected: new tests FAIL with `AttributeError` (methods missing); pre-existing tests still PASS.

- [ ] **Step 3: Implement the new methods**

In `collector/github_client.py`, add `import fnmatch` at the top and these methods to `GitHubClient`:

```python
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

    def get_pr_files(self, pr_number: int) -> list[str]:
        """Changed file paths on a PR."""
        files = self._paginate(f"/repos/{self._repo}/pulls/{pr_number}/files", {})
        return [f["filename"] for f in files]

    def get_production_deploy_times(self, strategy: str, environment: str,
                                    since: datetime, until: datetime) -> list[datetime]:
        """Production deploy timestamps in [since, until], sorted ascending.
        Strategy is per-project config so every CI/CD style can be counted:
        'deployments' | 'releases' | 'tags:<pattern>' | 'workflow_runs:<file>'."""
        def _dt(s: str) -> datetime:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))

        if strategy == "deployments":
            times = [_dt(d["created_at"])
                     for d in self.get_deployments(environment, since, until)]
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_github_client.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add collector/github_client.py tests/test_github_client.py
git commit -m "feat: deploy-count strategies, secret alerts, PR files in GitHub client"
```

---

### Task 4: Jira client — assignee/resolution fields + sprint predictability

**Files:**
- Modify: `collector/jira_client.py`
- Modify: `tests/test_jira_client.py` (append tests)

**Interfaces:**
- Consumes: existing `JiraClient._jql_all`.
- Produces: `get_closed_issues` now returns issues with fields `[ai_usage_field, "assignee", "resolutiondate"]` (was just the usage field); new `get_sprint_issue_counts(board_id: str, since: datetime, until: datetime) -> tuple[int, int] | None` returning `(committed, completed)` for the board sprint that best overlaps the window, or `None` when no sprint overlaps.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_jira_client.py`:

```python
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
def test_sprint_issue_counts_picks_overlapping_sprint():
    responses.get(
        "https://x.atlassian.net/rest/agile/1.0/board/7/sprint",
        json={"isLast": True, "values": [
            {"id": 1, "startDate": "2026-06-29T00:00:00.000Z", "endDate": "2026-07-13T00:00:00.000Z"},
            {"id": 2, "startDate": "2026-07-13T00:00:00.000Z", "endDate": "2026-07-27T00:00:00.000Z"},
        ]},
    )
    responses.get(
        "https://x.atlassian.net/rest/agile/1.0/sprint/2/issue",
        json={"total": 3, "issues": [
            {"fields": {"resolution": {"name": "Done"}}},
            {"fields": {"resolution": None}},
            {"fields": {"resolution": {"name": "Done"}}},
        ]},
    )
    assert _jc().get_sprint_issue_counts("7", _SINCE, _UNTIL) == (3, 2)


@responses.activate
def test_sprint_issue_counts_none_when_no_overlap():
    responses.get(
        "https://x.atlassian.net/rest/agile/1.0/board/7/sprint",
        json={"isLast": True, "values": [
            {"id": 1, "startDate": "2025-01-01T00:00:00.000Z", "endDate": "2025-01-14T00:00:00.000Z"},
        ]},
    )
    assert _jc().get_sprint_issue_counts("7", _SINCE, _UNTIL) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_jira_client.py -v`
Expected: new tests FAIL (`fields` missing / `AttributeError: get_sprint_issue_counts`); existing tests PASS.

- [ ] **Step 3: Implement**

In `collector/jira_client.py`, change `get_closed_issues`'s last line to:

```python
        return self._jql_all(jql, [self._ai_usage_field, "assignee", "resolutiondate"])
```

Add the new method:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_jira_client.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add collector/jira_client.py tests/test_jira_client.py
git commit -m "feat: Jira sprint predictability counts + assignee fields on closed issues"
```

---

### Task 5: Metrics rewrite — raw counts + new metrics

**Files:**
- Modify: `collector/metrics.py` (full rewrite)
- Modify: `tests/test_metrics.py` (full rewrite)

**Interfaces:**
- Consumes: `BOT_LOGINS` from `collector.config`; PR dicts (GitHub API shape: `number`, `title`, `labels`, `user.login`, `created_at`, `merged_at`), Jira issue dicts (`fields.<usage_field>.value`, `fields.assignee.accountId`, `fields.resolutiondate`), deploy times `list[datetime]`.
- Produces (module `collector.metrics`):
  - `adoption_counts(prs, issues, field) -> dict` with keys `ai_prs, total_prs, agent_tasks, ai_tasks, total_tasks`
  - `ai_users_weekly_avg(prs, issues, field, since, until) -> float | None`
  - `delivery_counts(deploy_times, incidents, weeks) -> dict` with keys `deploys, weeks, incidents, mttr_h`
  - `lead_time_hours(prs, deploy_times) -> float | None`
  - `rework_pr_count(window_prs, all_prs, pr_files) -> int`
  - `quality_counts(prs, code_alerts, secret_alerts) -> dict` with keys `ai_prs_reviewed, security_alerts`
  - `agent_counts(prs, pr_commits) -> dict` with keys `agent_prs_total, agent_prs_merged, agent_prs_human_fixed, agent_prs_autonomous, agent_cycle_h`

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `tests/test_metrics.py` with:

```python
from datetime import datetime, timezone
import pytest
from collector.metrics import (
    adoption_counts, ai_users_weekly_avg, delivery_counts, lead_time_hours,
    rework_pr_count, quality_counts, agent_counts,
)

FIELD = "customfield_10200"


def pr(labels=(), title="feat: x", merged="2026-07-01T10:00:00Z",
       created="2026-07-01T08:00:00Z", number=1, login="alice", reviews=0):
    return {
        "number": number, "title": title, "merged_at": merged, "created_at": created,
        "user": {"login": login}, "labels": [{"name": l} for l in labels],
        "review_count": reviews,
    }


def issue(usage, assignee="acc-1", resolved="2026-07-01T12:00:00Z"):
    return {"fields": {
        FIELD: {"value": usage} if usage else None,
        "assignee": {"accountId": assignee} if assignee else None,
        "resolutiondate": resolved,
    }}


def dt(s):
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


# adoption_counts
def test_adoption_counts():
    prs = [pr(["ai-assisted"]), pr(), pr(["ai-agent"], number=2)]
    issues = [issue("Agent"), issue("Assisted"), issue("None"), issue(None)]
    c = adoption_counts(prs, issues, FIELD)
    assert c == {"ai_prs": 1, "total_prs": 3, "agent_tasks": 1, "ai_tasks": 2, "total_tasks": 4}


# ai_users_weekly_avg
def test_ai_users_two_weeks_average():
    since, until = dt("2026-07-06"), dt("2026-07-20")  # exactly 2 ISO weeks
    prs = [pr(["ai-assisted"], merged="2026-07-07T10:00:00Z", login="alice"),
           pr(["ai-agent"], merged="2026-07-08T10:00:00Z", login="bob", number=2)]
    issues = [issue("Assisted", assignee="acc-9", resolved="2026-07-15T10:00:00Z")]
    # week 1: {alice, bob} = 2, week 2: {acc-9} = 1 -> avg 1.5
    assert ai_users_weekly_avg(prs, issues, FIELD, since, until) == 1.5


def test_ai_users_excludes_bots_and_non_ai():
    since, until = dt("2026-07-06"), dt("2026-07-13")
    prs = [pr(["ai-assisted"], merged="2026-07-07T10:00:00Z", login="dependabot[bot]"),
           pr(merged="2026-07-07T11:00:00Z", login="carol", number=2)]
    assert ai_users_weekly_avg(prs, [issue("None")], FIELD, since, until) is None


# delivery_counts
def test_delivery_counts_with_mttr():
    incidents = [{"fields": {"created": "2026-07-01T00:00:00Z",
                             "resolutiondate": "2026-07-01T06:00:00Z"}}]
    c = delivery_counts([dt("2026-07-02"), dt("2026-07-09")], incidents, 2.0)
    assert c == {"deploys": 2, "weeks": 2.0, "incidents": 1, "mttr_h": 6.0}


def test_delivery_counts_no_incidents_mttr_none():
    assert delivery_counts([], [], 2.0)["mttr_h"] is None


# lead_time_hours
def test_lead_time_merge_to_next_deploy():
    prs = [pr(merged="2026-07-01T10:00:00Z"), pr(merged="2026-07-03T10:00:00Z", number=2)]
    deploys = [dt("2026-07-01T12:00:00"), dt("2026-07-04T10:00:00")]
    # PR1 -> 2h to first deploy, PR2 -> 24h -> median 13h
    assert lead_time_hours(prs, deploys) == 13.0


def test_lead_time_fallback_open_to_merge_when_no_deploys():
    prs = [pr(created="2026-07-01T08:00:00Z", merged="2026-07-01T18:00:00Z")]
    assert lead_time_hours(prs, []) == 10.0


def test_lead_time_none_without_prs():
    assert lead_time_hours([], []) is None


# rework_pr_count
def test_rework_by_file_overlap_within_14_days():
    p_old = pr(number=1, merged="2026-06-25T10:00:00Z")
    p_new = pr(number=2, merged="2026-07-02T10:00:00Z")
    files = {1: ["src/app.py"], 2: ["src/app.py", "README.md"]}
    assert rework_pr_count([p_new], [p_old, p_new], files) == 1


def test_rework_ignores_overlap_older_than_14_days():
    p_old = pr(number=1, merged="2026-06-01T10:00:00Z")
    p_new = pr(number=2, merged="2026-07-02T10:00:00Z")
    files = {1: ["src/app.py"], 2: ["src/app.py"]}
    assert rework_pr_count([p_new], [p_old, p_new], files) == 0


def test_rework_counts_reverts():
    p = pr(number=3, title="Revert \"feat: x\"", merged="2026-07-02T10:00:00Z")
    assert rework_pr_count([p], [p], {3: []}) == 1


# quality_counts
def test_quality_counts():
    prs = [pr(["ai-assisted"], reviews=1), pr(["ai-assisted"], number=2, reviews=0), pr(number=3)]
    c = quality_counts(prs, [{"a": 1}], [{"b": 2}, {"c": 3}])
    assert c == {"ai_prs_reviewed": 1, "security_alerts": 3}


# agent_counts
def test_agent_counts():
    a1 = pr(["ai-agent"], number=1, created="2026-07-01T08:00:00Z", merged="2026-07-01T12:00:00Z")
    a2 = pr(["ai-agent"], number=2, created="2026-07-02T08:00:00Z", merged="2026-07-02T16:00:00Z")
    commits = {1: [{"author": {"login": "alice", "type": "User"}}],
               2: [{"author": {"login": "github-actions[bot]", "type": "Bot"}}]}
    c = agent_counts([a1, a2, pr(number=3)], commits)
    assert c == {"agent_prs_total": 2, "agent_prs_merged": 2,
                 "agent_prs_human_fixed": 1, "agent_prs_autonomous": 1,
                 "agent_cycle_h": 6.0}


def test_agent_counts_no_agent_prs():
    c = agent_counts([pr()], {})
    assert c["agent_prs_total"] == 0 and c["agent_cycle_h"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_metrics.py -v`
Expected: FAIL with ImportError (old function names gone from the import list)

- [ ] **Step 3: Rewrite `collector/metrics.py`**

Replace the entire contents with:

```python
import statistics
from datetime import datetime, timedelta
from typing import Optional
from collector.config import BOT_LOGINS

AI_LABELS = {"ai-assisted", "ai-agent"}


def _dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _has_label(pr: dict, name: str) -> bool:
    return any(l["name"] == name for l in pr.get("labels", []))


def _is_ai_pr(pr: dict) -> bool:
    return any(l["name"] in AI_LABELS for l in pr.get("labels", []))


def _usage(issue: dict, field: str) -> str:
    return (issue["fields"].get(field) or {}).get("value", "None") or "None"


def adoption_counts(prs: list[dict], issues: list[dict], field: str) -> dict:
    return {
        "ai_prs": sum(1 for p in prs if _has_label(p, "ai-assisted")),
        "total_prs": len(prs),
        "agent_tasks": sum(1 for i in issues if _usage(i, field) == "Agent"),
        "ai_tasks": sum(1 for i in issues if _usage(i, field) != "None"),
        "total_tasks": len(issues),
    }


def ai_users_weekly_avg(prs: list[dict], issues: list[dict], field: str,
                        since: datetime, until: datetime) -> Optional[float]:
    """Mean per-ISO-week distinct AI users: authors of AI-labeled merged PRs
    plus assignees of AI-usage Jira issues. Proxy for license/survey data;
    the quarterly review cross-checks and can override via manual_inputs."""
    def week_of(dt: datetime):
        d = dt.date()
        return d - timedelta(days=d.weekday())

    weeks: dict = {}
    for p in prs:
        if _is_ai_pr(p) and p.get("merged_at"):
            login = (p.get("user") or {}).get("login")
            if login and login not in BOT_LOGINS:
                weeks.setdefault(week_of(_dt(p["merged_at"])), set()).add(f"gh:{login}")
    for i in issues:
        f = i["fields"]
        account = (f.get("assignee") or {}).get("accountId")
        if _usage(i, field) != "None" and f.get("resolutiondate") and account:
            weeks.setdefault(week_of(_dt(f["resolutiondate"])), set()).add(f"jira:{account}")

    if not weeks:
        return None
    n_weeks = max(1, round((until - since).days / 7))
    return round(sum(len(users) for users in weeks.values()) / n_weeks, 2)


def delivery_counts(deploy_times: list[datetime], incidents: list[dict],
                    weeks: float) -> dict:
    hours = []
    for i in incidents:
        c, r = i["fields"].get("created"), i["fields"].get("resolutiondate")
        if c and r:
            hours.append((_dt(r) - _dt(c)).total_seconds() / 3600)
    return {
        "deploys": len(deploy_times),
        "weeks": round(weeks, 2),
        "incidents": len(incidents),
        "mttr_h": round(statistics.mean(hours), 2) if hours else None,
    }


def lead_time_hours(prs: list[dict], deploy_times: list[datetime]) -> Optional[float]:
    """DORA lead time approximation: median hours PR merge -> first production
    deploy after it. Falls back to open->merge when the window has no deploys."""
    merged = sorted(_dt(p["merged_at"]) for p in prs if p.get("merged_at"))
    if deploy_times:
        spans = []
        for m in merged:
            nxt = next((d for d in deploy_times if d >= m), None)
            if nxt:
                spans.append((nxt - m).total_seconds() / 3600)
        if spans:
            return round(statistics.median(spans), 2)
    spans = [
        (_dt(p["merged_at"]) - _dt(p["created_at"])).total_seconds() / 3600
        for p in prs if p.get("merged_at") and p.get("created_at")
    ]
    return round(statistics.median(spans), 2) if spans else None


def rework_pr_count(window_prs: list[dict], all_prs: list[dict],
                    pr_files: dict[int, list[str]]) -> int:
    """PRs in the window that are rework: revert PRs, or PRs sharing a changed
    file with a different PR merged in the 14 days before their merge."""
    count = 0
    for p in window_prs:
        if p["title"].lower().startswith("revert"):
            count += 1
            continue
        merged = _dt(p["merged_at"])
        touched = set(pr_files.get(p["number"], []))
        for q in all_prs:
            if q["number"] == p["number"] or not q.get("merged_at"):
                continue
            q_merged = _dt(q["merged_at"])
            if (merged - timedelta(days=14) <= q_merged < merged
                    and touched & set(pr_files.get(q["number"], []))):
                count += 1
                break
    return count


def quality_counts(prs: list[dict], code_alerts: list[dict],
                   secret_alerts: list[dict]) -> dict:
    ai_prs = [p for p in prs if _has_label(p, "ai-assisted")]
    return {
        "ai_prs_reviewed": sum(1 for p in ai_prs if p.get("review_count", 0) > 0),
        "security_alerts": len(code_alerts) + len(secret_alerts),
    }


def agent_counts(prs: list[dict], pr_commits: dict[int, list]) -> dict:
    agent_prs = [p for p in prs if _has_label(p, "ai-agent")]
    human_fixed = 0
    cycle: list[float] = []
    for p in agent_prs:
        commits = pr_commits.get(p["number"], [])
        has_human = any(
            (c.get("author") or {}).get("login") not in BOT_LOGINS
            and (c.get("author") or {}).get("type") != "Bot"
            for c in commits
        )
        if has_human:
            human_fixed += 1
        if p.get("merged_at") and p.get("created_at"):
            cycle.append((_dt(p["merged_at"]) - _dt(p["created_at"])).total_seconds() / 3600)
    return {
        "agent_prs_total": len(agent_prs),
        "agent_prs_merged": sum(1 for p in agent_prs if p.get("merged_at")),
        "agent_prs_human_fixed": human_fixed,
        "agent_prs_autonomous": len(agent_prs) - human_fixed,
        "agent_cycle_h": round(statistics.median(cycle), 2) if cycle else None,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_metrics.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add collector/metrics.py tests/test_metrics.py
git commit -m "feat: raw-count metrics with lead time, rework, and AI-user proxies"
```

---

### Task 6: Orchestration — rewrite `collect.py`, update config, wire everything

**Files:**
- Modify: `collector/collect.py` (full rewrite)
- Modify: `collector/config.py` (add `DEPLOY_COUNT_STRATEGY`, `JIRA_BOARD_ID`)
- Create: `tests/test_collect.py`

**Interfaces:**
- Consumes: everything produced by Tasks 1–5 (exact signatures listed in those tasks).
- Produces: `build_counts(window, prs, all_prs, pr_files, deploy_times, code_alerts, secret_alerts, issues, incidents, field, sprint_issue_counts) -> dict[str, float | int | None]` — a pure function unit-tested without IO; `main()` CLI with `--sprint | --month | --project | --jira-project | --repo` (manual `--a1/--b5/--c3` flags are gone).

- [ ] **Step 1: Add config entries**

In `collector/config.py`, after the `GH_PROD_ENV` line, add:

```python
# How production deploys are counted for this project — the GitHub Deployments
# API is the default contract; other strategies cover CI/CD that can't create
# deployment records: 'deployments' | 'releases' | 'tags:<pattern>' | 'workflow_runs:<file>'
DEPLOY_COUNT_STRATEGY: str = os.getenv("DEPLOY_COUNT_STRATEGY", "deployments")
```

and after the `JIRA_AI_USAGE_FIELD` line, add:

```python
# Jira Agile board id for sprint predictability (committed vs completed).
# Optional: the metric is skipped when unset.
JIRA_BOARD_ID: str | None = os.getenv("JIRA_BOARD_ID")
```

- [ ] **Step 2: Write the failing tests**

Create `tests/test_collect.py`:

```python
from datetime import datetime, timezone
from collector.collect import build_counts
from collector.windows import Window

FIELD = "customfield_10200"
W = Window("sprint", "S1",
           datetime(2026, 6, 29, tzinfo=timezone.utc),
           datetime(2026, 7, 13, tzinfo=timezone.utc))


def pr(number=1, labels=(), merged="2026-07-01T10:00:00Z", created="2026-07-01T08:00:00Z"):
    return {"number": number, "title": "feat: x", "merged_at": merged,
            "created_at": created, "user": {"login": "alice"},
            "labels": [{"name": l} for l in labels], "review_count": 1}


def test_build_counts_produces_canonical_keys():
    prs = [pr(1, ["ai-assisted"])]
    counts = build_counts(
        window=W, prs=prs, all_prs=prs, pr_files={1: ["a.py"]},
        deploy_times=[datetime(2026, 7, 2, tzinfo=timezone.utc)],
        code_alerts=[], secret_alerts=[],
        issues=[], incidents=[], field=FIELD, sprint_issue_counts=(10, 8),
    )
    assert counts["ai_prs"] == 1
    assert counts["total_prs"] == 1
    assert counts["deploys"] == 1
    assert counts["weeks"] == 2.0
    assert counts["sprint_committed"] == 10
    assert counts["sprint_completed"] == 8
    assert counts["lead_time_h"] is not None
    assert counts["rework_prs"] == 0


def test_build_counts_without_sprint_predictability():
    counts = build_counts(
        window=W, prs=[], all_prs=[], pr_files={}, deploy_times=[],
        code_alerts=[], secret_alerts=[], issues=[], incidents=[],
        field=FIELD, sprint_issue_counts=None,
    )
    assert "sprint_committed" not in counts
    assert counts["total_prs"] == 0
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `python -m pytest tests/test_collect.py -v`
Expected: FAIL with `ImportError: cannot import name 'build_counts'`

- [ ] **Step 4: Rewrite `collector/collect.py`**

Replace the entire contents with:

```python
#!/usr/bin/env python3
"""
Collect AI SDLC raw metric counts for one sprint or month window.

Usage:
  python -m collector.collect [--sprint S6 | --month 2026-06]
                              [--project Future] [--repo owner/repo]
                              [--jira-project FUT]
"""
import argparse
import sys
from datetime import datetime, timedelta
from collector.config import (
    SPRINT_ANCHOR, SPRINT_LENGTH_DAYS, GITHUB_TOKEN, GITHUB_REPO, GH_PROD_ENV,
    DEPLOY_COUNT_STRATEGY, JIRA_BASE, JIRA_PROJECT, JIRA_EMAIL, JIRA_TOKEN,
    JIRA_AI_USAGE_FIELD, JIRA_BOARD_ID, REPORTING_DB_URL, PROJECT_LABEL,
)
from collector.github_client import GitHubClient
from collector.jira_client import JiraClient
from collector.windows import Window, resolve_window
from collector.metrics import (
    adoption_counts, ai_users_weekly_avg, delivery_counts, lead_time_hours,
    rework_pr_count, quality_counts, agent_counts,
)
from collector.db import upsert_counts


def _merged_dt(pr: dict) -> datetime:
    return datetime.fromisoformat(pr["merged_at"].replace("Z", "+00:00"))


def enrich_prs_with_review_count(gh: GitHubClient, prs: list[dict]) -> list[dict]:
    """Adds review_count to ai-assisted PRs (needed for ai_prs_reviewed)."""
    for pr in prs:
        if any(l["name"] == "ai-assisted" for l in pr.get("labels", [])):
            r = gh._s.get(
                f"https://api.github.com/repos/{gh._repo}/pulls/{pr['number']}/reviews",
                params={"per_page": 100},
            )
            if r.ok:
                pr["review_count"] = sum(1 for rev in r.json() if rev["state"] == "APPROVED")
    return prs


def build_counts(window: Window, prs: list[dict], all_prs: list[dict],
                 pr_files: dict[int, list[str]], deploy_times: list[datetime],
                 code_alerts: list[dict], secret_alerts: list[dict],
                 issues: list[dict], incidents: list[dict], field: str,
                 sprint_issue_counts: tuple[int, int] | None,
                 pr_commits: dict[int, list] | None = None) -> dict:
    """Pure assembly of all raw counts for one window. No IO."""
    counts = {
        **adoption_counts(prs, issues, field),
        **delivery_counts(deploy_times, incidents, window.weeks),
        **quality_counts(prs, code_alerts, secret_alerts),
        **agent_counts(prs, pr_commits or {}),
        "lead_time_h": lead_time_hours(prs, deploy_times),
        "rework_prs": rework_pr_count(prs, all_prs, pr_files),
        "ai_users_weekly_avg": ai_users_weekly_avg(prs, issues, field, window.since, window.until),
    }
    if sprint_issue_counts is not None:
        counts["sprint_committed"], counts["sprint_completed"] = sprint_issue_counts
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect AI SDLC raw metric counts")
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--sprint", default=None, help="Sprint label, e.g. S6")
    scope.add_argument("--month", default=None, help="Calendar month, e.g. 2026-06")
    parser.add_argument("--project", default=PROJECT_LABEL)
    parser.add_argument("--jira-project", default=JIRA_PROJECT)
    parser.add_argument("--repo", default=GITHUB_REPO)
    args = parser.parse_args()

    try:
        window = resolve_window(args.sprint, args.month, SPRINT_ANCHOR, SPRINT_LENGTH_DAYS)
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"[{args.project}] {window.period_key}: "
          f"{window.since.date()} -> {window.until.date()} ({window.weeks:.1f} weeks)")

    gh = GitHubClient(GITHUB_TOKEN, args.repo)
    jira = JiraClient(JIRA_BASE, JIRA_EMAIL, JIRA_TOKEN, args.jira_project, JIRA_AI_USAGE_FIELD)

    # Fetch a 14-day lookback superset so rework can see pre-window merges.
    all_prs = gh.get_merged_prs(window.since - timedelta(days=14), window.until)
    prs = [p for p in all_prs if _merged_dt(p) >= window.since]
    prs = enrich_prs_with_review_count(gh, prs)
    pr_files = {p["number"]: gh.get_pr_files(p["number"]) for p in all_prs}
    agent_numbers = [p["number"] for p in prs
                     if any(l["name"] == "ai-agent" for l in p.get("labels", []))]
    pr_commits = {n: gh.get_pr_commits(n) for n in agent_numbers}

    deploy_times = gh.get_production_deploy_times(
        DEPLOY_COUNT_STRATEGY, GH_PROD_ENV, window.since, window.until)
    code_alerts = gh.get_code_scanning_alerts(window.since, window.until)
    secret_alerts = gh.get_secret_scanning_alerts(window.since, window.until)
    issues = jira.get_closed_issues(window.since, window.until)
    incidents = jira.get_incidents(window.since, window.until)

    sprint_issue_counts = None
    if window.period_type == "sprint" and JIRA_BOARD_ID:
        sprint_issue_counts = jira.get_sprint_issue_counts(
            JIRA_BOARD_ID, window.since, window.until)

    counts = build_counts(window, prs, all_prs, pr_files, deploy_times,
                          code_alerts, secret_alerts, issues, incidents,
                          JIRA_AI_USAGE_FIELD, sprint_issue_counts,
                          pr_commits=pr_commits)

    written = upsert_counts(REPORTING_DB_URL, args.project, window.period_type,
                            window.period_key, window.since.date(),
                            window.until.date(), counts)
    non_null = {k: v for k, v in counts.items() if v is not None}
    print(f"Upserted {written} metric rows: {non_null}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run the new tests, then the full suite**

Run: `python -m pytest tests/test_collect.py -v`
Expected: 2 PASS

Run: `python -m pytest`
Expected: everything passes (test_ticket_extract and update_ticket paths are untouched)

- [ ] **Step 6: Commit**

```bash
git add collector/collect.py collector/config.py tests/test_collect.py
git commit -m "feat: collector orchestration on raw counts with sprint/month windows"
```

---

### Task 7: Live verification against Future

**Files:**
- No code changes — verification only. (Any bug found: fix, add a regression test, commit.)

- [ ] **Step 1: Dry-run the collector against the Future repo for the current sprint**

With real credentials exported (see `docs/SETUP.md` / `privates/`), run:

```bash
export GH_PROD_ENV=uat   # Future has no 'production' environment yet (spec §6.1)
python -m collector.collect --project Future
```

Expected: `[Future] S<n>: <start> -> <today> (...)` then `Upserted N metric rows: {...}` with non-zero `total_prs` and — with `GH_PROD_ENV=uat` — a non-zero `deploys` count if any deploy ran this sprint.

- [ ] **Step 2: Verify rows landed**

```bash
psql "$REPORTING_DB_URL" -c "SELECT period_key, metric_key, value FROM reporting.metric_counts WHERE project='Future' ORDER BY metric_key;"
```

Expected: one row per collected metric for the current sprint.

- [ ] **Step 3: Run a month window**

```bash
python -m collector.collect --project Future --month 2026-06
psql "$REPORTING_DB_URL" -c "SELECT count(*) FROM reporting.metric_counts WHERE project='Future' AND period_type='month' AND period_key='2026-06';"
```

Expected: month rows present alongside sprint rows.

- [ ] **Step 4: Commit any fixes discovered, then mark plan complete**

```bash
git status   # confirm clean or commit fixes with regression tests
```

---

## Not in this plan (later plans)

- Plan 2: reusable workflows (`collect.yml`, `manual-input.yml`, `quarterly-check.yml` as `workflow_call`), `record-deployment` composite action, caller template, Future caller update (removes broken `--a1/--b5/--c3` inputs, sets `GH_PROD_ENV: uat`, adds monthly schedule), TeacherZone onboarding.
- Plan 3: Grafana rebuild — English per-project + BOD dashboards on `metric_counts`, folders, PM viewer accounts script, compose comment updates.
- Plan 4: English workbook template + FastAPI exporter + Grafana download links.
