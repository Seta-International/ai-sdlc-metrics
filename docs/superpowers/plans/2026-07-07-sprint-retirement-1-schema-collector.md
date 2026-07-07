# Retire Sprint — Plan 1: Schema & Collector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `month` the only raw collection grain (schema + collector), add
the volume-weighted quarter rollup view, and delete every sprint-only code
path — no dashboard/exporter changes yet (that's Plan 2).

**Architecture:** `metric_counts.period_type` narrows from `('sprint',
'month')` to `('month')`. A new view `reporting.v_metrics_q` derives quarter
rows from `v_metrics` month rows by summing numerator/denominator counts
before dividing (not averaging pre-computed percentages). The collector's
`windows.py` loses its per-project sprint-anchor math entirely — resolving a
window becomes pure calendar-month arithmetic, no `anchor`/`length_days`
params needed at all. `collect.py`, `jira_client.py`, and `config.py` shed
every sprint-only branch (`--sprint` flag, `sprint_committed`/
`sprint_completed` collection via `get_sprint_issue_counts`, `resolve_board_id`
which existed only to support it, `SPRINT_ANCHOR`/`SPRINT_LENGTH_DAYS`/
`JIRA_BOARD_ID` config).

**Tech Stack:** Python 3.11+, PostgreSQL (psycopg2), pytest,
`testcontainers` (Postgres, via the `pg_url` fixture in `tests/conftest.py`),
`responses` (HTTP mocking for Jira).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-07-sprint-to-monthly-quarterly-design.md`.
- No backward-compat shims — this is a clean refactor per Canh: "we don't care
  about sprint anymore." Delete sprint code paths outright; do not add
  deprecation warnings or dual-path branches.
- "Sprint Predictability" is retired, not translated to month/quarter (see
  spec's "Decision" section) — this means `sprint_committed`,
  `sprint_completed`, `get_sprint_issue_counts`, and `resolve_board_id` (which
  existed only to find a board for that call) are deleted, not renamed.
- **Known interim gap:** `infra/db/seed.sql` still inserts `period_type =
  'sprint'` rows until Plan 2 runs. Task 1's narrowed CHECK constraint means a
  **fresh** local Postgres volume (`docker compose down -v && up`, or a first
  init) will fail to load seed data until Plan 2 fixes `seed.sql`. An
  already-running local container is unaffected (`docker-entrypoint-initdb.d`
  scripts only run once, on first init). Do not "fix" this in Plan 1 by
  touching `seed.sql` — that's Plan 2's task, paired with the dashboard/
  exporter changes that consume it.
- Every SQL/view change must re-verify `test_views_sql_is_reappliable`
  (`tests/test_views.py`) still passes — `views.sql` must stay idempotent
  (`DROP VIEW IF EXISTS ...` before every `CREATE VIEW`).

---

### Task 1: Narrow `metric_counts.period_type` to month-only

**Files:**
- Modify: `infra/db/init.sql:8`
- Modify: `tests/test_db.py:18-23,35-38` (existing tests using `'sprint'` as a
  fixture value)
- Test: `tests/test_db.py` (new test for the CHECK rejecting `'sprint'`)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this only tightens an existing constraint. Later
  tasks may now assume `period_type` is always `'month'` at the DB layer.

- [ ] **Step 1: Write the failing test** — add to `tests/test_db.py` (after
  `test_upsert_counts_empty_returns_zero`):

```python
def test_period_type_rejects_sprint(pg_url):
    with pytest.raises(psycopg2.errors.CheckViolation):
        upsert_counts(
            pg_url, "P-NoSprint", "sprint", "S1",
            date(2026, 6, 29), date(2026, 7, 13), {"total_prs": 1},
        )
```

This needs `import pytest` (already imported) — `psycopg2.errors` needs no
extra import beyond the existing `import psycopg2`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_db.py::test_period_type_rejects_sprint -v`
Expected: FAIL — no error is raised, because today's CHECK still allows
`'sprint'` (the insert succeeds).

- [ ] **Step 3: Narrow the CHECK constraint**

In `infra/db/init.sql:8`, change:

```sql
  period_type  text        NOT NULL CHECK (period_type IN ('sprint', 'month')),
```

to:

```sql
  period_type  text        NOT NULL CHECK (period_type IN ('month')),
```

- [ ] **Step 4: Update the two existing tests that used `'sprint'` as a fixture value**

In `tests/test_db.py`, `test_upsert_counts_inserts_and_skips_none` (line 18-23)
and `test_upsert_counts_empty_returns_zero` (line 35-38) both pass
`"sprint"`/`"S1"` purely as an arbitrary period label — change both to
`"month"`/`"2026-07"` (any valid month key; the test doesn't assert on the
period key value):

```python
def test_upsert_counts_inserts_and_skips_none(pg_url):
    n = upsert_counts(
        pg_url, "Future", "month", "2026-07", date(2026, 6, 29), date(2026, 7, 13),
        {"ai_prs": 3, "total_prs": 10, "lead_time_h": None},
    )
    assert n == 2
    rows = _fetch_counts(pg_url, "Future")
    assert rows == {"ai_prs": 3, "total_prs": 10}
```

```python
def test_upsert_counts_empty_returns_zero(pg_url):
    assert upsert_counts(
        pg_url, "P-Empty", "month", "2026-01", date(2026, 1, 1), date(2026, 1, 14), {}
    ) == 0
```

- [ ] **Step 5: Run the full test_db.py file to verify everything passes**

Run: `pytest tests/test_db.py -v`
Expected: All PASS, including the new `test_period_type_rejects_sprint`.
(This test file spins up a real Postgres via testcontainers and applies
`init.sql` + `views.sql` fresh each run, so the narrowed CHECK is exercised
for real — check `tests/conftest.py`'s `pg_url` fixture if this doesn't
apply automatically.)

- [ ] **Step 6: Commit**

```bash
git add infra/db/init.sql tests/test_db.py
git commit -m "refactor: narrow metric_counts.period_type to month-only

Drops 'sprint' from the raw collection grain per the sprint-retirement
refactor (docs/superpowers/specs/2026-07-07-sprint-to-monthly-quarterly-design.md)."
```

---

### Task 2: Add `reporting.v_metrics_q` — volume-weighted quarter rollup

**Files:**
- Modify: `infra/db/views.sql` (add `DROP VIEW IF EXISTS
  reporting.v_metrics_q;` near the top alongside the other drops, add the
  `CREATE VIEW` after `reporting.v_metrics`)
- Test: `tests/test_views.py`

**Interfaces:**
- Consumes: `reporting.metric_counts` (raw month rows), same underlying
  columns as `reporting.metrics_wide`/`reporting.v_metrics`.
- Produces: `reporting.v_metrics_q` — same output columns as
  `reporting.v_metrics`, one row per `(project, quarter)`, with
  `period_type = 'quarter'` and `period_key` formatted `'YYYY-Qn'`. Plan 2's
  dashboard work reads this view directly and also via
  `SELECT * FROM v_metrics WHERE period_type='month' UNION ALL SELECT * FROM
  v_metrics_q` — the column list must match `v_metrics` exactly (same names,
  same order does not matter for `UNION ALL` by name only if you `SELECT`
  explicit columns; this view uses `SELECT *` from a CTE with explicit column
  aliases so the practical column set matches).

**Why volume-weighted, not `avg()` of monthly percentages:** if June has 10 AI
PRs of 20 total (50%) and July has 40 AI PRs of 400 total (10%), naive
`avg(50, 10) = 30%` overstates adoption — July's huge volume should dominate.
Volume-weighted: `sum(ai_prs) / sum(total_prs) = 50/420 ≈ 11.9%`. This task's
test asserts exactly this asymmetric-volume case.

- [ ] **Step 1: Write the failing test** — add to `tests/test_views.py`:

```python
def test_v_metrics_q_is_volume_weighted_not_averaged(pg_url):
    # June: 10/20 AI PRs (50%). July: 40/400 AI PRs (10%). Naive avg = 30%;
    # volume-weighted = 50/420 = 11.90%. Both months in 2026-Q3 (Jul) — wait,
    # June is Q2. Use two months in the SAME quarter so they roll into one row.
    upsert_counts(pg_url, "P-Weighted", "month", "2026-07",
                  date(2026, 7, 1), date(2026, 7, 31),
                  {"ai_prs": 10, "total_prs": 20})
    upsert_counts(pg_url, "P-Weighted", "month", "2026-08",
                  date(2026, 8, 1), date(2026, 8, 31),
                  {"ai_prs": 40, "total_prs": 400})
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT period_type, period_key, round(ai_pr_pct, 2)
            FROM reporting.v_metrics_q
            WHERE project = 'P-Weighted'
        """)
        period_type, period_key, ai_pr_pct = cur.fetchone()
    assert period_type == "quarter"
    assert period_key == "2026-Q3"
    assert float(ai_pr_pct) == 11.90   # NOT 30.0 (the naive average)
```

This needs `from collector.db import upsert_counts` (already imported at the
top of `tests/test_views.py`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_views.py::test_v_metrics_q_is_volume_weighted_not_averaged -v`
Expected: FAIL with `psycopg2.errors.UndefinedTable: relation
"reporting.v_metrics_q" does not exist`.

- [ ] **Step 3: Add the view**

In `infra/db/views.sql`, add the drop near the top (order matters — drop
before `v_metrics` since it depends on it):

```sql
DROP VIEW IF EXISTS reporting.metrics_ratios;
DROP VIEW IF EXISTS reporting.v_levels;
DROP VIEW IF EXISTS reporting.v_quarter_metrics;
DROP VIEW IF EXISTS reporting.v_metrics_q;
DROP VIEW IF EXISTS reporting.v_metrics;
DROP VIEW IF EXISTS reporting.metrics_wide;
```

Then add the view definition immediately after `reporting.v_metrics`'s
`CREATE VIEW` (i.e. right before the `metrics_ratios` alias, so it reads
`v_metrics` which must already exist):

```sql
-- Volume-weighted quarter rollup of v_metrics month rows: sums the raw
-- numerator/denominator counts across the quarter's months before dividing,
-- so a high-volume month isn't diluted by averaging it with a quiet one.
-- Column set matches reporting.v_metrics so dashboards can UNION ALL the two
-- and filter on period_type = 'month' | 'quarter' via one $granularity var.
CREATE VIEW reporting.v_metrics_q AS
WITH months AS (
  SELECT
    project,
    to_char(period_start, 'YYYY') || '-Q' ||
      ceil(extract(month FROM period_start) / 3.0)::int AS quarter,
    min(period_start) AS q_start, max(period_end) AS q_end,
    ai_users_weekly_avg, engineers_active, team_size, ai_prs, total_prs,
    agent_tasks, ai_tasks, total_tasks, lead_time_h, deploys, weeks,
    incidents, mttr_h, rework_prs, ai_prs_reviewed, security_alerts,
    agent_prs_total, agent_prs_merged, agent_prs_human_fixed,
    agent_prs_autonomous, agent_cycle_h, lead_time_ai_h, lead_time_nonai_h,
    rework_from_ai_prs, ai_time_saved_h, ai_prs_with_tests, pr_size_ai,
    pr_size_nonai, first_review_ai_h, first_review_nonai_h,
    review_rounds_ai, review_rounds_nonai
  FROM reporting.v_metrics
  WHERE period_type = 'month'
  GROUP BY project, period_start, ai_users_weekly_avg, engineers_active,
    team_size, ai_prs, total_prs, agent_tasks, ai_tasks, total_tasks,
    lead_time_h, deploys, weeks, incidents, mttr_h, rework_prs,
    ai_prs_reviewed, security_alerts, agent_prs_total, agent_prs_merged,
    agent_prs_human_fixed, agent_prs_autonomous, agent_cycle_h,
    lead_time_ai_h, lead_time_nonai_h, rework_from_ai_prs, ai_time_saved_h,
    ai_prs_with_tests, pr_size_ai, pr_size_nonai, first_review_ai_h,
    first_review_nonai_h, review_rounds_ai, review_rounds_nonai
),
agg AS (
  SELECT
    project, quarter,
    min(q_start) AS period_start, max(q_end) AS period_end,
    avg(team_size) AS team_size,
    sum(ai_users_weekly_avg) / NULLIF(count(*), 0) AS ai_users_weekly_avg,
    sum(engineers_active) AS engineers_active,
    sum(ai_prs) AS ai_prs, sum(total_prs) AS total_prs,
    sum(agent_tasks) AS agent_tasks, sum(ai_tasks) AS ai_tasks,
    sum(total_tasks) AS total_tasks,
    sum(lead_time_h * total_prs) / NULLIF(sum(total_prs), 0) AS lead_time_h,
    sum(deploys) AS deploys, sum(weeks) AS weeks, sum(incidents) AS incidents,
    sum(mttr_h * incidents) / NULLIF(sum(incidents), 0) AS mttr_h,
    sum(rework_prs) AS rework_prs, sum(ai_prs_reviewed) AS ai_prs_reviewed,
    sum(security_alerts) AS security_alerts,
    sum(agent_prs_total) AS agent_prs_total,
    sum(agent_prs_merged) AS agent_prs_merged,
    sum(agent_prs_human_fixed) AS agent_prs_human_fixed,
    sum(agent_prs_autonomous) AS agent_prs_autonomous,
    sum(agent_cycle_h * agent_prs_total) / NULLIF(sum(agent_prs_total), 0) AS agent_cycle_h,
    sum(lead_time_ai_h * ai_prs) / NULLIF(sum(ai_prs), 0) AS lead_time_ai_h,
    sum(lead_time_nonai_h * (total_prs - ai_prs)) / NULLIF(sum(total_prs - ai_prs), 0) AS lead_time_nonai_h,
    sum(rework_from_ai_prs) AS rework_from_ai_prs,
    sum(ai_time_saved_h) AS ai_time_saved_h,
    sum(ai_prs_with_tests) AS ai_prs_with_tests,
    sum(pr_size_ai * ai_prs) / NULLIF(sum(ai_prs), 0) AS pr_size_ai,
    sum(pr_size_nonai * (total_prs - ai_prs)) / NULLIF(sum(total_prs - ai_prs), 0) AS pr_size_nonai,
    sum(first_review_ai_h * ai_prs) / NULLIF(sum(ai_prs), 0) AS first_review_ai_h,
    sum(first_review_nonai_h * (total_prs - ai_prs)) / NULLIF(sum(total_prs - ai_prs), 0) AS first_review_nonai_h,
    sum(review_rounds_ai * ai_prs) / NULLIF(sum(ai_prs), 0) AS review_rounds_ai,
    sum(review_rounds_nonai * (total_prs - ai_prs)) / NULLIF(sum(total_prs - ai_prs), 0) AS review_rounds_nonai
  FROM months
  GROUP BY project, quarter
)
SELECT
  project, 'quarter'::text AS period_type, quarter AS period_key,
  period_start, period_end, team_size,
  100.0 * ai_prs / NULLIF(total_prs, 0) AS ai_pr_pct,
  CASE WHEN ai_users_weekly_avg IS NULL OR team_size IS NULL OR team_size = 0 THEN NULL
       ELSE LEAST(100.0 * ai_users_weekly_avg / NULLIF(team_size, 0), 100.0) END AS usage_pct,
  100.0 * ai_users_weekly_avg / NULLIF(engineers_active, 0) AS usage_rate_pct,
  100.0 * agent_tasks / NULLIF(total_tasks, 0) AS agent_task_pct,
  100.0 * ai_tasks / NULLIF(total_tasks, 0) AS ai_task_pct,
  deploys / NULLIF(weeks, 0) AS deploys_per_week,
  100.0 * incidents / NULLIF(deploys, 0) AS cfr_pct,
  100.0 * rework_prs / NULLIF(total_prs, 0) AS rework_pct,
  100.0 * ai_prs_reviewed / NULLIF(ai_prs, 0) AS ai_pr_review_pct,
  100.0 * agent_prs_merged / NULLIF(agent_prs_total, 0) AS agent_completion_pct,
  100.0 * agent_prs_human_fixed / NULLIF(agent_prs_total, 0) AS human_intervention_pct,
  100.0 * agent_prs_autonomous / NULLIF(agent_prs_total, 0) AS autonomy_pct,
  100.0 * agent_prs_total / NULLIF(total_prs, 0) AS agent_pr_pct,
  total_tasks::numeric / NULLIF(engineers_active, 0) AS throughput_per_engineer,
  100.0 * (lead_time_nonai_h - lead_time_ai_h) / NULLIF(lead_time_nonai_h, 0) AS lead_time_ai_delta_pct,
  100.0 * ai_prs_with_tests / NULLIF(ai_prs, 0) AS ai_pr_test_pct,
  100.0 * rework_from_ai_prs / NULLIF(rework_prs, 0) AS rework_from_ai_pct,
  total_prs AS n_pr, ai_prs AS n_ai_pr, agent_prs_total AS n_agent_pr,
  deploys AS n_deploys, total_tasks AS n_tasks,
  lead_time_h, deploys AS raw_deploys, weeks, incidents, mttr_h,
  lead_time_ai_h, lead_time_nonai_h, pr_size_ai, pr_size_nonai,
  first_review_ai_h, first_review_nonai_h, review_rounds_ai, review_rounds_nonai
FROM agg;
```

Note: `sum(x * n) / NULLIF(sum(n), 0)` is the volume-weighted average pattern
used throughout — weight each month's already-computed ratio by the count
that produced it (e.g. `lead_time_h` weighted by `total_prs`, `mttr_h`
weighted by `incidents`) rather than re-deriving from more granular raw data
that isn't available at this layer (`v_metrics` already collapsed to ratios).
This is an approximation one level up from true volume-weighting (weighting a
ratio by its own denominator, rather than summing the original numerator/
denominator pairs) — acceptable here because `metric_counts` doesn't store
per-PR data, only monthly aggregates.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_views.py::test_v_metrics_q_is_volume_weighted_not_averaged -v`
Expected: PASS.

- [ ] **Step 5: Run the full test_views.py file**

Run: `pytest tests/test_views.py -v`
Expected: All PASS, including `test_views_sql_is_reappliable` (confirms the
new `DROP VIEW IF EXISTS reporting.v_metrics_q;` makes re-applying safe).

- [ ] **Step 6: Commit**

```bash
git add infra/db/views.sql tests/test_views.py
git commit -m "feat: add v_metrics_q volume-weighted quarter rollup view

Column-identical to v_metrics (period_type='quarter') so BOD/project
dashboards in Plan 2 can UNION ALL and filter on \$granularity."
```

---

### Task 3: Simplify `collector/windows.py` to month-only (drop sprint anchor math)

**Files:**
- Modify: `collector/windows.py` (full rewrite — anchor/length_days params
  disappear entirely, not just the sprint branch)
- Test: `tests/test_windows.py` (full rewrite)

**Interfaces:**
- Consumes: nothing.
- Produces: `resolve_window(month: str | None, now: datetime | None = None) ->
  Window`. `Window.period_type` is always `"month"`.
  `Window.period_key` is `"YYYY-MM"`. Task 4 (`collect.py`) calls this with
  the new two-argument signature.

- [ ] **Step 1: Write the failing tests** — replace the entire contents of
  `tests/test_windows.py`:

```python
from datetime import datetime, timezone
import pytest
from collector.windows import Window, resolve_window

NOW = datetime(2026, 7, 20, 12, 0, tzinfo=timezone.utc)


def test_month_window():
    w = resolve_window("2026-06", now=NOW)
    assert (w.period_type, w.period_key) == ("month", "2026-06")
    assert w.since == datetime(2026, 6, 1, tzinfo=timezone.utc)
    assert w.until == datetime(2026, 7, 1, tzinfo=timezone.utc)


def test_current_month_resolved_from_now():
    w = resolve_window(None, now=NOW)
    assert (w.period_type, w.period_key) == ("month", "2026-07")
    assert w.until == NOW  # current month: collect up to now, not month-end


def test_past_month_capped_at_month_end_not_now():
    w = resolve_window("2026-06", now=NOW)
    assert w.until == datetime(2026, 7, 1, tzinfo=timezone.utc)  # not NOW


def test_december_rolls_over_to_next_year():
    w = resolve_window("2026-12", now=datetime(2027, 2, 1, tzinfo=timezone.utc))
    assert w.since == datetime(2026, 12, 1, tzinfo=timezone.utc)
    assert w.until == datetime(2027, 1, 1, tzinfo=timezone.utc)


def test_weeks_property():
    w = resolve_window("2026-06", now=NOW)  # June has 30 days
    assert w.weeks == pytest.approx(30 / 7)


@pytest.mark.parametrize("month", ["2026-13", "junk", "2026-6", "26-06", "2026-00"])
def test_invalid_month_raises(month):
    with pytest.raises(ValueError):
        resolve_window(month, now=NOW)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_windows.py -v`
Expected: FAIL — `resolve_window()` still requires `anchor`/`length_days`
positional args, so every call above raises `TypeError: resolve_window()
missing 2 required positional arguments`.

- [ ] **Step 3: Rewrite `collector/windows.py`**

Replace the entire file:

```python
import re
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class Window:
    period_type: str  # always 'month'
    period_key: str   # '2026-06'
    since: datetime
    until: datetime

    @property
    def weeks(self) -> float:
        return (self.until - self.since).total_seconds() / (7 * 86400)


def resolve_window(month: str | None, now: datetime | None = None) -> Window:
    """Resolve a collection window: the given calendar month, or the current
    one. Past months are capped at their natural end so re-collecting an old
    month never absorbs newer activity; the current month is capped at now."""
    now = now or datetime.now(timezone.utc)

    if month:
        m = re.fullmatch(r"(\d{4})-(\d{2})", month)
        if not m or not 1 <= int(m.group(2)) <= 12:
            raise ValueError(f"month must look like YYYY-MM, got {month!r}")
        year, mon = int(m.group(1)), int(m.group(2))
    else:
        year, mon = now.year, now.month

    since = datetime(year, mon, 1, tzinfo=timezone.utc)
    next_month = datetime(year + (mon == 12), mon % 12 + 1, 1, tzinfo=timezone.utc)
    return Window("month", f"{year:04d}-{mon:02d}", since, min(now, next_month))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_windows.py -v`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add collector/windows.py tests/test_windows.py
git commit -m "refactor: drop sprint window resolution, month-only calendar math

resolve_window() no longer takes anchor/length_days — those existed purely
for per-project sprint math which no longer exists."
```

---

### Task 4: Remove `--sprint` and sprint predictability from `collect.py`

**Files:**
- Modify: `collector/collect.py`
- Test: `tests/test_collect.py`

**Interfaces:**
- Consumes: `resolve_window(month, now=None)` from Task 3 (no `anchor`/
  `length_days` args to pass anymore).
- Produces: `build_counts(...)` with the `sprint_issue_counts` parameter
  removed entirely (not defaulted to `None` — deleted). `main()` no longer
  accepts `--sprint`.

- [ ] **Step 1: Write the failing tests** — replace `tests/test_collect.py`'s
  `Window` fixture and the two sprint-predictability tests:

```python
from datetime import datetime, timezone
from collector.collect import build_counts
from collector.windows import Window

FIELD = "customfield_10200"
W = Window("month", "2026-07",
           datetime(2026, 7, 1, tzinfo=timezone.utc),
           datetime(2026, 7, 31, tzinfo=timezone.utc))


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
        issues=[], incidents=[], field=FIELD,
    )
    assert counts["ai_prs"] == 1
    assert counts["total_prs"] == 1
    assert counts["engineers_active"] == 1
    assert counts["deploys"] == 1
    assert "sprint_committed" not in counts
    assert "sprint_completed" not in counts
    assert counts["lead_time_h"] is not None
    assert counts["rework_prs"] == 0


def test_build_counts_includes_segmented_and_jira_metrics():
    prs = [pr(1, ["ai-assisted"]), pr(2)]
    issues = [{"fields": {FIELD: {"value": "Assisted"},
                          "assignee": {"accountId": "a"},
                          "resolutiondate": "2026-07-01T12:00:00Z",
                          "customfield_10301": {"value": "Claude Code"},
                          "customfield_10302": 3.0}}]
    counts = build_counts(
        window=W, prs=prs, all_prs=prs, pr_files={1: ["tests/test_a.py"], 2: ["b.py"]},
        deploy_times=[], code_alerts=[], secret_alerts=[],
        issues=issues, incidents=[], field=FIELD,
        pr_file_details={1: [{"filename": "tests/test_a.py", "additions": 5, "deletions": 1}],
                         2: [{"filename": "b.py", "additions": 30, "deletions": 0}]},
        pr_reviews={1: [{"state": "APPROVED", "submitted_at": "2026-07-01T09:00:00Z"}]},
        tool_field="customfield_10301", time_saved_field="customfield_10302",
    )
    assert counts["lead_time_ai_h"] == 2.0 and counts["lead_time_nonai_h"] == 2.0
    assert counts["rework_from_ai_prs"] == 0
    assert counts["ai_prs_with_tests"] == 1
    assert counts["pr_size_ai"] == 6.0 and counts["pr_size_nonai"] == 30.0
    assert counts["first_review_ai_h"] == 1.0 and counts["review_rounds_ai"] == 0.0
    assert counts["ai_time_saved_h"] == 3.0
    assert counts["ai_tasks_tool_claude_code"] == 1


def test_build_counts_backward_compatible_without_new_args():
    counts = build_counts(
        window=W, prs=[], all_prs=[], pr_files={}, deploy_times=[],
        code_alerts=[], secret_alerts=[], issues=[], incidents=[],
        field=FIELD,
    )
    assert counts["ai_time_saved_h"] is None
    assert "ai_tasks_tool_claude_code" not in counts
```

(`test_build_counts_without_sprint_predictability` is deleted outright — its
behavior, "no sprint_issue_counts param means no sprint_committed key," is now
simply always true and covered by the first test's new assertions.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_collect.py -v`
Expected: FAIL — every call above omits `sprint_issue_counts`, which
`build_counts` still requires as a positional/keyword arg with no default
(`TypeError: build_counts() missing 1 required keyword-only argument:
'sprint_issue_counts'`).

- [ ] **Step 3: Update `collector/collect.py`**

Remove the `sprint_issue_counts` parameter and its handling from
`build_counts` (`collector/collect.py:43-71`):

```python
def build_counts(window: Window, prs: list[dict], all_prs: list[dict],
                 pr_files: dict[int, list[str]], deploy_times: list[datetime],
                 code_alerts: list[dict], secret_alerts: list[dict],
                 issues: list[dict], incidents: list[dict], field: str,
                 pr_commits: dict[int, list] | None = None,
                 pr_file_details: dict[int, list[dict]] | None = None,
                 pr_reviews: dict[int, list] | None = None,
                 tool_field: str | None = None,
                 time_saved_field: str | None = None) -> dict:
    """Pure assembly of all raw counts for one window. No IO."""
    return {
        **adoption_counts(prs, issues, field),
        **delivery_counts(deploy_times, incidents, window.weeks),
        **quality_counts(prs, code_alerts, secret_alerts),
        **agent_counts(prs, pr_commits or {}),
        **rework_counts(prs, all_prs, pr_files),
        **segmented_lead_time(prs, deploy_times),
        **pr_size_medians(prs, pr_file_details or {}),
        **review_metrics(prs, pr_reviews or {}),
        **ai_tasks_by_tool(issues, tool_field),
        "lead_time_h": lead_time_hours(prs, deploy_times),
        "ai_prs_with_tests": ai_prs_with_tests(prs, pr_files),
        "ai_time_saved_h": ai_time_saved_hours(issues, time_saved_field),
        "ai_users_weekly_avg": ai_users_weekly_avg(prs, issues, field, window.since, window.until),
    }
```

Update `main()` (`collector/collect.py:74-141`) — remove the `--sprint` flag,
the `SPRINT_ANCHOR`/`SPRINT_LENGTH_DAYS`/`JIRA_BOARD_ID` import and usage, and
the `sprint_issue_counts` block:

```python
def main() -> None:
    parser = argparse.ArgumentParser(description="Collect AI SDLC raw metric counts")
    parser.add_argument("--month", default=None, help="Calendar month, e.g. 2026-06")
    parser.add_argument("--project", default=PROJECT_LABEL)
    parser.add_argument("--jira-project", default=JIRA_PROJECT)
    parser.add_argument("--repo", default=GITHUB_REPO)
    args = parser.parse_args()

    missing = [flag for flag, value in [("--project (or PROJECT_LABEL)", args.project),
                                        ("--repo (or GH_REPO)", args.repo),
                                        ("--jira-project (or JIRA_PROJECT)", args.jira_project)]
               if not value]
    if missing:
        print(f"ERROR: missing required project config: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    try:
        window = resolve_window(args.month)
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
    pr_reviews = {p["number"]: gh.get_pr_reviews(p["number"]) for p in prs}
    prs = set_review_counts(prs, pr_reviews)
    pr_file_details = {p["number"]: gh.get_pr_files(p["number"]) for p in all_prs}
    pr_files = {n: [f["filename"] for f in d] for n, d in pr_file_details.items()}
    agent_numbers = [p["number"] for p in prs
                     if any(l["name"] == "ai-agent" for l in p.get("labels", []))]
    pr_commits = {n: gh.get_pr_commits(n) for n in agent_numbers}

    deploy_times = gh.get_production_deploy_times(
        DEPLOY_COUNT_STRATEGY, GH_PROD_ENV, window.since, window.until)
    code_alerts = gh.get_code_scanning_alerts(window.since, window.until)
    secret_alerts = gh.get_secret_scanning_alerts(window.since, window.until)
    extra_fields = tuple(f for f in (JIRA_AI_TOOL_FIELD, JIRA_AI_TIME_SAVED_FIELD) if f)
    issues = jira.get_closed_issues(window.since, window.until, extra_fields=extra_fields)
    incidents = jira.get_incidents(window.since, window.until)

    counts = build_counts(window, prs, all_prs, pr_files, deploy_times,
                          code_alerts, secret_alerts, issues, incidents,
                          JIRA_AI_USAGE_FIELD,
                          pr_commits=pr_commits, pr_file_details=pr_file_details,
                          pr_reviews=pr_reviews, tool_field=JIRA_AI_TOOL_FIELD,
                          time_saved_field=JIRA_AI_TIME_SAVED_FIELD)

    written = upsert_counts(REPORTING_DB_URL, args.project, window.period_type,
                            window.period_key, window.since.date(),
                            window.until.date(), counts)
    non_null = {k: v for k, v in counts.items() if v is not None}
    print(f"Upserted {written} metric rows: {non_null}")
```

And the import block (`collector/collect.py:13-18`):

```python
from collector.config import (
    GITHUB_TOKEN, GITHUB_REPO, GH_PROD_ENV,
    DEPLOY_COUNT_STRATEGY, JIRA_BASE, JIRA_PROJECT, JIRA_EMAIL, JIRA_TOKEN,
    JIRA_AI_USAGE_FIELD, REPORTING_DB_URL, PROJECT_LABEL,
    JIRA_AI_TOOL_FIELD, JIRA_AI_TIME_SAVED_FIELD,
)
```

Also update the module docstring (`collector/collect.py:1-9`):

```python
#!/usr/bin/env python3
"""
Collect AI SDLC raw metric counts for one calendar month.

Usage:
  python -m collector.collect [--month 2026-06]
                              [--project Future] [--repo owner/repo]
                              [--jira-project FUT]
"""
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_collect.py -v`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add collector/collect.py tests/test_collect.py
git commit -m "refactor: remove --sprint flag and sprint predictability from collect.py

build_counts() no longer takes sprint_issue_counts. Sprint Predictability
has no honest month/quarter equivalent (spec's Decision section) — retired,
not translated."
```

---

### Task 5: Remove `get_sprint_issue_counts`/`resolve_board_id` from `jira_client.py`

**Files:**
- Modify: `collector/jira_client.py`
- Modify: `collector/config.py` (remove now-dead `JIRA_BOARD_ID`)
- Test: `tests/test_jira_client.py`

**Interfaces:**
- Consumes: nothing (this task only removes code — `collect.py` from Task 4
  no longer calls either method).
- Produces: nothing new. `JiraClient` keeps `get_closed_issues`,
  `get_incidents`, `get_issue_fields`, `update_issue_fields` unchanged.

- [ ] **Step 1: Delete the now-obsolete tests** — remove from
  `tests/test_jira_client.py`: `test_sprint_issue_counts_picks_overlapping_sprint`,
  `test_resolve_board_id_returns_first_sprint_capable_board`,
  `test_resolve_board_id_accepts_team_managed_simple_board`,
  `test_resolve_board_id_none_when_project_has_no_board`,
  `test_resolve_board_id_none_on_api_error`,
  `test_sprint_issue_counts_none_when_no_overlap` (everything from the
  `test_sprint_issue_counts_picks_overlapping_sprint` def down to the end of
  the file, i.e. lines 138-198 in the current file).

- [ ] **Step 2: Run the file to confirm the remaining tests still pass as-is**

Run: `pytest tests/test_jira_client.py -v`
Expected: PASS (this step doesn't test new behavior — it confirms deleting
the obsolete tests didn't break anything else in the file before you touch
the implementation).

- [ ] **Step 3: Remove `resolve_board_id` and `get_sprint_issue_counts` from `collector/jira_client.py`**

Delete both methods (current lines 63-125 — everything between
`get_incidents` and `get_issue_fields`), leaving:

```python
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
```

- [ ] **Step 4: Remove `JIRA_BOARD_ID` from `collector/config.py`**

Delete:

```python
# Jira Agile board id for sprint predictability (committed vs completed).
# Optional override: when unset the collector auto-resolves the project's
# first scrum board; the metric is skipped only if no board exists.
JIRA_BOARD_ID: str | None = os.getenv("JIRA_BOARD_ID")
```

- [ ] **Step 5: Run the full test suite to confirm nothing else references the removed code**

Run: `pytest tests/test_jira_client.py tests/test_collect.py -v`
Expected: All PASS. (If anything else imports `JIRA_BOARD_ID`,
`resolve_board_id`, or `get_sprint_issue_counts`, this will fail with an
`ImportError`/`AttributeError` — grep first if unsure: `grep -rn
"JIRA_BOARD_ID\|resolve_board_id\|get_sprint_issue_counts" collector/
exporter/`.)

- [ ] **Step 6: Commit**

```bash
git add collector/jira_client.py collector/config.py tests/test_jira_client.py
git commit -m "refactor: remove get_sprint_issue_counts/resolve_board_id, JIRA_BOARD_ID

Both existed only to support Sprint Predictability, which is retired."
```

---

### Task 6: Remove sprint config vars and update docs

**Files:**
- Modify: `collector/config.py` (remove `SPRINT_ANCHOR`, `SPRINT_LENGTH_DAYS`)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing — by this point (after Tasks 3-4) nothing in `collector/`
  reads these two vars.
- Produces: nothing.

- [ ] **Step 1: Confirm nothing still references the vars**

Run: `grep -rn "SPRINT_ANCHOR\|SPRINT_LENGTH_DAYS" collector/ exporter/ tests/`
Expected: no output (Task 3/4 already removed every usage). If this prints
anything, stop and fix that usage first — do not delete the config out from
under a live caller.

- [ ] **Step 2: Remove from `collector/config.py`**

Delete:

```python
# Sprint calendar is per-project config, not hardcoded here — this repo is
# shared across every project's collector runs. Each project sets its own
# SPRINT_ANCHOR (first sprint's start date, ISO) and SPRINT_LENGTH_DAYS as
# env vars on its own workflow. Sprint N's start = anchor + (N-1)*length.
# Only required by collect.py, so optional here to not force it on other
# entrypoints (e.g. update_ticket.py) that share this config module.
SPRINT_ANCHOR: date | None = date.fromisoformat(os.environ["SPRINT_ANCHOR"]) if os.getenv("SPRINT_ANCHOR") else None
SPRINT_LENGTH_DAYS: int = int(os.getenv("SPRINT_LENGTH_DAYS", "14"))
```

Check whether `from datetime import date` (top of `collector/config.py`) is
still used elsewhere in the file after this deletion — if not, remove that
import too (`grep -n "date\." collector/config.py` after deleting, to be
sure; `datetime` itself isn't imported there so this only affects the `date`
name).

- [ ] **Step 3: Update `CLAUDE.md`**

Line 7 (repo description — "per-sprint rows into `reporting.ai_sprint_metrics`"
is already stale, predating the raw-counts schema; tighten while touching
this line):

```markdown
Shared collector for AI adoption + DORA metrics: reads GitHub (PRs, deployments, alerts) and Jira (issues, incidents), upserts raw metric counts per project/month into `reporting.metric_counts`, visualized by one shared Grafana (`infra/docker/compose.yml`, port 3030). The GitHub Actions workflows that invoke the collector live in each project's own repo, not here — this repo holds only the generic env-var-driven `collector/`, the schema (`infra/db/init.sql`), and Grafana dashboards/provisioning (`infra/grafana/`).
```

Line 15 (Commands — drop `--sprint`):

```markdown
python -m collector.collect [--month 2026-06] [--project Future] [--repo owner/repo] [--a1 0.8] [--b5 0.1] [--c3 0.65]
```

Line 25 (Architecture — "sprint metrics" wording):

```markdown
- **`collect.py`** — monthly metrics. Pure calculators in `metrics.py` (a2–a4 adoption, b2–b4 DORA, c1/c2/c4 quality, d1–d4 agent maturity); manual metrics a1/b5/c3 come in as CLI flags. `db.py` upserts with `COALESCE(EXCLUDED.col, existing.col)` — NULL never clobbers existing values, so partial re-runs are safe.
```

Line 31 (Key conventions — delete the sprint bullet entirely):

```markdown
- Jira custom field IDs are env vars (`JIRA_AI_USAGE_FIELD=customfield_XXXX`); incidents = issuetype `Incident`.
```

(This replaces the two-bullet block that had the sprint-anchor line above it —
the PR-labels bullet stays as the first bullet, unchanged.)

Line 36 (Config — drop `SPRINT_ANCHOR` from the optional-vars list):

```markdown
All env vars, read **at import time** in `collector/config.py`. Required: `METRICS_GH_TOKEN`, `JIRA_EMAIL`, `JIRA_TOKEN`, `JIRA_AI_USAGE_FIELD`. Only needed per-entrypoint (keep new config optional like these): `REPORTING_DB_URL` for collect, `JIRA_AI_TOOL_FIELD`/`JIRA_AI_TIME_SAVED_FIELD` for update_ticket. In CI the ambient `GITHUB_TOKEN` is mapped to `METRICS_GH_TOKEN` — deliberately no PAT.
```

- [ ] **Step 4: Run the full test suite**

Run: `pytest -v`
Expected: All PASS except (if you haven't started Plan 2 yet) any test that
depends on `infra/db/seed.sql` loading into a **fresh** Postgres volume with
`'sprint'` rows — per this plan's Global Constraints, that's an expected,
flagged interim gap closed by Plan 2, not a regression from this task. The
`pg_url` testcontainers fixture applies `init.sql`/`views.sql` fresh per test
run but does **not** load `seed.sql` (confirm this by checking
`tests/conftest.py` if any test unexpectedly fails here — `seed.sql` is only
consumed by `infra/docker/compose.local.yml`, not by pytest).

- [ ] **Step 5: Commit**

```bash
git add collector/config.py CLAUDE.md
git commit -m "docs: remove sprint config vars and update CLAUDE.md

SPRINT_ANCHOR/SPRINT_LENGTH_DAYS are dead now that collect.py is month-only."
```

---

## Self-Review

**Spec coverage:**
- ✅ `metric_counts.period_type` narrows to `('month')` — Task 1.
- ✅ Quarter as derived volume-weighted rollup (`v_metrics_q`) — Task 2.
- ✅ Collector loses `--sprint`, sprint window resolution,
  `sprint_committed`/`sprint_completed`, `SPRINT_ANCHOR`/`SPRINT_LENGTH_DAYS`
  — Tasks 3, 4, 6.
- ✅ Sprint Predictability retired, not translated — Task 4 (and Task 5 for
  the now-dead `get_sprint_issue_counts`/`resolve_board_id` support code).
- ✅ `CLAUDE.md` sprint bullet removed — Task 6.
- ⬜ Dashboard changes ($month/$granularity/$project vars, Predictability
  panel removal from Grafana), exporter changes (Monthly detail sheet,
  `?months=` filter), and `seed.sql` rewrite are **Plan 2** — out of scope
  here by design (see Global Constraints).

**Placeholder scan:** no TBD/TODO; every step has literal file paths, literal
code, and literal `pytest`/`grep` commands with stated expected output.

**Type consistency:** `resolve_window` is defined in Task 3 as
`resolve_window(month: str | None, now: datetime | None = None) -> Window`
and every later call (Task 4's `collect.py`, Task 3's own tests) uses that
exact two-argument shape — no task calls it with the old
`(sprint, month, anchor, length_days)` signature. `build_counts`'s signature
change (Task 4) is consistent between the test calls (Task 4 Step 1) and the
implementation (Task 4 Step 3) — no test passes `sprint_issue_counts` after
the rewrite.
