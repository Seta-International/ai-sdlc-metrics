# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Shared collector for AI adoption + DORA metrics: reads GitHub (PRs, deployments, alerts) and Jira (issues, incidents), upserts per-sprint rows into `reporting.ai_sprint_metrics` (keyed `sprint_label` + `project`), visualized by one shared Grafana (`infra/docker/compose.yml`, port 3030). The GitHub Actions workflows that invoke the collector live in each project's own repo, not here — this repo holds only the generic env-var-driven `collector/`, the schema (`infra/db/init.sql`), and Grafana dashboards/provisioning (`infra/grafana/`).

## Commands

```bash
pip install -r requirements-dev.txt
pytest                                # from repo root
pytest tests/test_db.py::test_name    # single test; test_db.py needs Docker (testcontainers Postgres)
python -m collector.collect [--sprint S3] [--project Future] [--repo owner/repo] [--a1 0.8] [--b5 0.1] [--c3 0.65]
python -m collector.update_ticket --pr 123
```

No linter/formatter configured. HTTP in tests is mocked with `responses`; no real credentials needed (`tests/conftest.py` stubs env vars).

## Architecture

Two entrypoints share `config.py` + `github_client.py` + `jira_client.py`:

- **`collect.py`** — sprint metrics. Pure calculators in `metrics.py` (a2–a4 adoption, b2–b4 DORA, c1/c2/c4 quality, d1–d4 agent maturity); manual metrics a1/b5/c3 come in as CLI flags. `db.py` upserts with `COALESCE(EXCLUDED.col, existing.col)` — NULL never clobbers existing values, so partial re-runs are safe.
- **`update_ticket.py`** — on PR merge, writes AI Usage/Tool/Time Saved back to the Jira ticket. Best-effort: every failure is logged and swallowed (must never block the merge pipeline). Merge policy (`ticket_extract.compute_field_updates`): usage never downgrades (None < Assisted < Agent), tool set once, hours accumulate.

Key conventions the metrics depend on:

- PR labels `ai-assisted` / `ai-agent` are the source of truth; `Co-authored-by: Claude/Copilot` trailers are the fallback for usage detection.
- Sprint N starts at `SPRINT_ANCHOR + (N-1) * SPRINT_LENGTH_DAYS` (per-project env vars); labels look like `S3`.
- Jira custom field IDs are env vars (`JIRA_AI_USAGE_FIELD=customfield_XXXX`); incidents = issuetype `Incident`.

## Config

All env vars, read **at import time** in `collector/config.py`. Required: `METRICS_GH_TOKEN`, `JIRA_EMAIL`, `JIRA_TOKEN`, `JIRA_AI_USAGE_FIELD`. Only needed per-entrypoint (keep new config optional like these): `SPRINT_ANCHOR`/`REPORTING_DB_URL` for collect, `JIRA_AI_TOOL_FIELD`/`JIRA_AI_TIME_SAVED_FIELD` for update_ticket. In CI the ambient `GITHUB_TOKEN` is mapped to `METRICS_GH_TOKEN` — deliberately no PAT.

## Gotchas & conventions

- Keep the explicit `name:` in compose files — Compose derives project name from the directory (`docker/`) and otherwise deletes same-named stacks' containers as orphans.
- `get_code_scanning_alerts` treats 403/404 as "no alerts" — expected on private repos without GHAS.
- Metric calculators / parsers are pure functions returning `None` when there's no data (never 0 — pairs with the NULL-preserving upsert); keep new ones in that style.
- Commits: conventional prefix + Jira key, e.g. `feat: FUT-373 auto-update Jira AI fields`.
- `privates/` is gitignored (local credential notes) — never commit it.
- New-project onboarding is in SETUP.md; Jira field setup in `docs/jira-setup.md` (team-managed projects need manual browser steps for field attachment).
