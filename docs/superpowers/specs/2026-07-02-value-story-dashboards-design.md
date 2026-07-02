# Value-Story Dashboards & Targeted Data Capture — Design

**Date:** 2026-07-02
**Status:** Approved (brainstorm with Canh)

## Problem

We collect ~25 metrics per project/period, but the dashboards present numbers, not
answers. BOD and PMs can't see cause & effect ("AI PRs went up — did lead time
actually drop?"), there is no ROI headline, and a few key signals are missing.
Separately, all presentation logic (panel layout, thresholds) is hardcoded in
`infra/grafana/generate.py`, identical for every project — projects like Future
(no production environment) can't be represented honestly.

## Goals

1. Restructure both dashboards around five named value stories, each answering a
   question BOD or the team actually acts on.
2. Add only the data each story needs (no data-first expansion).
3. Introduce a per-project customization layer so thresholds, applicable
   sections, and feature flags are config, not code.

**Non-goals:** per-engineer / individual metrics (explicitly rejected — everything
stays aggregate); CI build health, review depth, PR size, escaped defects
(deferred, see below); exporter redesign (it only needs to tolerate new metric
keys and respect `has_production`).

## Audiences and decisions served

- **BOD (portfolio dashboard):** justify AI spend (ROI), decide where to invest
  next, watch delivery health trend, track maturity progression, pick training
  targets.
- **Team (per-project dashboard):** PM steers the sprint and uses the same view
  to report upward; engineers view team aggregates. No individual breakdown.

## The five value stories

| # | Story (the question a panel row answers) | Audience |
|---|---|---|
| 1 | **Is AI paying off?** — $ saved vs tool cost, throughput/engineer | BOD |
| 2 | **Is AI work faster — and as good?** — AI vs non-AI lead time, rework attribution, review coverage | BOD + team |
| 3 | **Is delivery healthy?** — 4 DORA metrics + sprint predictability | BOD + PM |
| 4 | **Are we climbing the maturity ladder?** — stage 1–4 per project, agent funnel | BOD |
| 5 | **Where to invest / train next?** — adoption breadth per project | BOD |

Every dashboard panel must map to one of these stories (or PM sprint steering).
Panels that answer no question get removed.

## New collected metrics

All are pure functions in `collector/metrics.py`, returning `None` when there is
no data (never 0 — pairs with the NULL-preserving upsert). No new API calls
except one extra field in the existing Jira issue search.

| metric_key | Definition | Story |
|---|---|---|
| `lead_time_ai_h` | existing `lead_time_hours()` computed over the AI-labeled PR subset (`_is_ai_pr`) | 2 |
| `lead_time_nonai_h` | same, over the complement subset | 2 |
| `rework_from_ai_prs` | subset of `rework_prs` whose matched culprit PR was AI-labeled. In `rework_pr_count`, when a fix PR matches a prior non-fix PR by file overlap, record the culprit's AI status. Reverts with no file-overlap match stay in the total only (unattributed). | 2 |
| `ai_time_saved_h` | sum of `JIRA_AI_TIME_SAVED_FIELD` over closed issues in the window. The field is already written per-ticket by `update_ticket.py`; this aggregates it. `JIRA_AI_TIME_SAVED_FIELD` becomes an *optional* env var for the collect entrypoint — metric skipped (None) when unset. | 1 |

## New manual input

- `ai_tool_cost_monthly` (USD) — entered via the existing `collector/manual_input.py`
  monthly cadence and canon-field mechanism. Genuinely changes month to month, so
  it is data, not config.

(The blended hourly rate is **config**, not a manual input — see Customization.)

## New derived ratios

Two homes, split by whether the formula needs config values:

**Config-free ratios → `infra/db/views.sql`** (read-time, NULL-safe:
divide-by-zero and missing inputs → NULL):

- `change_failure_proxy` = `incidents / deploys` — the missing 4th DORA metric,
  as a proxy; both counts already collected
- `throughput_per_engineer` = `total_tasks / engineers_active`
- `lead_time_ai_delta_pct` = `(lead_time_nonai_h − lead_time_ai_h) / lead_time_nonai_h`
- `adoption_breadth_pct` = `ai_users_weekly_avg / engineers_active`
- `agent_pr_pct` = `agent_prs_total / total_prs`
- `autonomous_share_pct` = `agent_prs_autonomous / agent_prs_total`

**Config-dependent math → SQL emitted by `generate.py`** (a static view cannot
read `projects.json`; the generator embeds the project's config values as
literals in the panel SQL, and the exporter does the same in Python):

- `ai_savings_usd` = `ai_time_saved_h × blended_hourly_rate`
- `ai_net_usd` = `ai_savings_usd − ai_tool_cost_monthly` (cost joined from
  `manual_inputs`)
- `maturity_stage` — a CASE expression over the view ratios above, thresholds
  from config (defaults shown):
  - **Stage 1 Assisted:** any AI usage (`ai_tasks > 0` or `ai_prs > 0`)
  - **Stage 2 Adopted:** `adoption_breadth_pct` ≥ 50 AND AI PR % ≥ 30
  - **Stage 3 Agentic:** `agent_pr_pct` ≥ 10
  - **Stage 4 Autonomous:** `autonomous_share_pct` ≥ 50
  - Stages are cumulative: a project holds the highest stage for which it meets
    that stage's condition and every lower one. Thresholds come from
    `projects.json`, not constants.

## Dashboard restructure

Dashboards remain fully generated by `infra/grafana/generate.py` (never
hand-edited). `generate.py` becomes a pure renderer over per-project config.

### BOD portfolio dashboard — five story rows

1. **Is AI paying off?** — headline stat: $ saved vs tool cost this month, green
   when net-positive; savings trend; throughput-per-engineer trend.
2. **Is AI work faster — and as good?** — AI vs non-AI lead time paired per
   sprint; rework-from-AI as share of rework; AI PRs reviewed %.
3. **Delivery health** — four DORA metrics (incl. change-failure proxy) +
   predictability, threshold-colored.
4. **Maturity ladder** — per-project current stage (1–4) with direction arrow;
   agent funnel trend.
5. **Where to invest / train** — projects table sorted by adoption breadth
   (`ai_users_weekly_avg / engineers_active`), lowest highlighted = training
   targets.

### Per-project dashboard — steering first, stories second

- **Top row: PM sprint steering** — predictability, lead time, incidents/MTTR,
  rework; current sprint vs previous.
- Then the five stories scoped to the project (doubles as the PM's
  report-upward material).
- Monthly record table (auto + manual inputs) stays.
- Sections render only if listed in the project's effective `sections` config.

## Per-project customization model

**Principle: each knob lives with its natural owner, and each layer has exactly
one home.**

| Layer | Home | Owner | Examples |
|---|---|---|---|
| Collection runtime | Team repo caller workflow env vars — **unchanged** | Team | sprint anchor/length, deploy strategy, prod envs, Jira coordinates, secrets |
| Portfolio & presentation | `infra/grafana/projects.json` — **extended** | Platform (teams PR changes) | feature flags, thresholds, maturity rules, sections, blended rate |
| Period data | `manual_inputs` table — unchanged | PM/BOD via workflow | tool cost, engineer counts, governance fields |

`projects.json` gains a `defaults` block; each project may carry `overrides`
(deep-merged over defaults):

```json
{
  "exporter_url": "https://ai-metrics.seta-international.com",
  "defaults": {
    "blended_hourly_rate": 25,
    "has_production": true,
    "sections": ["steering", "roi", "cause_effect", "dora", "maturity", "adoption"],
    "thresholds": {"lead_time_h": [72, 168], "predictability_pct": [80, 60]},
    "maturity": {"adopted_breadth_pct": 50, "adopted_ai_pr_pct": 30,
                 "agentic_pr_pct": 10, "autonomous_share_pct": 50}
  },
  "projects": [
    {"name": "Future", "pm_login": "pm-future",
     "pm_email": "pm-future@seta-international.vn",
     "overrides": {"has_production": false}},
    {"name": "TeacherZone", "pm_login": "pm-teacherzone",
     "pm_email": "pm-teacherzone@seta-international.vn"}
  ],
  "bod_viewers": [{"login": "bod-viewer", "email": "bod@seta-international.vn"}]
}
```

Semantics:

- `generate.py` merges `defaults` + `overrides` per project and renders only the
  listed `sections`, coloring panels from the project's `thresholds`.
- `has_production: false` hides deploy-frequency and change-failure panels and
  labels lead time "merge lead time" (not DORA) — Future's real situation.
- Maturity thresholds and the blended rate are read from this config; nothing
  numeric stays hardcoded in `generate.py`.
- The exporter reads the same file (it already reads `exporter_url`) and
  respects `has_production`.
- Onboarding stays: one JSON entry here + one thin caller workflow in the team
  repo.

## Backfill

After the collector changes land, re-run `python -m collector.collect` for past
sprints/months per project so segmented lead time, rework attribution, and
time-saved have history from day one. Safe by design: the upsert is
NULL-preserving and re-runs are idempotent.

## Deferred (backlog, with the story each would serve)

- CI build success rate / duration (story 3) — mixed CI stack (mostly GitHub
  Actions) makes coverage patchy today.
- Time-to-first-review, PR size AI vs non-AI (story 2 refinement).
- Escaped defects from Jira (story 2, quality side).

Revisit once the story layout has survived a few BOD/PM review cycles.

## Testing

- New calculators: unit tests in `tests/test_metrics.py` — segmented lead time
  (incl. empty subsets → None), rework attribution (AI culprit / non-AI culprit /
  unattributed revert), time-saved summation and unset-field skip.
- View ratios: `tests/test_views.py` — new columns, NULL-safety on zero
  denominators and missing inputs.
- Config merge + section/flag rendering: `tests/test_dashboards.py` — overrides
  win over defaults, `has_production: false` drops the right panels, sections
  list controls rows, config values (rate, maturity thresholds) appear as
  literals in the emitted panel SQL.
- Manual field: `tests/test_manual_input.py` — `ai_tool_cost_monthly` canon name.
- Exporter: existing tests keep passing with new metric keys present.

## Implementation order (for the plan that follows)

1. Collector metrics + optional config var (+ tests)
2. Views (+ tests)
3. `projects.json` schema + config merge in `generate.py` (+ tests)
4. Dashboard story layout for project + BOD (+ tests)
5. Manual input field; exporter tolerance
6. Backfill runs
