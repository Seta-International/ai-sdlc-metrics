# Retire Sprint, Track by Month + Quarter — Design

**Date:** 2026-07-07
**Status:** Approved (brainstorm with Canh)
**Base:** `main` (a prior branch exploring some of this — `$granularity`,
`$project` filter, `v_metrics_q` — was deleted; its remote copy
`origin/refactor/bod-board-decision-first` still exists as a reference but
none of it is merged. This design rebuilds the relevant pieces fresh.)

## Problem

Every dashboard and half the collector is anchored to `S<n>` sprints:
`metric_counts.period_type` only allows `'sprint' | 'month'`, `collect.py`
takes `--sprint S6`, and both the BOD and per-project dashboards filter almost
everything on `period_type = 'sprint'`. Sprints are a per-project, 14-day,
anchor-date construct (`SPRINT_ANCHOR` + `SPRINT_LENGTH_DAYS` env vars) — they
don't align across projects, don't map cleanly to a board's reporting cadence,
and the CI workflows that drive collection live in other repos entirely
(per `CLAUDE.md`), so sprint boundaries are also opaque to this repo.

Canh: "we don't care about sprint anymore." This is a clean refactor —
tracking becomes **month** (the raw collected grain) and **quarter** (a
derived rollup), everywhere: schema, collector, both dashboard families,
tests, and seed data. No backward-compat shims, no dual-path code.

## Goals

1. `metric_counts.period_type` only ever contains `'month'`.
2. Quarter is a **derived, volume-weighted rollup** of month rows — never a
   raw collection window — used both for governance/maturity (already true
   today via `v_quarter_metrics`) and now for all operational ratio metrics.
3. Every dashboard panel that reads `period_type = 'sprint'` today reads
   `'month'` or `'quarter'` instead.
4. BOD dashboard gains a `$granularity` (Month/Quarter) and `$project`
   (multi-select) filter — it currently has neither.
5. Collector loses all sprint machinery: `--sprint` CLI flag, sprint window
   resolution, `sprint_committed`/`sprint_completed` collection,
   `SPRINT_ANCHOR`/`SPRINT_LENGTH_DAYS` config.

**Non-goals:**
- Backfilling historical sprint data into month rows. Old sprint rows in prod
  are left inert; Canh confirmed nothing needs migrating ("nothing is related
  to sprint anymore").
- Updating the other repos' CI workflows (Future/TeacherZone) to call
  `--month` instead of `--sprint` — that's real, necessary follow-up work but
  it lives in those repos, out of scope for this repo's plan. Flagged under
  Rollout below so it doesn't get silently forgotten.
- Preserving "Sprint Predictability" in any form (see Decision below).

## Decision: Sprint Predictability is dropped, not translated

`sprint_committed`/`sprint_completed` (→ `predictability_pct`) is only
populated `if window.period_type == "sprint"` (`collect.py:124`), sourced from
Jira's own Sprint board state (`jira_client.get_sprint_issue_counts`). There is
no honest month or quarter analog — a calendar month doesn't correspond to a
Jira sprint's committed/completed boundary, and approximating it via issue
due-dates would quietly change what the metric means on a board-facing
dashboard. Approach considered and rejected: recompute it from due-dates
(Approach C in brainstorming) — rejected because it fakes a metric rather than
retiring one honestly. The panel, its DORA/steering placement, and the
underlying collection code are all removed.

## Schema changes (`infra/db/init.sql`, `infra/db/views.sql`)

- `metric_counts.period_type` CHECK narrows from `IN ('sprint', 'month')` to
  `IN ('month')`.
- New view `reporting.v_metrics_q`: same output columns as `reporting.v_metrics`
  (so both can be read identically), one row per project per quarter, with
  every ratio **volume-weighted** — i.e. sum the underlying numerator and
  denominator counts across the quarter's 3 months, then divide — not
  `avg()` of three monthly percentages, which would weight a slow month
  equally to a busy one. `period_type` is a synthetic `'quarter'` literal
  (never a real raw value in `metric_counts`).
- `reporting.v_quarter_metrics` (governance flags feeding `v_levels`) is
  unchanged — different consumer, already quarter-native.
- A read helper (view or just the SQL pattern
  `SELECT * FROM v_metrics WHERE period_type='month' UNION ALL SELECT * FROM
  v_metrics_q`) lets any dashboard filter one combined stream on
  `period_type = '$granularity'`.

## Collector changes

- `collector/windows.py`: `resolve_window` drops the `sprint` branch entirely;
  `--month` (or no flag → current month) is the only path. `Window.period_type`
  becomes always `"month"`.
- `collector/collect.py`: remove `--sprint` argument; remove the
  `sprint_issue_counts` block (`get_sprint_issue_counts` call and the
  `sprint_committed`/`sprint_completed` counts it feeds).
- `collector/jira_client.py`: remove `get_sprint_issue_counts`.
- `collector/config.py`: remove `SPRINT_ANCHOR`, `SPRINT_LENGTH_DAYS`.
- `collector/quarterly.py` is unaffected — it already operates on
  `quarter_months()` derived from month keys, no sprint dependency.

## Dashboard changes (`infra/grafana/generate.py`)

**Project dashboards** (`build_project_dashboard`):
- `$sprint` template var → `$month` (query variable over
  `v_metrics WHERE period_type='month'`).
- Every section currently filtering `period_type = 'sprint'` (steering, ROI's
  tool-breakdown panel, cause-effect, DORA, adoption) switches to `'month'`
  and `period_key = '$month'`.
- "Sprint Predictability" stat removed from Steering and DORA sections.
- "AI Tasks by Tool ($sprint)" → "AI Tasks by Tool ($month)".
- Row title "Sprint Steering ($sprint)" → "Steering ($month)".
- Excel export link `sprints=${sprint}` → `months=${month}` (verify the
  exporter side accepts this param name — check `collector` exporter route
  before assuming).

**BOD dashboard** (`build_bod_dashboard`):
- Add `$granularity` (custom var, options `month`/`quarter`, default
  `month` — board members reviewing recent data by default, quarter for
  trend/governance context) and `$project` (query var, multi-select,
  include-all) template vars.
- Every "latest" panel (pulse stats, the four A/B/C/D score tables, evidence
  table) and every trend chart filters through both: `period_type =
  '$granularity'` against the combined month/quarter read, and `project IN
  ($project)`.
- This is new work on `main` (not a port — `main` has neither var today).

## Testing & seed data

- `tests/test_windows.py`, `tests/test_collect.py`, `tests/test_jira_client.py`:
  drop sprint-window/argument tests.
- `tests/test_db.py`, `tests/test_views.py`: drop sprint fixtures/assertions;
  add a volume-weighting correctness test for `v_metrics_q` (e.g. two months
  with different PR volumes must NOT average to the same result as equal
  weighting would — assert the weighted number).
- `tests/test_dashboards.py`: drop `$sprint`/Predictability assertions; add
  assertions for `$granularity`/`$project` vars existing on the BOD dashboard
  and for `$month` on project dashboards.
- `infra/db/seed.sql`: remove all `'sprint'` rows; ensure at least one project
  has ≥3 months of history (a full quarter) so `v_metrics_q` and the
  `$granularity` toggle are actually exercised locally, per
  `local-first-testing` — every guard branch needs to be visible in seed data,
  not just the happy path.

## Exporter changes (`exporter/`)

Discovered during planning — not a mechanical URL rename. `exporter/workbook.py`
has a whole extra "Sprint data" sheet (finer-grained ratio columns than sheet
3's raw counts) and `exporter/app.py`'s `/export.xlsx` takes a `?sprints=S1:S6`
range filter that expands to the months it overlaps
(`months_overlapped`) to also bound the "3. Monthly" sheet.

**Decision (approved):** rename the sheet to **"Monthly detail"**, reading the
same ratio columns (`SPRINT_SHEET_COLS` minus `sprint_committed`,
`sprint_completed`, `predictability_pct`) from **month** rows instead of
sprint rows. The URL filter becomes `?months=2026-01:2026-06` (a month-key
range, string-comparable since `YYYY-MM` sorts lexicographically). Concretely:
- `exporter/workbook.py`: `parse_sprint_range`/`sprint_in_range` →
  `parse_month_range`/`month_in_range` (compare `"YYYY-MM"` strings directly,
  no index parsing needed, unlike sprint's `S<n>`). `months_overlapped` is
  deleted — with sprint gone there's only one row-set (month rows) and no
  "expand sprint window to overlapping months" step needed. `fill_workbook`
  takes one `month_rows` param instead of `sprint_rows` + `month_rows`.
- `exporter/app.py`: `export(project, sprints=...)` → `export(project,
  months=...)`; drop the `months_overlapped` bridging step; filename becomes
  `ai-sdlc-maturity_{project}_{months or 'all'}.xlsx`.
- Every BOD/project dashboard "Download Excel" link
  (`export.xlsx?project=...&sprints=${sprint}`) updates to
  `...&months=${month}` (project dashboards) or drops the param (BOD "all").

## Docs

- `CLAUDE.md`: remove the "Sprint N starts at `SPRINT_ANCHOR + (N-1) *
  SPRINT_LENGTH_DAYS`..." bullet and the `--sprint S3` example in the Commands
  section; update the one-line repo description ("upserts per-sprint rows" is
  already stale language predating the raw-count schema, worth tightening
  while touching this line).

## Rollout (outside this repo's plan — flagged so it isn't lost)

- Future/TeacherZone CI workflows (in their own repos) must switch from a
  per-sprint `--sprint S<n>` cron to a monthly `--month` cron before/at the
  same time this ships, or they'll start failing (`--sprint` no longer exists).
  Canh's call, coordinated separately.
- Old prod `metric_counts` rows with `period_type='sprint'` are left in place,
  inert (excluded by the narrowed CHECK only for *new* inserts — existing rows
  aren't touched by a CHECK constraint change). No migration script planned;
  flag if a future cleanup is wanted.
