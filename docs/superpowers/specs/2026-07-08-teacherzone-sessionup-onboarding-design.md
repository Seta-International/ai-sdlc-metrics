# Onboard TeacherZone (SessionUp repo) — Design

**Date:** 2026-07-08
**Status:** Approved (brainstorm with Canh)
**Base:** `main`

## Problem

Future/agent-platform is already onboarded onto AI SDLC metrics end to end
(GitHub labels, Jira custom fields, shared reporting DB, Grafana dashboard).
TeacherZone needs the same onboarding, but its source repo is
`SETA-International-Vietnam/SessionUp` — a different org, a different Jira
Cloud site, and a different CI/CD style (manual `workflow_dispatch` Docker
builds, no GitHub Deployments/Releases/tags) than Future. `SETUP.md` already
documents the generic checklist; this design fills in the SessionUp-specific
choices and flags what's already done vs. still needed.

TeacherZone is a **partial** onboarding already: `infra/grafana/projects.json`
has had a `TeacherZone` entry since commit `6799d57` (2026-07-02), so its
Grafana dashboard folder already exists and auto-deploys on every push to
`main` in this repo. What's missing is everything on the SessionUp side that
would actually feed it data — labels, PR template, Jira fields, and the three
workflow files.

## Fixed values for this onboarding

| | |
|---|---|
| `PROJECT_NAME` | `TeacherZone` |
| GitHub repo | `SETA-International-Vietnam/SessionUp` (private) |
| `JIRA_KEY` | `SU` |
| `JIRA_SITE_URL` | `https://sessionupcom.atlassian.net` (own Jira Cloud site — separate from Future's `all-it.atlassian.net`, so its own credentials and its own copies of the 3 custom fields) |
| `deploy-strategy` | `workflow_runs:deploy-prod.yml` |

## Decision: deploy signal is `workflow_runs:deploy-prod.yml`

SessionUp's `deploy-prod.yml` is a manual `workflow_dispatch` that builds and
pushes 6 Docker images to AWS ECR, gated to `main`/`release/*` branches and
admin/maintain permission — it does not use GitHub Deployments, Releases, or
git tags. The collector's `get_production_deploy_times` already supports
`workflow_runs:<file>` (counts successful runs of a named workflow file in
the date window), which requires zero changes to SessionUp's existing deploy
pipeline. Rejected alternative: retrofitting `deploy-prod.yml` to deploy
through a GitHub Environment so `deploy-strategy: deployments` could be used
— more "GitHub-native," but changes a production deploy pipeline just to
satisfy a metrics collector, which isn't worth the risk.

## Decision: add a Jira `Incident` issue type, don't reuse `Bug`

DORA's change-failure-rate and MTTR (`collector/metrics.py: delivery_counts`)
specifically query issue type `Incident`
(`collector/jira_client.py: get_incidents`) — deploys ÷ incidents in-window,
and mean(resolved − created) for MTTR. SessionUp today files all bugs into
one bucket regardless of whether they were caught pre-release or found in
production, so reusing `Bug` would overstate change-failure-rate (pre-release
bugs never touched production) and pollute MTTR with non-incident resolution
times. Instead: add a new team-managed `Incident` issue type to the SU
project (same manual step `docs/jira-setup.md` already documents for
company-managed projects), and going forward, prod-impacting bugs get filed
there. No backfill of historical bugs into Incidents — B3/B4 simply show no
data until Incidents start accumulating, which is consistent with this
collector's "never a false 0" convention (`metrics.py` returns `None`, not
`0`, when there's no data).

## Scope, section by section

### 1. GitHub (SessionUp repo)

- Create labels `ai-assisted` / `ai-agent` (source of truth for AI usage
  detection, alongside the `Co-authored-by: Claude/Copilot` trailer
  fallback).
- Append to SessionUp's existing `.github/PULL_REQUEST_TEMPLATE.md` — same
  wording agent-platform uses, so `ai-sdlc-label-check.yml`'s regex matches
  unchanged:
  ```
  ## AI usage
  - [ ] AI assisted → add label `ai-assisted`
  - [ ] Agent created → add labels `ai-assisted` **and** `ai-agent`
  - AI time saved (hours): <!-- optional, e.g. 3 -->
  ```
- Skip branch protection / secret scanning changes — GHAS-gated on private
  repos without GitHub Pro (per `SETUP.md`), and neither is required for the
  collector to function.
- No GitHub "production" Environment needed — the deploy signal comes from
  workflow runs, not Environments (see Decision above).

### 2. Jira (`sessionupcom.atlassian.net`, project `SU`)

- Create the 3 custom fields (AI Usage select, AI Time Saved float, AI Tool
  select) per `docs/jira-setup.md`, using an API token for whichever account
  administers the SU site (Canh has admin access; token to be provided
  later).
- Manual team-managed-project steps (assumed team-managed like Future's
  project — to be confirmed against `GET /rest/api/3/project/SU`'s
  `simplified` flag when credentials are available): attach the 3 fields to
  SU's issue types, add the new `Incident` issue type, add a Done-transition
  workflow validator requiring AI Usage.

### 3. Reporting DB

- Reuse the existing shared `seta-reporting` RDS instance (the one
  Future/agent-platform already writes to) — no new AWS spend. Just reuse
  the same `REPORTING_DB_URL` / `REPORTING_DB_HOST` / `REPORTING_DB_PASSWORD`
  values as repo secrets on SessionUp too (per `SETUP.md`'s "Option A —
  reuse an existing RDS instance").

### 4. Repo secrets on SessionUp (`gh secret set ... --repo SETA-International-Vietnam/SessionUp`)

`JIRA_EMAIL`, `JIRA_TOKEN` (SU site's own — not Future's),
`JIRA_AI_USAGE_FIELD`, `JIRA_AI_TOOL_FIELD`, `JIRA_AI_TIME_SAVED_FIELD` (ids
from step 2), `REPORTING_DB_URL`, `REPORTING_DB_HOST`,
`REPORTING_DB_PASSWORD` (same values as Future's).

### 5. New workflow files in SessionUp's `.github/workflows/`

- `ai-sdlc-metrics.yml` — `templates/ai-metrics-caller.yml` filled with the
  values above (**month-based** `collect.yml`, current on `main` — not
  agent-platform's own copy, which is stale/sprint-based; see Note below).
- `ai-sdlc-label-check.yml` — copied verbatim from agent-platform
  (project-agnostic, no placeholders).
- `ai-sdlc-jira-sync.yml` — copied from agent-platform with
  `JIRA_PROJECT: SU` and `JIRA_BASE` pointed at
  `https://sessionupcom.atlassian.net`.

### 6. Grafana

- Already done: `TeacherZone` is in `infra/grafana/projects.json` and its
  dashboard folder auto-deploys on every push to `main` in this repo
  (`.github/workflows/deploy-dashboards.yml`).
- Still to run once (idempotent, safe to re-run): `python3
  infra/grafana/setup_access.py` on the Grafana host, to create/confirm the
  `pm-teacherzone` viewer login scoped to its folder — `infra/deploy.sh`
  (the auto-deploy path) only regenerates dashboards, it does not call
  `setup_access.py`.

## Note: agent-platform's own workflow has drifted

`agent-platform/.github/workflows/ai-sdlc-metrics.yml` still passes the old
sprint-based inputs (`sprint-anchor`, `mode: sprint`) even though the
reusable `collect.yml` in this repo moved to month-only weeks ago (commit
`8283a31` fixed the reusable workflow itself, but agent-platform's caller
copy wasn't updated). TeacherZone's caller workflow will be written against
the *current* template, not copied from agent-platform's stale one. Fixing
agent-platform's drift is real follow-up work, but it's out of scope here —
flagged so it isn't silently forgotten.

## Non-goals

- Backfilling historical SessionUp PRs/tickets into the collector — data
  collection starts from whenever the workflows land, same as every other
  project onboarding.
- Changing SessionUp's actual deploy pipeline (see Decision above).
- Fixing agent-platform's stale sprint-based workflow (see Note above).
- Determining whether SU is team-managed vs. company-managed ahead of time —
  deferred to execution, once Jira credentials are available (`docs/jira-setup.md`
  already branches on this).

## Rollout / open dependency

Everything in sections 2 and 4 needs a Jira API token for the
`sessionupcom.atlassian.net` site, which Canh will provide later. Sections 1,
5, and 6 (GitHub-side changes, workflow files, Grafana access script) don't
depend on it and can proceed independently.
