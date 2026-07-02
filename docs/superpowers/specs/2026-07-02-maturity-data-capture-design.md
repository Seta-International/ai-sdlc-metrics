# AI SDLC Maturity Data Capture + Grafana Excel Export — Design

**Date:** 2026-07-02
**Scope:** Future and TeacherZone projects at launch; further projects onboard via the existing caller-workflow pattern.
**Approach:** Clean refactor (v1). No dual versions, no backward compatibility, no legacy paths. The old schema and code paths are replaced, not wrapped.
**Reference:** metric definitions follow `docs/Khung chỉ số đo lường AI trong SDLC_24_June_2026.docx` (framework Bản 2.0) — the document the workbook implements.

## 1. Problem

`docs/SETA_AI_SDLC_Maturity.xlsx` drives the AI SDLC maturity assessment:

- **Sheet «3. Monthly»** — raw counts per project per month (adoption, delivery, quality, agent). Yellow cells, typed by hand today.
- **Sheet «4. Quarterly»** — governance checklist (G1–G8), judgment flags (a2…d5), evidence text. Ticked by hand today.
- Sheets 5–9 compute metrics, levels, and dashboards from those two via formulas.

The collector already pulls much of this from GitHub and Jira, but:

1. It stores **ratios** (a2 = 0.58) while sheet 3 needs **raw counts** (32 AI PRs / 55 total).
2. It runs on **sprint** windows while sheet 3 is keyed by **month**.
3. Several metrics are **not captured at all**: lead time, PR rework, engineers-using-AI, secret-scanning alerts.
4. Some values are **genuinely manual** (headcount, cost, coverage, quarterly judgments) with no defined place or cadence for entry.
5. Filling the workbook is manual transcription; there is no export.

## 2. Goals

1. Automate everything automatable; give each manual value one defined place, owner, and cadence.
2. Single source of truth: Postgres holds raw counts; every ratio is derived at read time (Grafana, exporter). Zero drift between dashboard and workbook.
3. On-demand export from Grafana: the filled maturity workbook (+ raw sprint data), filtered by project (one or all) and sprint range.
4. One dashboard per project plus a single company-wide BOD dashboard, with per-PM accounts restricted to their own project.
5. **English everywhere**: the exported Excel workbook and all Grafana dashboards (and workflow form labels) are in English. The Vietnamese workbook stays as source material only.

## 3. Metric capture matrix — Sheet «3. Monthly»

| Col | Meaning (VN header) | Capture | Source & method |
|-----|--------------------|---------|-----------------|
| D | KS dùng AI/tuần | **Auto (proxy)** | Weekly distinct humans who authored an `ai-assisted`/`ai-agent` PR or closed a Jira issue with AI-usage ≠ None; month value = mean of weeks. Bots excluded via `BOT_LOGINS`. Framework doc prescribes license counts + a short quarterly survey — the quarterly review cross-checks the proxy against license seats/survey and can override via `manual_inputs`. |
| E | Tổng KS | **Manual** | Monthly input form (prefilled from previous month; changes rarely). |
| F | PR gắn AI | **Auto** | GitHub merged PRs with `ai-assisted` label (count). |
| G | Tổng PR | **Auto** | GitHub merged PRs (count). |
| H | Task giao agent | **Auto** | Jira closed issues with AI-usage field = `Agent` (count). |
| I | Tổng task | **Auto** | Jira closed issues (count). |
| J | Lead time (h) | **Auto (new)** | DORA lead time per the framework doc: median hours from PR merge → first production deploy after it (commit→production approximation from data already fetched). Falls back to PR opened→merged when the period has no deploys. |
| K | Số deploy | **Auto** | GitHub deployments to `GH_PROD_ENV` (count). |
| L | Số tuần | **Auto** | Calendar weeks in the period (derived, not fetched). |
| M | Deploy lỗi | **Auto (proxy)** | Jira incidents created in period (existing CFR-numerator proxy). |
| N | MTTR (h) | **Auto** | Mean hours Jira incident created → resolved. |
| O | Cost baseline/đv | **Manual** | Monthly input form (PM/finance). |
| P | Cost actual/đv | **Manual** | Monthly input form (PM/finance). |
| Q | PR rework ≤14d | **Auto (new, heuristic)** | Merged PRs that modify a file touched by another PR merged in the preceding 14 days, plus revert PRs. Heuristic, but consistent month over month. |
| R | PR-AI có review | **Auto** | AI-labeled PRs with ≥1 approved review (count). |
| S | Coverage AI (%) | **Manual** (until CI coverage exists) | Monthly input form; switch to CI-artifact pull when the Future pipeline reports coverage. |
| T | Vulns/secrets chặn | **Auto** | GitHub code-scanning alerts **+ secret-scanning alerts** (new) in period. |
| U | Agent xong đạt | **Auto** | `ai-agent` PRs merged (count). |
| V | Agent cần sửa | **Auto** | `ai-agent` PRs with ≥1 human (non-bot) commit (count). |
| W | Agent end-to-end | **Auto** | `ai-agent` PRs with zero human commits (count). |
| X | Agent cycle (h) | **Auto** | Median hours `ai-agent` PR opened → merged. |

## 4. Capture matrix — Sheet «4. Quarterly»

| Flags | Capture | Method |
|-------|---------|--------|
| G1 AGENTS.md | **Auto-check** | File exists in repo default branch (GitHub contents API). |
| G3 Review bắt buộc | **Auto-check** | Branch protection on default branch requires ≥1 review (GitHub API). |
| G6 Security controls | **Auto-check (partial)** | Code scanning + secret scanning enabled (GitHub API). PM may override. |
| a2 dashboard, a4 near-universal, b4 DORA cải thiện, c3 scan CI, Z/d4 "đã đo" flags | **Auto-suggest** | Derived from `metric_counts` presence/trends; script proposes Yes/No, PM confirms. |
| b6 business outcomes (evidence) | **Auto-suggest (partial)** | Sprint predictability (issues completed ÷ committed per Jira sprint) computed into «Sprint data»; production bug trend = incident counts. PM cites these + release speed/CSAT (manual) as b6 evidence. |
| G2, G4, G5, G7, G8, b5–b8, c4–c9, d3, d5 | **Manual (judgment)** | Ticked at the quarterly review. |
| Evidence A–E, Improvement action | **Manual (text)** | Written at the quarterly review. |

## 5. Data model (Postgres)

The existing per-sprint ratio table is **dropped**. New schema:

```sql
metric_counts (
  project      text,         -- 'Future'
  period_type  text,         -- 'sprint' | 'month'
  period_key   text,         -- 'S6' | '2026-06'
  period_start date,
  period_end   date,
  metric_key   text,         -- 'ai_prs', 'total_prs', 'lead_time_h', ...
  numerator    numeric,      -- raw count / value
  denominator  numeric,      -- null for scalar metrics (lead time, MTTR)
  collected_at timestamptz,
  PRIMARY KEY (project, period_type, period_key, metric_key)
)

manual_inputs (
  project     text,
  period_key  text,          -- '2026-06' or '2026-Q2'
  field       text,          -- 'total_engineers', 'cost_baseline', 'cost_actual',
                             -- 'coverage_ai', 'g2_ai_policy', ..., 'evidence_a', ...
  value       text,          -- numbers and Yes/No/text uniformly; typed at read time
  entered_by  text,
  entered_at  timestamptz,
  PRIMARY KEY (project, period_key, field)
)
```

Ratios are never stored. Grafana panels and the exporter compute them in SQL (e.g. `ai_prs.numerator / total_prs.numerator`).

## 6. Collector refactor

- Single window abstraction: `--sprint S6` **or** `--month 2026-06` → `(since, until)`; all fetching/computation downstream is window-agnostic. Sprint resolution keeps the existing anchor+cadence formula.
- Metric functions return raw `(numerator, denominator)` or scalar values; no ratio math in the collector.
- New metrics implemented: `lead_time_h` (merge→deploy), `rework_prs`, `ai_users_weekly_avg`, `secret_alerts`, `sprint_predictability` (sprint periods only, from Jira sprint committed vs completed).
- CLI manual flags (`--a1 --b5 --c3`) **removed**; manual data enters only via `manual_inputs`.
- Schedules (GitHub Actions, existing caller-workflow pattern):
  - Per sprint: existing cadence, `period_type='sprint'`.
  - Monthly: 1st of each month for the prior calendar month, `period_type='month'`.

### 6.1 Deployment counting across heterogeneous CI/CD

Each project deploys differently (Actions + self-hosted compose, Jenkins, manual, …). The **GitHub Deployments API is the contract**; how records get there is per-project:

- **Actions with `environment:`** (e.g. agent-platform `deploy.yml`): records are created automatically. Per-project config is just `GH_PROD_ENV` — the environment name that counts as "production" for metrics.
- **Non-Actions CI/CD** (Jenkins, GitLab, scripts): the pipeline creates the record with one API call. This repo ships a `record-deployment` composite action plus a documented curl snippet, so projects adopt it without writing code.
- **Pipeline can't be touched**: collector fallback strategy per project via `DEPLOY_COUNT_STRATEGY` env: `deployments` (default) | `releases` | `tags:<pattern>` | `workflow_runs:<workflow-name>`. Config only, no per-project code.

**Known issue to fix at rollout:** Future's `deploy.yml` only defines `dev`/`uat` environments while the collector defaults to `GH_PROD_ENV=production`, so its deploy count is currently always 0. Set `GH_PROD_ENV: uat` in the Future caller config (switch when a real production environment exists).

### 6.2 Code placement & cross-project reuse

All logic lives in **this repo**; project repos hold only configuration:

- **This repo**: collector, exporter, DB migrations, Grafana provisioning, and **reusable workflows** (`workflow_call`): `collect.yml` (sprint + monthly schedules), `manual-input.yml` (form → `manual_inputs`), `quarterly-check.yml` (auto-check/auto-suggest flags), plus the `record-deployment` composite action and a caller-workflow template in `templates/`.
- **Project repo** (e.g. `agent-platform/.github/workflows/`): one thin caller workflow (~15 lines) that `uses:` the reusable workflows from this repo, passing project config (repo, Jira project key, project label, sprint anchor/length, `GH_PROD_ENV`, deploy strategy) and secrets. Existing conventions stay project-side where they belong: `ai-label-check.yml`, PR labels, Jira field usage.
- Onboarding a project = copy the caller template, fill ~8 config values, add secrets. No collector changes.

## 7. Manual input flow

- **Monthly (first business day):** PM runs the `metrics-manual-input` workflow (`workflow_dispatch` with form inputs): total engineers, cost baseline/đv, cost actual/đv, coverage AI %. Writes `manual_inputs` rows for the prior month. ~2 minutes.
- **Quarterly (first week of quarter):** the quarterly auto-check script runs first and seeds `manual_inputs` with auto-checked/auto-suggested flags. At the quarterly review meeting the PM confirms/overrides flags and enters judgment flags + evidence + improvement action via the same workflow form (quarter mode).

## 8. Exporter service

- **FastAPI + openpyxl** container in the existing `infra/docker` compose stack, alongside Grafana.
- `GET /export.xlsx?project=Future&sprints=S1:S6` (project = one name or `all`).
- Sprint labels are per-project (each project has its own anchor + cadence), so with `project=all` the range `S1:S6` resolves against each project's own calendar.
- Project identity: the workbook keys rows by ProjectID (`P01`, …) via sheet «2. Projects»; the exporter maintains that sheet as the mapping ProjectID ↔ project name (Future, TeacherZone, …) and writes sheet 3/4 rows using it.
- Uses a committed **English template** `docs/SETA_AI_SDLC_Maturity_EN.xlsx` — a one-time translation of the current workbook (sheet names, headers, instructions, level descriptions) with identical structure, formulas, thresholds, and level logic in sheets 5–9. Building this template is part of implementation; the Vietnamese original remains in `docs/` as reference. The exporter only fills:
  - **Sheet 3** rows: one row per project per month overlapped by the selected sprint range — auto values from `metric_counts` (month periods), manual columns (E/O/P/S) from `manual_inputs`; missing values left blank (yellow, formulas tolerate blanks via IFERROR).
  - **Sheet 4** rows: one row per project per quarter in range — flags and evidence from `manual_inputs`.
  - **Appended sheet «Sprint data»**: one row per project per sprint with all raw counts and derived ratios — the sprint-granular view the monthly sheets can't express.
- **Grafana integration:** link panels on each project dashboard (own project pinned) and on the BOD dashboard (`all` or selectable project) pointing at the exporter URL with the sprint-range variable interpolated.
- **Auth:** sits behind the same network / reverse-proxy boundary as Grafana; no separate login in v1.

## 9. Grafana — dashboards and access control

Provisioned dashboard JSON in `infra/grafana` is rewritten against `metric_counts` + `manual_inputs` in the same change — panels compute ratios in SQL. No transition period; the old table does not exist after migration.

All dashboards, panel titles, legends, and variable labels are in **English**.

**Dashboard layout:**

- **One project dashboard per project** (Future, TeacherZone, …): current-sprint operational view + sprint-over-sprint trends, provisioned from a single dashboard template with the project pinned (not a free variable), one Grafana folder per project.
- **One company BOD dashboard**: portfolio view across all projects — per-project maturity snapshot, sprint-over-sprint DORA/adoption trends, project comparison. Lives in a `BOD` folder.

**Access control (Grafana OSS features only):**

- Per-PM **Viewer accounts**; folder permissions grant each PM view access to their own project folder only. BOD folder visible to management accounts only. Admin retains everything.
- Folder/dashboard permissions are OSS; nothing here requires Grafana Enterprise. Viewers cannot use Explore, so they cannot query other projects' data through the shared datasource.
- Provisioned as config where possible (folders, dashboards); user accounts + folder permission grants are a documented one-time admin step per onboarded project (Grafana HTTP API script in `infra/grafana`).
- The exporter endpoint is reachable from dashboards; it takes the project from the dashboard link, and project dashboards only link to their own project's export. (Exporter-side enforcement per user is out of scope for v1 — same trust boundary as today's shared Grafana.)

## 10. Error handling

- Collector: a metric that fails to compute is skipped with a warning (row absent → NULL semantics downstream); other metrics still upsert. A hard failure of GitHub/Jira auth fails the run loudly (Actions red).
- Exporter: unknown project → 404; empty range → template with no data rows; missing manual inputs → blank cells, never fabricated values.
- Manual-input workflow validates numeric fields and rejects unknown quarters/months.

## 11. Testing

- Unit tests (pytest, existing `tests/` layout) with fixture payloads for: lead-time median, rework file-overlap heuristic (incl. revert detection), weekly-distinct AI-user proxy, secret-alert counting, window resolution (`--sprint`/`--month`).
- DB layer: upsert idempotency for `metric_counts` and `manual_inputs`.
- Exporter: golden-file test — generate a workbook from fixture DB rows, re-open with openpyxl, assert sheet 3/4 cell values and «Sprint data» rows; assert template formulas survived.

## 12. Rollout

1. Schema migration (`infra/db`): create `metric_counts` + `manual_inputs`, drop old table.
2. Collector refactor + new metrics + monthly schedule (Future first); convert to reusable workflows (`workflow_call`) with the thin-caller pattern; fix Future's `GH_PROD_ENV` (currently counts 0 deploys); build the English workbook template.
3. Grafana rebuilt on new schema: project-dashboard template, Future + TeacherZone project dashboards in per-project folders, company BOD dashboard, PM viewer accounts + folder permissions (API script).
4. **Onboard TeacherZone**: caller workflow + secrets (GitHub token/repo, Jira project), sprint anchor env vars, PM account. Requires from the team: TeacherZone's GitHub repo, Jira project key, sprint anchor date, and the same `ai-assisted`/`ai-agent` label + Jira AI-usage field conventions applied in that project.
5. Manual-input workflow; PMs enter current month's values for both projects.
6. Exporter service + Grafana download links (per-project and all-projects from BOD dashboard).
7. Quarterly auto-check script (must land before the Q3 review, first week of October 2026).
8. Further projects: repeat step 4's pattern.

## 13. Out of scope (v1)

- True DORA lead time (commit → production deploy linkage).
- Copilot/Claude admin-API usage ingestion (col D stays proxy-based).
- CI coverage ingestion for col S (manual until the Future pipeline emits coverage).
- Grafana-native rendering of maturity levels (sheets 6–9 stay Excel-only).
- Any backward compatibility with the pre-refactor schema or CLI.
