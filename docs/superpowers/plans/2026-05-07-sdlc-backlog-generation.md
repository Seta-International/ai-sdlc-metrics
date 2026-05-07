# SDLC Backlog Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate 8 sprint-ready, atlassian-pushable markdown files (1 portfolio overview + 7 backlog files containing ~145 MVP-in tickets and ~14 Backlog tickets) under `docs/superpowers/specs/`, materializing the validated spec at `docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md`.

**Architecture:** Pure documentation. No code. Each batch produces independent files using the templates in §5 of the spec, with content derived from the source SRSs (`agents-srs.md`, `planner-srs.md`) and the architecture docs. Atlassian-readiness is enforced via grep/awk verification scripts so files can be pushed to Jira via `atlassian:spec-to-backlog` later. Files are committed batch-by-batch so each batch is independently reviewable and revertable.

**Tech Stack:** Markdown (Prettier-formatted, GFM tables), Bash + grep + awk for verification, lefthook pre-commit hooks (auto-format check).

**Spec reference:** `docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md` at commit `36edab8f`. Pin every section reference to this spec — do not invent content.

**Source SRS references:**

- `docs/architecture/agents-srs.md` (1339 lines) — FR-001..FR-088, UI-001..UI-023, NFR-001..NFR-023.
- `docs/architecture/planner-srs.md` (1487 lines) — FR-PL-001..FR-PL-067, UI-PL-001..UI-PL-025.

---

## File Structure

The 8 output files all live under `docs/superpowers/specs/`:

| File                               | Owner               | Tickets | Source                                                                |
| ---------------------------------- | ------------------- | ------- | --------------------------------------------------------------------- |
| `2026-05-07-portfolio-overview.md` | Portfolio index     | (table) | Spec §6, §7, §10, §13 — distilled                                     |
| `2026-05-07-foundation-backlog.md` | FOUND-1..4 (Done)   | ~14     | Spec §6.1; built code at `apps/`, `packages/`                         |
| `2026-05-07-people-backlog.md`     | PEOPLE-1, PEOPLE-2  | ~7      | Spec §6.2; CLAUDE.md People ownership                                 |
| `2026-05-07-deployment-backlog.md` | DEPLOY-1..3         | ~14     | Spec §6.3; `docs/architecture/deployment.md`                          |
| `2026-05-07-planner-backlog.md`    | PLAN-1..7           | ~45     | Spec §6.4; `planner-srs.md` FR-PL-001..067                            |
| `2026-05-07-agents-backlog.md`     | AGN-1..7            | ~48     | Spec §6.5; `agents-srs.md` FR-001..088                                |
| `2026-05-07-web-admin-backlog.md`  | ADMIN-1             | ~4      | Spec §6.6                                                             |
| `2026-05-07-docs-sdlc-backlog.md`  | DOC-1, DOC-2, DOC-3 | ~18     | Spec §6.7 + §7 hardening (DOC-3 added for cross-cutting S6 hardening) |

Each file is **self-contained** — an engineer handed any one of these files has everything needed (templates, blocker resolutions inline, traceability table at bottom for Planner/Agents).

The plan also produces shared assets:

- `docs/superpowers/plans/.scripts/verify-backlog.sh` — verification script used between tasks (created in Task 0, reused throughout).

---

## Task 0: Set up the verification harness

**Files:**

- Create: `docs/superpowers/plans/.scripts/verify-backlog.sh`

The verification script is the "test" run after each backlog file is written. It enforces atlassian-readiness per spec §14.1 (ticket-recognition contract) and §5.1 (field set).

- [ ] **Step 1: Create the script**

```bash
mkdir -p docs/superpowers/plans/.scripts
cat > docs/superpowers/plans/.scripts/verify-backlog.sh <<'BASH'
#!/usr/bin/env bash
# Verify a backlog markdown file is atlassian-pushable per
# docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md §14.1 + §5.1.
#
# Usage: verify-backlog.sh <file.md>
# Exits non-zero on any check failure; prints a summary on success.

set -euo pipefail

f="${1:?usage: verify-backlog.sh <file.md>}"
[[ -f "$f" ]] || { echo "FAIL: $f does not exist"; exit 1; }

echo "=== Verifying $f ==="

# 1. Ticket-recognition contract — at least one Epic, recognized markers only.
epics=$(grep -cE '^## \[EPIC\] ' "$f" || true)
stories=$(grep -cE '^### \[STORY\] ' "$f" || true)
tasks=$(grep -cE '^### \[TASK\] ' "$f" || true)
echo "Epics: $epics  Stories: $stories  Tasks: $tasks"

if [[ "$epics" -lt 1 && "$f" != *portfolio-overview* ]]; then
  echo "FAIL: no Epic blocks found"; exit 1
fi

# 2. Required field presence (skip portfolio overview which has no tickets).
if [[ "$f" != *portfolio-overview* ]]; then
  required=(ID Status Epic Sprint Release Priority "Story Point" Rank "Jira Key" "Confluence Link")
  # Epic blocks have a slightly looser set — Epic field absent on Epic itself.
  for header in "## \[EPIC\] " "### \[STORY\] " "### \[TASK\] "; do
    blocks=$(grep -cE "^$header" "$f" || true)
    [[ "$blocks" -eq 0 ]] && continue
    for field in "${required[@]}"; do
      if [[ "$header" == "## \[EPIC\] " && "$field" == "Epic" ]]; then continue; fi
      count=$(grep -cE "^$field:" "$f" || true)
      if [[ "$count" -lt "$blocks" ]]; then
        echo "FAIL: '$field' field count ($count) < ticket count for $header ($blocks)"
        exit 1
      fi
    done
  done
fi

# 3. ID uniqueness within file.
dup_ids=$(grep -E '^ID:' "$f" | awk '{print $2}' | sort | uniq -d || true)
if [[ -n "$dup_ids" ]]; then
  echo "FAIL: duplicate IDs in $f:"; echo "$dup_ids"; exit 1
fi

# 4. Epic references on Story/Task tickets — every 'Epic:' value must match an
#    Epic ID declared via '## [EPIC] <ID> ...' OR an 'ID:' on an Epic block.
epic_ids=$(grep -oE '^## \[EPIC\] [A-Z]+-[0-9]+' "$f" | awk '{print $3}' | sort -u || true)
referenced=$(grep -E '^Epic:' "$f" | awk '{print $2}' | sort -u || true)
for ref in $referenced; do
  if ! echo "$epic_ids" | grep -qx "$ref"; then
    echo "WARN: Epic reference '$ref' not declared in this file (may be a cross-file reference; check portfolio overview)."
  fi
done

# 5. Markdown formatting.
if command -v bunx >/dev/null 2>&1; then
  bunx prettier --check "$f" >/dev/null || { echo "FAIL: prettier formatting"; exit 1; }
fi

echo "OK: $f passes atlassian-readiness checks"
BASH
chmod +x docs/superpowers/plans/.scripts/verify-backlog.sh
```

- [ ] **Step 2: Smoke-test the script against the spec itself**

The spec is not a backlog — but running the script confirms it doesn't crash on a markdown file.

Run: `docs/superpowers/plans/.scripts/verify-backlog.sh docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md || true`
Expected: prints "Epics: 0 Stories: 0 Tasks: 0" then warns/passes (script exits 1 because epics < 1 — that's expected on non-backlog input).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/.scripts/verify-backlog.sh
git -c commit.gpgsign=false commit -m "tooling(specs): add backlog verification script"
```

---

## Batch 1 — Scaffold (portfolio + foundation + docs-sdlc)

Smallest files. Validate template shape before bulk write. Three files in this batch.

### Task 1: Generate `2026-05-07-portfolio-overview.md`

**Files:**

- Create: `docs/superpowers/specs/2026-05-07-portfolio-overview.md`

This file is an **index**, not a ticket file. It has no Epic / Story / Task blocks. It carries: project metadata, sprint plan, initiative index, capacity model, risk register, deferred / out-of-scope appendix.

- [ ] **Step 1: Write the file**

Use the structure below verbatim (substituting `<TICKET_COUNTS_TBD>` placeholders only after Tasks 2–25 produce final per-file counts in Task 26).

```markdown
# Future Phase-1 Portfolio Overview

| Field         | Value                                                                           |
| ------------- | ------------------------------------------------------------------------------- |
| Date          | 2026-05-07                                                                      |
| Project start | 2026-04-23                                                                      |
| MVP demo      | 2026-05-31                                                                      |
| Today         | 2026-05-07 (start of Sprint 3)                                                  |
| Methodology   | Scrum, 1-week sprints, AI-leveraged velocity                                    |
| Output target | Markdown — atlassian-pushable via `atlassian:spec-to-backlog`                   |
| Source design | `docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md` at commit `36edab8f` |

## 1. Initiatives

| #   | Initiative  | File                               | Epics  |     MVP | Backlog |   Total |
| --- | ----------- | ---------------------------------- | ------ | ------: | ------: | ------: |
| 1   | Foundation  | `2026-05-07-foundation-backlog.md` | 4      |      14 |       0 |      14 |
| 2   | People      | `2026-05-07-people-backlog.md`     | 2      |       3 |       4 |       7 |
| 3   | Deployment  | `2026-05-07-deployment-backlog.md` | 3      |      14 |       0 |      14 |
| 4   | Planner     | `2026-05-07-planner-backlog.md`    | 7      |      45 |       2 |      47 |
| 5   | Agents      | `2026-05-07-agents-backlog.md`     | 7      |      40 |       8 |      48 |
| 6   | Web Admin   | `2026-05-07-web-admin-backlog.md`  | 1      |       4 |       0 |       4 |
| 7   | Docs / SDLC | `2026-05-07-docs-sdlc-backlog.md`  | 3      |      18 |       0 |      18 |
|     | **Total**   |                                    | **27** | **138** |  **14** | **152** |

(Counts updated in Task 26 after all backlogs are written; placeholders adjust ±5.)

## 2. Sprint plan

| Sprint | Window                       | Goal                                                                                                                  | State       |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------- |
| S1     | 2026-04-23 → 2026-04-29      | Monorepo + toolchain ready (FOUND-1)                                                                                  | Done        |
| S2     | 2026-04-30 → 2026-05-06      | Backend + frontend + auth + DB skeletons ready (FOUND-2,3,4)                                                          | Done        |
| **S3** | **2026-05-07 → 2026-05-13**  | Staging deployable; People profile CRUD + Planner CRUD + Agents chat skeleton; **all 4 contracts published S3 day-1** | **Current** |
| S4     | 2026-05-14 → 2026-05-20      | Planner views + hubs + sync core; Agents KB + RAG + exec-mode; Deploy prod                                            | —           |
| S5     | 2026-05-21 → 2026-05-27      | **MVP feature-complete + linking.** Code freeze at S5 close.                                                          | —           |
| S6     | 2026-05-28 → 2026-05-31 (4d) | **Hardening only.** Bug fixes, perf/a11y, security, demo prep, RTM verification.                                      | —           |

## 3. Capacity model

- Active engineering team: 3 feature engineers + 1 DevOps engineer (user reassigns track allocation).
- AI-leveraged velocity assumption: ~45 SP per engineer per 1-week sprint.
- Team capacity S3–S6 ≈ 540 SP feature work + 135 SP deployment = ~675 SP.
- Backlog load (after merges): ~138 active tickets, avg 4 SP ≈ ~550 SP. Slack ≈ 125 SP for unknowns and S6 hardening.

## 4. Definitions

### 4.1 Definition of Ready (project-level)

Inherited from `skills/sdlc/references/standards.md` §"Definition of Ready" with the added requirement that every Story has at least one **E2E** AC item that ticks only when the user-visible flow works end-to-end.

### 4.2 Definition of Done (project-level)

Inherited from `skills/sdlc/references/standards.md` §"Definition of Done" with these project-specific additions:

- Tests pass at ≥70% line / function / branch coverage (per `CLAUDE.md`).
- Cross-module changes ship the Drizzle schema change in `0000_initial.sql` (single-file migration policy).
- For RLS-touching changes: a synthetic dual-tenant probe assertion is added or updated.
- For agent / kernel audit-emitting changes: a kernel audit-event assertion is added.

## 5. Risk register

(Mirrors `2026-05-07-sdlc-backlog-design.md` §8. Update both files together.)

| #   | Risk                                                 | Mitigation                                                                                           |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | Compressed Planner+Agents window (S3–S5).            | Parallel tracks, AC checkboxes for partial credit, late-cut to phase-1.5 if velocity <100 SP/sprint. |
| 2   | MS-365 sync E2E testing requires real tenant access. | Book Microsoft sandbox tenant by S3 day-2.                                                           |
| 3   | Source SRS dates wrong.                              | DOC-1 SRS amendment ticket.                                                                          |
| 4   | Zero cross-tenant exposure launch gate.              | Synthetic dual-tenant probe in DEPLOY-3.                                                             |
| 5   | AI-leveraged velocity unproven.                      | Re-baseline at S3 retro.                                                                             |
| 6   | AC checkbox-as-progress masks incomplete work.       | Every Story has E2E AC item.                                                                         |
| 7   | GDPR right-to-erasure compliance gate.               | DOC-1 runbook (PEOPLE-2 GDPR Story is Backlog).                                                      |
| 8   | Parallel-track integration drift.                    | S3 day-1 contract publication (4 contracts).                                                         |
| 9   | S5 overload at ~39 tickets.                          | Code-freeze threshold mid-week; late-cut PLAN-6 polish + AGN-7 model-degradation if behind.          |
| 10  | AI-led deployment Definition of Done.                | Every DEPLOY-\* Story has `human-review` AC.                                                         |
| 11  | Hiring lead time vs May.                             | Out of scope; user owns.                                                                             |
| 12  | No QA role on team.                                  | Engineering self-tests; named owner per launch gate.                                                 |
| 13  | Kernel + Identity folded into consumer ACs.          | Add tickets if real Phase-1 work surfaces.                                                           |
| 14  | People + Web Admin + Docs have no named owner.       | User reassigns; default fold into Track A / B.                                                       |
| 15  | Single-engineer Planner track bus-factor.            | Reviewer named in DoD.                                                                               |
| 16  | Agents FE/BE split needs internal contract.          | AGN-1 contract publication on S3 day-1.                                                              |
| 17  | S6 hardening surfaces unfixable bugs.                | S5 close = explicit go/no-go gate.                                                                   |

## 6. Deferred — explicitly not ticketed (Phase-1.5+ candidates)

- **Planner (per `planner-srs §1.5.2.1`):** Copy Plan, Export Excel/CSV, per-bucket colour, custom fields, conditional coloring, People view, agile sprints/backlog, custom calendars, Copilot in Planner, **per-occurrence recurrence edits**, **server-side rich-text editing of new descriptions**.
- **Agents (per `agents-srs §1.5`):** cross-conversation memory, multi-region, multi-AI failover at runtime, OCR ingestion, LLM-as-judge automated quality scoring, Slack/Teams channel surfaces, event-source triggers from `outbox_event`.
- **Modules:** `time`, `hiring`, `performance`, `projects`, `finance`, `goals`, `insights` — future SRS amendments.

## 7. Atlassian sync

Push to Jira via `atlassian:spec-to-backlog` per `2026-05-07-sdlc-backlog-design.md` §14. Pre-push setup:

- Confirm Jira project key (e.g., `FUTURE`).
- Confirm `Sprint` and `Story Points` and `Rank` custom fields exist.
- Sprints S1..S6 should be pre-created OR the skill creates them on first push.
- Fix Versions (`foundation`, `deployment`, `phase-1`, `phase-1.5`, `docs`) created on first push.

## 8. Foundation note

Foundation (FOUND-1..4) was completed in Sprints S1–S2 (week of 2026-04-23 → 2026-05-06). All FOUND tickets are retroactive `Status: Done` for SDLC trace; see `2026-05-07-foundation-backlog.md`.
```

- [ ] **Step 2: Run verification**

Run: `docs/superpowers/plans/.scripts/verify-backlog.sh docs/superpowers/specs/2026-05-07-portfolio-overview.md`
Expected: "Epics: 0 Stories: 0 Tasks: 0 OK: ... passes atlassian-readiness checks" (portfolio is exempt from Epic-count check).

- [ ] **Step 3: Format with Prettier**

Run: `bunx prettier --write docs/superpowers/specs/2026-05-07-portfolio-overview.md`

### Task 2: Generate `2026-05-07-foundation-backlog.md`

**Files:**

- Create: `docs/superpowers/specs/2026-05-07-foundation-backlog.md`

Per spec §6.1: 4 Epics (FOUND-1..4), all `Status: Done`, ~14 Tasks total. Every Task has full AC checklist with `[x]` ticked, plus `Built artefact:` line in `AI Execution Notes` pointing at the code path. No persona "As X, I want Y" Stories — these are technical Tasks.

- [ ] **Step 1: Write file header**

```markdown
# Foundation Backlog

**Source design:** `docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md` §6.1.
**State:** Completed in Sprints S1–S2 (2026-04-23 → 2026-05-06). All tickets `Status: Done`.
**Purpose:** Retroactive SDLC trace. Each Task documents what was built and where the artefact lives.
**Tickets:** 4 Epics, ~14 Tasks.

---
```

- [ ] **Step 2: Write Epic FOUND-1 — Monorepo & toolchain**

Use the Epic template from spec §5.2. Then write 4 child Tasks below it.

```markdown
## [EPIC] FOUND-1 Monorepo & toolchain

ID: FOUND-1
Status: Done
Sprint: Sprint-1
Release: foundation
Priority: P0
Story Point: 13
Rank: 100
Jira Key:
Confluence Link:

### Summary

Turborepo + bun monorepo, eslint/tsconfig/lefthook/docker-compose.local, scripts. Foundation for all subsequent module work.

### Goal

By S1 close, a fresh `bun install` + `bun run db:up` + `bun run dev` produces a running local stack across all 11 web zones + the API.

### Scope

- Turborepo + bun workspaces
- Shared eslint, tsconfig, prettier configs in `packages/eslint-config`, `packages/tsconfig`
- lefthook pre-commit hooks (format-check, ddd-boundaries, design-tokens, ui-components)
- `docker-compose.local.yml` for Postgres + Redis + minio
- Repo-level scripts in `scripts/`

### Out of Scope

- Production CI/CD (DEPLOY-2)
- Production infra (DEPLOY-1)

### SRS Coverage

n/a — infrastructure, not user-visible behavior.

### Acceptance Criteria

- [x] `bun install` from clean clone completes without errors.
- [x] `turbo run build --filter=@future/*` builds all workspace packages.
- [x] `lefthook run pre-commit` passes on a no-op commit.
- [x] `bun run db:up` starts the local Postgres + Redis stack.

### Child Tickets

- FOUND-1.T1 Turborepo + bun workspace bootstrap (Task)
- FOUND-1.T2 Shared eslint / tsconfig / prettier configs (Task)
- FOUND-1.T3 lefthook pre-commit pipeline (Task)
- FOUND-1.T4 Docker Compose local stack (Task)

### Definition of Done

- All child Tasks `Status: Done`.
- A new engineer can clone the repo and run `bun install && bun run dev` on a fresh machine without manual intervention.
```

For each child Task, use the Task template from spec §5.4. Example for FOUND-1.T1:

```markdown
### [TASK] FOUND-1.T1 Turborepo + bun workspace bootstrap

ID: FOUND-1.T1
Status: Done
Epic: FOUND-1
Sprint: Sprint-1
Release: foundation
Priority: P0
Story Point: 5
Rank: 110
Jira Key:
Confluence Link:

#### Summary

Initialize Turborepo with bun as the package manager. Configure `turbo.json` pipelines for build, test, lint. Declare `apps/*` and `packages/*` workspaces.

#### Requirements

- Root `package.json` declares workspaces `apps/*` and `packages/*`.
- `turbo.json` defines pipelines: `build`, `dev`, `lint`, `typecheck`, `test`.
- `bunfig.toml` exists at repo root with sane defaults.
- `.npmrc` is absent (we use bun, not npm).

#### Acceptance Criteria

- [x] `bun install` completes without errors on a fresh clone.
- [x] `turbo run build --filter=@future/*` builds every workspace package.
- [x] `turbo run dev --filter=web-shell` starts the shell zone.
- [x] **E2E** — A developer running `bun install && cd apps/web-shell && bun run dev` sees the shell at `http://localhost:3000` within 90s of clean clone.

#### AI Execution Notes

**Built artefact:** `package.json`, `turbo.json`, `bun.lock`, `bunfig.toml`, `apps/`, `packages/`.

#### Testing Notes

- Manual: clone-and-build smoke test on a fresh machine.
- CI: `turbo run build --filter=@future/*` runs on every PR.

#### Dependencies

- Blocked by: none
- Blocks: FOUND-1.T2, FOUND-1.T3, FOUND-1.T4

#### Definition of Done

- Inherits project DoD.
- A new engineer can build the repo from a fresh clone in under 5 minutes.
```

Repeat the Task block for FOUND-1.T2 (eslint/tsconfig/prettier), FOUND-1.T3 (lefthook), FOUND-1.T4 (docker-compose). Use the same field set; vary Summary, Requirements, AC, and Built artefact paths per task.

- [ ] **Step 3: Write Epic FOUND-2 — Backend & data layer**

Per spec §6.1, FOUND-2 has ~5 child Tasks: NestJS skeleton + module template (hex+DDD), tRPC, Drizzle + schema-per-module, RLS middleware + tenant_id contract, request-bound DB.

Apply the same Epic + Tasks shape as FOUND-1. Built artefact paths point at `apps/api/src/`, `packages/db/`, `packages/event-contracts/`. Each Task ranks 210, 220, 230, 240, 250.

- [ ] **Step 4: Write Epic FOUND-3 — Frontend skeleton & design system**

Per spec §6.1, FOUND-3 has ~3 child Tasks: Next.js multi-zones + web-shell SSO/magic-link, app-layout + sidebar contract, ui design system + DESIGN.md + cross-cutting FE packages. Built artefact paths point at `apps/web-shell/`, `packages/app-layout/`, `packages/ui/`, `DESIGN.md`. Ranks 310, 320, 330.

- [ ] **Step 5: Write Epic FOUND-4 — Auth & session**

Per spec §6.1, FOUND-4 has ~2 child Tasks: `packages/auth` (parse-token, use-session, me-route, navigation), session cookie contract + IdP shape. Built artefact paths point at `packages/auth/src/`. Ranks 410, 420.

- [ ] **Step 6: Run verification**

Run: `docs/superpowers/plans/.scripts/verify-backlog.sh docs/superpowers/specs/2026-05-07-foundation-backlog.md`
Expected: "Epics: 4 Stories: 0 Tasks: 14 OK: ... passes atlassian-readiness checks"

If failure: every error message names the failing field; fix inline.

- [ ] **Step 7: Format with Prettier**

Run: `bunx prettier --write docs/superpowers/specs/2026-05-07-foundation-backlog.md`

### Task 3: Generate `2026-05-07-docs-sdlc-backlog.md`

**Files:**

- Create: `docs/superpowers/specs/2026-05-07-docs-sdlc-backlog.md`

Per spec §6.7 + §7 Hardening column: 3 Epics — DOC-1 (Architecture / ADRs / runbooks), DOC-2 (SDLC process / PR/CI hygiene), and DOC-3 (S6 Hardening cross-cutting Tasks added by this plan to absorb the 15 hardening tickets that don't fit a feature epic). Total ~18 Tasks. All Tasks (no Stories — pure SDLC work).

- [ ] **Step 1: Write Epic DOC-1 — Architecture, ADRs, runbooks**

Apply Epic template. Tickets:

- DOC-1.T1 SRS amendment for MVP scope and date defect (Task — references spec §13 D13 + risk #3).
- DOC-1.T2 ADR for cross-module facade pattern (Task).
- DOC-1.T3 ADR for outbox event delivery (Task).
- DOC-1.T4 ADR for parallel-track contract publication (Task).
- DOC-1.T5 Runbook for prod cutover (Task — cross-link DEPLOY-3).
- DOC-1.T6 Runbook for incident response (Task).
- DOC-1.T7 Runbook for GDPR erasure (Task — Backlog, since GDPR pipeline is Backlog).

Sprint placement:

- DOC-1.T1: Sprint-3 (early, so SRS reflects MVP scope before backlog write). Priority P0.
- DOC-1.T2..T5: Sprint-4 / Sprint-5 (rolling).
- DOC-1.T6: Sprint-5.
- DOC-1.T7: Sprint: Backlog (cascade from PEOPLE-2 Backlog).

- [ ] **Step 2: Write Epic DOC-2 — SDLC process & PR/CI hygiene**

Tickets:

- DOC-2.T1 PR template enforcing AC checkbox + DoD reference (Task — Sprint-3).
- DOC-2.T2 lefthook hooks for typecheck / lint / test (Task — Sprint-3, may already be partially done; note in AC).
- DOC-2.T3 CONTRIBUTING.md updates (Task — Sprint-4).
- DOC-2.T4 Release-notes template (Task — Sprint-6).

- [ ] **Step 3: Write Epic DOC-3 — S6 Hardening (cross-cutting)**

Per spec §7, S6 hardening = 15 Tasks: ~6 bug-fix, ~3 perf/a11y tuning, ~2 security review, ~2 demo prep, ~2 RTM verification. All Sprint-6, all Priority P0, all Tasks.

Examples:

- DOC-3.T1..T6 Bug-fix placeholders BF-01..BF-06 (Task — content carved from S5 testing).
- DOC-3.T7 Performance tuning — TTFT p95 ≤ 2.5s verification (Task; references agents-srs NFR-001).
- DOC-3.T8 Performance tuning — KB ingestion p95 ≤ 60s for ≤1MB docs (Task; agents-srs NFR-006).
- DOC-3.T9 Accessibility audit — WCAG 2.1 Level AA across all UI surfaces (Task; agents-srs NFR-020 + planner-srs).
- DOC-3.T10 Security review — RLS dual-tenant probe pass (Task; cross-link DEPLOY-3).
- DOC-3.T11 Security review — OWASP LLM Top-10 walkthrough (Task; agents-srs §security threat model).
- DOC-3.T12 MVP demo script + sample tenant setup (Task).
- DOC-3.T13 MVP demo recording + dry-run (Task).
- DOC-3.T14 RTM verification — Planner Appendix D walk-through (Task).
- DOC-3.T15 RTM verification — Agents Appendix D walk-through (Task).

For each, fill the Task template completely. AC of bug-fix placeholders reads "Resolves bug ticket BF-NN with reproduction steps + fix verified in staging + regression test added."

- [ ] **Step 4: Run verification**

Run: `docs/superpowers/plans/.scripts/verify-backlog.sh docs/superpowers/specs/2026-05-07-docs-sdlc-backlog.md`
Expected: "Epics: 3 Stories: 0 Tasks: 18 OK: ... passes atlassian-readiness checks"

- [ ] **Step 5: Format with Prettier**

Run: `bunx prettier --write docs/superpowers/specs/2026-05-07-docs-sdlc-backlog.md`

### Task 4: Commit Batch 1

- [ ] **Step 1: Stage and commit**

```bash
git add docs/superpowers/specs/2026-05-07-portfolio-overview.md \
        docs/superpowers/specs/2026-05-07-foundation-backlog.md \
        docs/superpowers/specs/2026-05-07-docs-sdlc-backlog.md
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
specs(backlog): generate Batch 1 — portfolio + foundation + docs-sdlc

Per docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md §11 Output writing
strategy. Three smallest files first to validate template shape before bulk write.

- portfolio-overview.md: index + sprint plan + capacity + risk register + deferred appendix
- foundation-backlog.md: FOUND-1..4, ~14 retroactive Done Tasks with Built artefact paths
- docs-sdlc-backlog.md: DOC-1..3, ~18 Tasks including S6 hardening cross-cutting tickets

All files pass docs/superpowers/plans/.scripts/verify-backlog.sh.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Verify commit landed**

Run: `git log -1 --stat`
Expected: 3 new files added under `docs/superpowers/specs/`.

---

## Batch 2 — Small initiatives (people + web-admin + deployment)

### Task 5: Generate `2026-05-07-people-backlog.md`

**Files:**

- Create: `docs/superpowers/specs/2026-05-07-people-backlog.md`

Per spec §6.2 + §13 D14: PEOPLE-1 (Profiles + exact-subject facade) MVP, PEOPLE-2 (Placements + offboarding + GDPR + fuzzy facade) Backlog.

- [ ] **Step 1: Write file header**

```markdown
# People Backlog

**Source design:** `docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md` §6.2 + §13 D14.
**MVP scope:** PEOPLE-1 (Profiles + exact-subject facade) only. PEOPLE-2 → `Sprint: Backlog`.
**Tickets:** 2 Epics, ~3 MVP Stories + ~4 Backlog Stories.

**Personas served (per spec §1):**

- Tenant administrator — manages employment profiles via web-admin (ADMIN-1) host shell.
- Owner of another module (programmatic) — calls `PeopleQueryFacade.resolveByExactSubject()`.
- End user (data subject) — GDPR right-to-erasure (Backlog).

---
```

- [ ] **Step 2: Write Epic PEOPLE-1 — Profiles & exact-subject facade (MVP)**

Apply Epic template. SRS coverage `n/a` (no people-srs). Goal: by S3 close, every persisted assignment in Planner resolves through `PeopleQueryFacade.resolveByExactSubject()`.

Child Stories (3):

- PEOPLE-1.S1 Employment profile CRUD (Story; persona = Tenant administrator)
- PEOPLE-1.S2 PeopleQueryFacade contract publication (Story, **SP=2 contract on S3 day-1** per spec §3 + §13 T1-3 + §6.2)
- PEOPLE-1.S3 Exact-subject resolver implementation (Story; persona = Owner of another module)

For PEOPLE-1.S2, the AC explicitly requires:

- [ ] Type definition `PeopleQueryFacade` published in `packages/event-contracts/src/people.ts`.
- [ ] Method `resolveByExactSubject(sub: string): Promise<UserProfile | null>` declared.
- [ ] Both Planner and Agents tracks can `import { PeopleQueryFacade } from '@future/event-contracts'` and mock against it.
- [ ] **E2E** — A Planner Story written against this contract typechecks against the published interface.

For PEOPLE-1.S3, the AC includes:

- [ ] `resolveByExactSubject` returns the user profile for a given SSO `sub` claim.
- [ ] Returns `null` if subject is unknown.
- [ ] Survives directory mutations to display name and email (planner-srs FR-PL-033 cross-link).
- [ ] kernel `audit_event` row written for every facade call (per §13 T1-2).
- [ ] **E2E** — A Planner task created with assignee resolved through this facade survives a directory rename in the SSO IdP.

- [ ] **Step 3: Write Epic PEOPLE-2 — Placements, offboarding, GDPR, fuzzy facade (Backlog)**

All child stories carry `Sprint: Backlog` and a `Backlog reason:` line in `AI Execution Notes` referencing spec §13 D14 + D15.

Child Stories (4):

- PEOPLE-2.S1 Org placements (manager/reportee, teams, departments, placement history) (Story; persona = Tenant administrator)
- PEOPLE-2.S2 Offboarding lifecycle (deactivation, transfers) (Story; persona = Tenant administrator)
- PEOPLE-2.S3 GDPR right-to-erasure pipeline (Story; persona = End user / data subject; SP=8, `needs-human-review` derived from Story Point ≥ 8)
- PEOPLE-2.S4 PeopleQueryFacade fuzzy `searchByDisplayName` (Story; persona = Owner of another module — used by Agents NL resolution)

Each Story has:

```
Sprint: Backlog
```

And in AI Execution Notes:

```
Backlog reason: Cascade from MVP cut on People scope per design §13 D14 + D15.
Re-scope decision needed before implementation: confirm Phase-1 GA target date.
```

- [ ] **Step 4: Run verification**

Run: `docs/superpowers/plans/.scripts/verify-backlog.sh docs/superpowers/specs/2026-05-07-people-backlog.md`
Expected: "Epics: 2 Stories: 7 Tasks: 0 OK: ... passes"

- [ ] **Step 5: Format**

Run: `bunx prettier --write docs/superpowers/specs/2026-05-07-people-backlog.md`

### Task 6: Generate `2026-05-07-web-admin-backlog.md`

**Files:**

- Create: `docs/superpowers/specs/2026-05-07-web-admin-backlog.md`

Per spec §6.6: 1 Epic ADMIN-1, ~4 Stories. Light scope.

- [ ] **Step 1: Write file**

Header references spec §6.6. Single Epic ADMIN-1 with 4 Stories:

- ADMIN-1.S1 `apps/web-admin` zone scaffold + AppLayout integration (Story; persona = Tenant administrator) — Sprint-3, P0.
- ADMIN-1.S2 Tenant settings page (timezone, locale, branding) backed by `admin` schema (Story; persona = Tenant administrator) — Sprint-3, P1.
- ADMIN-1.S3 Module toggles (admin schema) (Story; persona = Tenant administrator) — Sprint-4, P2.
- ADMIN-1.S4 Platform-admin (SETA operator) role-gated view distinct from tenant admin per agents-srs FR-084 (Story; persona = Platform administrator) — Sprint-4, P1.

Each Story has full AC checklist. ADMIN-1.S1 AC includes:

- [ ] Zone scaffolds at `apps/web-admin/`.
- [ ] AppLayout from `@future/app-layout` integrated.
- [ ] Sidebar config registered with shell.
- [ ] Page routes under `/admin/...`.
- [ ] kernel `audit_event` emitted for every admin write (per §13 T1-2).
- [ ] **E2E** — A tenant administrator signs into web-shell, navigates to `/admin/settings`, and sees the tenant settings page.

ADMIN-1.S4 explicitly cross-links agents-srs FR-084 in AC: "Platform-admin can view tenant settings; cannot alter (read-only enforced at backend)."

- [ ] **Step 2: Run verification**

Run: `docs/superpowers/plans/.scripts/verify-backlog.sh docs/superpowers/specs/2026-05-07-web-admin-backlog.md`
Expected: "Epics: 1 Stories: 4 Tasks: 0 OK: ..."

- [ ] **Step 3: Format**

Run: `bunx prettier --write docs/superpowers/specs/2026-05-07-web-admin-backlog.md`

### Task 7: Generate `2026-05-07-deployment-backlog.md`

**Files:**

- Create: `docs/superpowers/specs/2026-05-07-deployment-backlog.md`

Per spec §6.3: 3 Epics — DEPLOY-1 (AWS infra & Terraform), DEPLOY-2 (CI/CD pipelines), DEPLOY-3 (Production readiness). ~14 tickets total. All Stories, persona = DevOps engineer (single track).

Source: `docs/architecture/deployment.md` (335 lines).

- [ ] **Step 1: Write Epic DEPLOY-1 — AWS infra & Terraform IaC**

Sprint-3, P0. Goal: by S3 close, staging environment is reachable at `staging.future.seta-international.vn` (or equivalent) with the API and at least one zone deployed. Stories:

- DEPLOY-1.S1 Terraform layout (root + staging + prod modules) (Story).
- DEPLOY-1.S2 VPC + subnets + security groups (Story).
- DEPLOY-1.S3 ECS Fargate Graviton ARM64 cluster + service definitions per zone (Story; references CLAUDE.md ARM64 rule).
- DEPLOY-1.S4 RDS Postgres + RDS Proxy + RLS contract (Story; references CLAUDE.md RLS).
- DEPLOY-1.S5 ALB + ACM + Route53 + ECR + Secrets Manager (Story).

Every Story includes `human-review` AC checkbox per §13 (AI-led deployment Definition of Done). Example for DEPLOY-1.S1:

- [ ] Terraform layout follows `infra/terraform/{root,staging,prod}` per `deployment.md` §"Terraform IaC Layout".
- [ ] `terraform plan` runs cleanly against staging.
- [ ] `terraform validate` passes.
- [ ] **human-review** — DevOps engineer reviewed the Terraform diff before apply.
- [ ] **E2E** — `terraform apply` against staging succeeds and produces a reachable staging environment.

- [ ] **Step 2: Write Epic DEPLOY-2 — CI/CD pipelines**

Sprint-3 → Sprint-4, P0. Stories:

- DEPLOY-2.S1 GitHub Actions OIDC to AWS (no static keys per `deployment.md`) (Story).
- DEPLOY-2.S2 Per-zone build+push pipelines (11 zones + API) (Story).
- DEPLOY-2.S3 Turbo remote cache + smoke tests (Story).
- DEPLOY-2.S4 Deploy gates + rollback playbook (Story).

- [ ] **Step 3: Write Epic DEPLOY-3 — Production readiness**

Sprint-4 → Sprint-5, P0. Stories:

- DEPLOY-3.S1 Synthetic dual-tenant cross-tenant probe (per agents-srs NFR-009/018, planner-srs §1.5.3 launch gate; cross-links risk #4) (Story; SP=8, `needs-human-review`).
- DEPLOY-3.S2 Scale-to-zero staging schedule (per `deployment.md` §"Staging Scale-to-Zero Schedule") (Story).
- DEPLOY-3.S3 Secrets rotation runbook (per CLAUDE.md "Secrets in AWS Secrets Manager") (Story).
- DEPLOY-3.S4 Alerting wiring (vendor-agnostic per memory `project_no_langfuse_mvp.md`) (Story).
- DEPLOY-3.S5 DB backup + PITR verification + prod cutover runbook (Story; cross-link DOC-1.T5).

DEPLOY-3.S1 AC includes:

- [ ] Probe runs daily in production.
- [ ] Probe attempts cross-tenant read against every tenant-scoped table including KB index (agents-srs NFR-018).
- [ ] Successful cross-tenant read pages on-call.
- [ ] **human-review** — Security reviewer signed off on probe coverage.
- [ ] **E2E** — Run probe in staging with two tenants; confirm a deliberate misconfigured query is detected and pages.

- [ ] **Step 4: Run verification**

Run: `docs/superpowers/plans/.scripts/verify-backlog.sh docs/superpowers/specs/2026-05-07-deployment-backlog.md`
Expected: "Epics: 3 Stories: 14 Tasks: 0 OK: ..."

- [ ] **Step 5: Format**

Run: `bunx prettier --write docs/superpowers/specs/2026-05-07-deployment-backlog.md`

### Task 8: Commit Batch 2

- [ ] **Step 1: Commit**

```bash
git add docs/superpowers/specs/2026-05-07-people-backlog.md \
        docs/superpowers/specs/2026-05-07-web-admin-backlog.md \
        docs/superpowers/specs/2026-05-07-deployment-backlog.md
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
specs(backlog): generate Batch 2 — people + web-admin + deployment

- people-backlog.md: PEOPLE-1 MVP (3 Stories incl. facade contract on S3 day-1) + PEOPLE-2 Backlog (4 Stories deferred per design §13 D14)
- web-admin-backlog.md: ADMIN-1 (4 Stories — zone shell, tenant settings, module toggles, platform-admin view)
- deployment-backlog.md: DEPLOY-1..3 (14 Stories — Terraform IaC, CI/CD, prod readiness; every Story has human-review AC per design §13)

All files pass verify-backlog.sh.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Batch 3 — Planner backlog

Largest single feature file. ~45 Stories + S6 hardening Tasks across 7 Epics. Source: `planner-srs.md` (FR-PL-001..067, UI-PL-001..025), with all blocker resolutions from spec §13 baked into AC.

### Task 9: Write Planner file header + Epic PLAN-1 + Epic PLAN-2

**Files:**

- Create: `docs/superpowers/specs/2026-05-07-planner-backlog.md`

- [ ] **Step 1: Write file header**

```markdown
# Planner Backlog

**Source design:** `docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md` §6.4.
**Source SRS:** `docs/architecture/planner-srs.md` (1487 lines, FR-PL-001..067 + UI-PL-001..025).
**Tickets:** 7 Epics, ~38 MVP Stories + ~2 Backlog Stories + ~4 Tasks + ~6 S6 hardening Tasks.

**Personas served (per spec §1):**

- Employee — own task management, evidence capture, personal hubs.
- Manager / Team lead — team plans, evidence verification (verifier identified by per-plan permission grant per §13 D15).
- Tenant administrator — connect MS-365, link plans, conflict review/override (per §13 T1-5).
- Owner of another module — programmatic read via `PlannerQueryFacade`; programmatic events via outbox.
- Auditor — append-only audit trail.

**Blocker resolutions baked in (per spec §13):**

- T1-2 / T1-6: Every domain-write Story includes AC for kernel audit-event written in same DB tx; tx rolls back on kernel failure.
- T1-5: Conflict-override re-validation in PLAN-6.
- T1-7: Future-side description edit replaces opaque rich-text payload.
- T1-8: Schedule-level recurrence edits push to all future occurrences; per-occurrence edits → Backlog.
- D1: Hard-cap 1000 active tasks per plan.
- D5: Bucket order LWW with last-write timestamp.
- H1: Image-PDF rejection at upload time.
- H2: Carry-Over sweep at 23:00 user-tz; compute at 00:00 user-tz.
- H3: Attachment downloads via signed URL (5-min TTL, IP-bound).
- I1: Storage quota hard-error at upload finalize.
- I2: Checklist 20-item hard-error.

---
```

- [ ] **Step 2: Write Epic PLAN-1 — Plans, buckets, tasks core CRUD**

Per spec §6.4: Sprint-3, ~7 Stories, SRS coverage FR-PL-001..014 + UI-PL-001..006. Apply Epic template + Story template per §5.2/§5.3.

Stories (7):

- PLAN-1.S1 Plan CRUD (create, rename, soft-delete, membership) — FR-PL-001..005. Persona = Employee (own personal plan) and Tenant administrator (team plans). AC includes plan ownership shapes (team / personal), container type fixed at creation per FR-PL-002/003.
- PLAN-1.S2 Bucket CRUD + reorder — FR-PL-006. AC includes bucket order LWW timestamp per §13 D5.
- PLAN-1.S3 Task CRUD + reorder + assignees + labels — FR-PL-007..010. AC includes assignee resolution by SSO subject (calls `PeopleQueryFacade.resolveByExactSubject` from PEOPLE-1.S3); plan task ceiling 1000 per §13 D1.
- PLAN-1.S4 Checklists (≤20 items, hard-error per §13 I2) — FR-PL-011.
- PLAN-1.S5 Comments — FR-PL-012.
- PLAN-1.S6 Attachments (upload + storage quota hard-error per §13 I1; download via signed URL per §13 H3) — FR-PL-013..014.
- PLAN-1.S7 Labels — FR-PL-008.

Every Story:

- Includes E2E AC item ("**E2E** — A user creates a plan, adds a task, assigns themselves, saves, and sees it on the Board view")
- Includes kernel audit-event AC ("**audit** — every state change writes a `planner_*` audit_event row in the same DB tx")
- References the FR-PL-NNN IDs covered in `### SRS Coverage`
- Has `Blocked by: PEOPLE-1.S2 (PeopleQueryFacade contract)` for any Story that resolves an assignee

- [ ] **Step 3: Write Epic PLAN-2 — Evidence & verification**

Per spec §6.4: Sprint-3, ~3 Stories, SRS coverage FR-PL-015..017 + UI-PL-007..008. Stories:

- PLAN-2.S1 Evidence model (file, link, structured note) on every task — FR-PL-015..016.
- PLAN-2.S2 Verification state independent of completion — FR-PL-017.
- PLAN-2.S3 Verifier flow — verifier identified by per-plan `verify_evidence` kernel role grant per §13 D15 (NOT org chart, since People placements are Backlog). Persona = Manager / Team lead.

PLAN-2.S2 has critical AC:

- [ ] Task `is_complete` and `evidence_verified` are independent boolean fields in the schema.
- [ ] Marking task complete does not auto-mark evidence verified.
- [ ] Marking evidence verified does not auto-mark task complete.
- [ ] kernel `audit_event` row for both transitions per §13 T1-2.
- [ ] **E2E** — Manager verifies evidence on a completed task; verification state appears separately on the Board view.

- [ ] **Step 4: Run verification (interim)**

Run: `docs/superpowers/plans/.scripts/verify-backlog.sh docs/superpowers/specs/2026-05-07-planner-backlog.md`
Expected: "Epics: 2 Stories: 10 Tasks: 0 OK: ..."

### Task 10: Write Planner Epic PLAN-3 + Epic PLAN-4

- [ ] **Step 1: Write Epic PLAN-3 — View modes**

Per spec §6.4: Sprint-4, ~4 Stories, SRS coverage FR-PL-020..024 + UI-PL-009..014. Stories:

- PLAN-3.S1 Board (kanban) view — FR-PL-020.
- PLAN-3.S2 Grid (table) view — FR-PL-021.
- PLAN-3.S3 Charts (aggregate) view — FR-PL-022.
- PLAN-3.S4 Schedule (timeline-by-date) view — FR-PL-023 (NOT Gantt per `planner-srs §1.5.2`).

Each Story persona = Employee or Manager (depending on whether it's a personal or team plan). E2E AC: "user can switch between view modes without page reload; selected view persists per plan per user."

- [ ] **Step 2: Write Epic PLAN-4 — Personal hubs**

Per spec §6.4: Sprint-4, ~5 Stories, SRS coverage FR-PL-017..019 + UI-PL-015..018. Stories:

- PLAN-4.S1 My Day hub with FR-PL-018 sweep at 23:00 user-tz (per §13 H2) — Persona = Employee.
- PLAN-4.S2 My Tasks hub aggregating across all plans — Persona = Employee.
- PLAN-4.S3 Personal Charts hub.
- PLAN-4.S4 Carry-Over hub computed at 00:00 user-tz after sweep (per §13 H2).
- PLAN-4.S5 Auto-provision personal plan at user activation per FR-PL-001.

PLAN-4.S1 AC includes:

- [ ] My Day hub renders pinned tasks for "today" in user's timezone.
- [ ] Sweep job runs at 23:00 user-tz and removes orphan pins (tasks deleted/moved out of plan membership).
- [ ] **E2E** — User pins a task at 22:00, deletes the task, verifies pin is removed by 00:00.

- [ ] **Step 3: Run verification**

Run: `docs/superpowers/plans/.scripts/verify-backlog.sh docs/superpowers/specs/2026-05-07-planner-backlog.md`
Expected: "Epics: 4 Stories: 19 Tasks: 0 OK: ..."

### Task 11: Write Planner Epic PLAN-5 + Epic PLAN-6

- [ ] **Step 1: Write Epic PLAN-5 — MS-365 sync**

Per spec §6.4: Sprint-4 → Sprint-5, ~8 Stories, SRS coverage FR-PL-030..050 + UI-PL-019..022. Highest-risk Phase-1 surface. Stories:

- PLAN-5.S1 MS Graph auth (delegated + app token mix per `planner-srs §3.3`).
- PLAN-5.S2 Container type — `future-only` plan sync (read-only Microsoft → Future for `future-only` is moot; this Story is the Future-side write side of `future-only` only).
- PLAN-5.S3 Container type — `ms-group` plan sync.
- PLAN-5.S4 Container type — `ms-roster` plan sync (with subject-mapping survival per FR-PL-033).
- PLAN-5.S5 Reconciliation engine (pull cadence with adaptive widening per §13 E3).
- PLAN-5.S6 Conflict log — last-write-wins per FR-PL-031, conflict log entry on collision per §13 D5.
- PLAN-5.S7 Rich-text round-trip preservation per §13 T1-7 (read-only on Future side; edit replaces).
- PLAN-5.S8 Schedule-level recurrence edits per §13 T1-8.

Every Story has E2E AC running against a Microsoft sandbox tenant (cross-link risk #2 — sandbox booking is a prerequisite). PLAN-5.S6 AC:

- [ ] Concurrent edit on Future + MS-365 within sync window resolves last-write-wins.
- [ ] Losing snapshot persisted to conflict log table.
- [ ] No silent overwrite (planner-srs §1.5.3 launch gate).
- [ ] **E2E** — Edit a task in MS-365 and Future within 60s; confirm conflict log entry exists.

- [ ] **Step 2: Write Epic PLAN-6 — Admin surface**

Per spec §6.4: Sprint-5, ~5 Stories, SRS coverage FR-PL-055..060 + UI-PL-023..025. Persona = Tenant administrator throughout. Stories:

- PLAN-6.S1 Connect / disconnect MS-365 (admin OAuth flow).
- PLAN-6.S2 Link plans (assign Future plan to a Microsoft container).
- PLAN-6.S3 Conflict review.
- PLAN-6.S4 Conflict override flow with re-validation per §13 T1-5.
- PLAN-6.S5 Sync diagnostics + tenant disconnect cleanup.

PLAN-6.S4 AC explicitly:

- [ ] Admin can override an auto-resolved conflict to apply the losing snapshot.
- [ ] On override, domain invariants (e.g., due_date ≥ start_date) are re-run.
- [ ] Override that violates invariant is rejected with structured error naming the failing invariant.
- [ ] Admin must edit losing snapshot before applying.
- [ ] kernel `audit_event` for every override.
- [ ] **E2E** — Admin attempts to override to a snapshot with `due_date < start_date`; sees rejection; corrects; succeeds.

- [ ] **Step 3: Run verification**

Run: `docs/superpowers/plans/.scripts/verify-backlog.sh docs/superpowers/specs/2026-05-07-planner-backlog.md`
Expected: "Epics: 6 Stories: 32 Tasks: 0 OK: ..."

### Task 12: Write Planner Epic PLAN-7 + cross-cutting Tasks + S6 hardening

- [ ] **Step 1: Write Epic PLAN-7 — Cross-module surfaces (LINKING)**

Per spec §6.4: Sprint-5 (per §3 D41 — moved from S6). ~4 Stories + 2 contract Stories + 4 Tasks. SRS coverage FR-PL-060..067. Stories:

- PLAN-7.S1 Read-facade contract publication (SP=2, S3 day-1 per spec §3 D11).
- PLAN-7.S2 Write-facade contract publication (SP=2, S3 day-1).
- PLAN-7.S3 Read-facade implementation (`PlannerQueryFacade`).
- PLAN-7.S4 Write-facade implementation (`PlannerWriteFacade`).
- PLAN-7.S5 Outbox event emitters (assignment, completion, evidence verified, sync conflict) — FR-PL-046.
- PLAN-7.S6 Personal-plan provisioning op for cross-module callers.

Tasks (4):

- PLAN-7.T1 RTM verification harness — Appendix D walk-through (Task; cross-link DOC-3.T14).
- PLAN-7.T2 Launch-gate evidence collection (Task; planner-srs §1.5.3).
- PLAN-7.T3 Performance baseline — query latency under design envelope NFR-PL-PERF-09 (Task).
- PLAN-7.T4 ms-roster subject-mapping migration test (Task; FR-PL-033).

PLAN-7.S1 AC:

- [ ] `packages/event-contracts/src/planner-read.ts` exports `PlannerReadFacade` interface.
- [ ] Methods declared: `getMyOpenTasks(userId)`, `getPlanStatus(planId)`, `getTasksByOwner(ownerId, scope)`.
- [ ] Both Agents and other modules can `import { PlannerReadFacade } from '@future/event-contracts'`.
- [ ] **E2E** — Agents AGN-2.S1 (own-scope reads) typechecks against this contract.

- [ ] **Step 2: Add S6 hardening Tasks for Planner**

Per spec §7 hardening column ~6 bug-fix placeholders. Add as Tasks at the end of the file under a marker comment `<!-- S6 Hardening Tasks (placeholders, content carved from S5 testing) -->`. Tasks like:

- PLAN-S6.T1..T3 Bug-fix placeholders BF-PL-01..03.
- PLAN-S6.T4 Performance audit — task list latency NFR-PL-PERF-04 (≥500 assigned open tasks ceiling).
- PLAN-S6.T5 Accessibility audit — WCAG 2.1 AA across Board / Grid / Charts / Schedule.
- PLAN-S6.T6 RLS dual-tenant probe assertion update.

Each Sprint-6, P0, persona = QA / DevOps engineer.

- [ ] **Step 3: Append Traceability Matrix**

At the end of the file (before final newline), append the Planner SRS Traceability Matrix per `planner-srs Appendix D`:

```markdown
---

## Planner SRS Traceability Matrix (Appendix D)

| FR-PL ID  | Epic   | Ticket(s) |
| --------- | ------ | --------- |
| FR-PL-001 | PLAN-1 | PLAN-1.S1 |
| FR-PL-002 | PLAN-1 | PLAN-1.S1 |
| ...       | ...    | ...       |
| FR-PL-067 | PLAN-7 | PLAN-7.S5 |
```

Generate the table by reading every `### SRS Coverage` block in the file and emitting one row per cited FR. (A small awk/grep script can do this; or manually for ~67 rows.)

- [ ] **Step 4: Run final verification**

Run: `docs/superpowers/plans/.scripts/verify-backlog.sh docs/superpowers/specs/2026-05-07-planner-backlog.md`
Expected: "Epics: 7 Stories: 38 Tasks: 10 OK: ..."

- [ ] **Step 5: Format**

Run: `bunx prettier --write docs/superpowers/specs/2026-05-07-planner-backlog.md`

### Task 13: Commit Batch 3

- [ ] **Step 1: Commit**

```bash
git add docs/superpowers/specs/2026-05-07-planner-backlog.md
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
specs(backlog): generate Batch 3 — planner

PLAN-1..7 across 7 Epics, ~38 MVP Stories + 4 Tasks + 6 S6 hardening Tasks.
All blocker resolutions from design §13 baked into AC: kernel audit transactional,
conflict-override re-validation, rich-text replace-on-edit, recurrence schedule-level only,
hard-cap 1000 tasks/plan, bucket order LWW, image-PDF reject at upload, Carry-Over
sweep timing, signed-URL downloads, storage quota hard-error, checklist 20-item hard-error.

Includes Traceability Matrix linking every FR-PL-NNN to its ticket(s).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Batch 4 — Agents backlog

Largest file. ~40 MVP Stories + ~8 Backlog Stories + 4 Tasks + S6 hardening Tasks across 7 Epics. Source: `agents-srs.md` (FR-001..088, UI-001..023, NFR-001..023). Highest density of blocker resolutions (Tier 1 + Tier 2 cross-cuts).

### Task 14: Write Agents file header + Epic AGN-1 + Epic AGN-3

**Files:**

- Create: `docs/superpowers/specs/2026-05-07-agents-backlog.md`

- [ ] **Step 1: Write file header**

```markdown
# Agents Backlog

**Source design:** `docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md` §6.5.
**Source SRS:** `docs/architecture/agents-srs.md` (1339 lines, FR-001..088 + UI-001..023 + NFR-001..023).
**Tickets:** 7 Epics, ~37 MVP Stories + ~7 Backlog Stories + ~4 Tasks + ~6 S6 hardening Tasks.

**Personas served (per spec §1):**

- Employee — global chat, inline copilot, NL writes constrained to own scope.
- Tenant administrator — model selection, cost ceilings, schedule policy, tool visibility, KB management.
- Platform administrator — view-only of tenant config (FR-084).
- Auditor — replay-by-trace, audit query.
- End user (data subject) — GDPR right-to-erasure (Backlog cascade).
- Scheduled run (system actor) — under user delegation grant (FR-026).

**Cascading cuts (per spec §6.5 + §13 D14/D15):**

- AGN-2 role-scoped reads (FR-063 team/dept/manager analysis) → Backlog (no org chart from People).
- AGN-7 k-anonymity floor on aggregates (FR-025) → Backlog (moot without aggregates).
- NL writes constrained to current-task assignees + exact-email (no fuzzy "reassign to Anh").

**Blocker resolutions baked in (per spec §13):**

- T1-1: Approval-inbox event contract — agents emits drafts, inbox owns TTL/auto-reject.
- T1-2: Kernel audit transactional. Same DB tx; rollback on failure.
- T1-3: PeopleQueryFacade — exact-only in MVP; fuzzy → Backlog.
- T1-4: Delegation grant schema with hardcoded 90-day TTL (admin UI → Backlog).
- T1-9: Direct OpenAI in MVP code; multi-provider abstraction → Backlog.
- T1-10: English-only inline strings; i18n infra → Backlog.
- A1: Output shape declaration metadata-only, NOT counted toward TTFT.
- B1: Conservative-secure taint — read OR write tenant-authored free text taints subsequent writes.
- C3: Email + in-app channels only (no Slack/Teams).
- E2: Quality canary success = error-free + within-SLA + no user-rated-negative.
- G1: $0.10 minimum-remaining budget.

---
```

- [ ] **Step 2: Write Epic AGN-1 — Conversational surfaces**

Per spec §6.5: Sprint-3, ~7 Stories + 1 contract Story (Agents internal FE/BE). SRS coverage FR-001..007 + UI-001..010. Stories:

- AGN-1.S1 `apps/web-agents` zone scaffold (greenfield — does not exist yet).
- AGN-1.S2 Global chat surface in web-agents zone — FR-001.
- AGN-1.S3 Inline copilot in web-planner — FR-002.
- AGN-1.S4 Conversation + turn data model in `apps/api/src/modules/agents/`.
- AGN-1.S5 SSE streaming with TTFT p95 ≤ 2.5s metric (per §13 A1, NFR-001) — output-shape declaration is metadata-only.
- AGN-1.S6 Output-shape declaration (short / list / table / narrative / chart) — FR-004.
- AGN-1.S7 Citations contract — FR-006 (every output references source-task identifiers / KB document section).
- AGN-1.S8 Multi-conversation switching — FR-007.
- AGN-1.S2-CONTRACT Agents internal FE/BE contract publication (SP=2 contract on S3 day-1 per spec §3 D11 + risk #16).

Personas: Employee (S2-S8), Engineering team (S1, S2-CONTRACT).

AGN-1.S5 AC includes:

- [ ] Output shape transmitted as metadata frame BEFORE first content token.
- [ ] TTFT measured from request acceptance to first **content** token, NOT to shape frame.
- [ ] p95 ≤ 2.5s in production.
- [ ] **E2E** — Send 100 chat turns with assorted shapes; observe p95 latency from observability backend.

- [ ] **Step 3: Write Epic AGN-3 — Tenant Knowledge Base (RAG)**

Per spec §6.5: Sprint-4, ~6 Stories. SRS coverage FR-050..059 + UI-017. Persona = Employee (KB query) + Tenant administrator (KB ingest). Stories:

- AGN-3.S1 KB ingestion (markdown, plain text, text-extractable PDF) with image-PDF rejection at upload time per §13 H1 — FR-053.
- AGN-3.S2 Async chunk + embed + index pipeline — FR-054.
- AGN-3.S3 Tenant-keyed retrieval (no cross-tenant search) — FR-052.
- AGN-3.S4 Citations (source document + section) — FR-051, FR-006.
- AGN-3.S5 Admin browse / edit / deprecate / re-index — FR-055; ingestion notifications — FR-056; failure surface — FR-059.
- AGN-3.S6 Quotas (1000 docs / 5MB per doc per §13 G3, FR-057/058) tunable per tenant.

AGN-3.S3 AC critical:

- [ ] KB retrieval index keyed by `tenant_id`.
- [ ] No query path can produce a result containing rows from another tenant.
- [ ] Daily synthetic cross-tenant probe runs against KB index (cross-link DEPLOY-3.S1).
- [ ] **E2E** — Configure tenant A and tenant B with overlapping KB content; verify tenant A's query returns zero rows from tenant B.

- [ ] **Step 4: Run verification (interim)**

Run: `docs/superpowers/plans/.scripts/verify-backlog.sh docs/superpowers/specs/2026-05-07-agents-backlog.md`
Expected: "Epics: 2 Stories: 14 Tasks: 0 OK: ..."

### Task 15: Write Agents Epic AGN-4 + Epic AGN-6

- [ ] **Step 1: Write Epic AGN-4 — Execution-mode framework + approval inbox**

Per spec §6.5: Sprint-4, ~6 Stories. SRS coverage FR-008..018, FR-040..045 + UI-013, UI-022. Persona = Employee (mode selection) + Tenant administrator (policy). Stories:

- AGN-4.S1 Default vs Bypass mode selection per conversation — FR-008..010.
- AGN-4.S2 Non-bypassable floor (bulk / cross / destructive) — FR-012..013.
- AGN-4.S3 Mode resolution at turn start (immutable mid-turn) — FR-014.
- AGN-4.S4 Tenant admin disable Bypass tenant-wide — FR-015; per-tool always-confirm — FR-016.
- AGN-4.S5 Free-text taint flag (conservative-secure per §13 B1) — FR-017.
- AGN-4.S6 Approval-inbox event contract emitter (per §13 T1-1) — FR-040..045 (TTL owned by inbox per T1-1; idempotency keys per FR-044; permission envelope at draft time per FR-045; revalidation on confirm per FR-042/043).

AGN-4.S6 AC:

- [ ] Drafted writes emit event shape `{tenant_id, draft_id, initiator_user_id, tool_id, intent_payload, permission_envelope_at_draft, expires_at}`.
- [ ] Confirmation event consumed: `{draft_id, decision, decided_by, decided_at}`.
- [ ] On confirmation, agent revalidates precondition state of underlying domain entity per FR-042.
- [ ] Revalidation failure → structured event written, write not executed, initiator notified (FR-043).
- [ ] Idempotency key per intended side effect; retry returns original outcome (FR-044).
- [ ] Permission envelope captured at draft time; if narrowed before execution → permission-denied path (FR-045).
- [ ] **E2E** — Create draft in Default mode; confirm; verify write executes idempotently. Create draft, narrow permissions, confirm; verify permission-denied.

- [ ] **Step 2: Write Epic AGN-6 — Tenant administration**

Per spec §6.5: Sprint-5, ~6 Stories. SRS coverage FR-076..084 + UI-016..019. Persona = Tenant administrator. Stories:

- AGN-6.S1 LLM model tier selection — FR-076.
- AGN-6.S2 Cost ceilings (per-turn / per-user-day / per-tenant-day) with $0.10 min-remaining default per §13 G1 — FR-077.
- AGN-6.S3 Schedule policy (max concurrency / windows / per-schedule cost cap) — FR-078.
- AGN-6.S4 Tool visibility — FR-079.
- AGN-6.S5 Exec-mode policy (per FR-015 / FR-016) and memory policy (per FR-032..035) — FR-080, FR-081.
- AGN-6.S6 Admin audit-event view + <5min config propagation — FR-082, FR-083.

AGN-6.S6 AC:

- [ ] Every admin config change emits a structured kernel `audit_event` with `previous_value`, `new_value`, configuring administrator's identity, timestamp.
- [ ] Config change takes effect within 5 minutes without engineering intervention.
- [ ] Admin audit-event view filters to administrative changes (UI-019).
- [ ] **E2E** — Admin changes per-turn cost ceiling; new value enforced on next turn within 5 minutes.

- [ ] **Step 3: Run verification**

Run: `docs/superpowers/plans/.scripts/verify-backlog.sh docs/superpowers/specs/2026-05-07-agents-backlog.md`
Expected: "Epics: 4 Stories: 26 Tasks: 0 OK: ..."

### Task 16: Write Agents Epic AGN-7

Largest single Epic in the portfolio. Sprint-5, ~8 MVP Stories + ~1 Backlog Story + 4 Tasks. SRS coverage FR-019..039, FR-046..049, FR-085..088, NFR-001..023.

- [ ] **Step 1: Write Epic AGN-7 — Governance, replay, cost, GDPR, reliability**

Stories:

- AGN-7.S1 Exec-as-caller everywhere (NEVER service account) — FR-019, NFR-010.
- AGN-7.S2 Kernel audit emission per call (correlated by trace) — FR-020..022, NFR-011.
- AGN-7.S3 Memory layers — within-conversation only, no cross-conversation, no cross-tenant — FR-028..031.
- AGN-7.S4 Replay-by-trace (deterministic) + content-addressed prompt store — FR-046..049.
- AGN-7.S5 Cost ledger (cache-aware per NFR-005) + dollar-denominated ceilings — NFR-004, NFR-016.
- AGN-7.S6 Cancellation (single path, typed reasons per FR-085..088) within 1s per NFR-008.
- AGN-7.S7 Reliability — retry + circuit breaker + model-degradation ladder + quality canary per §13 E2 + honesty-of-failure messaging — FR-036..039.
- AGN-7.S8 GDPR right-to-erasure pipeline — NFR-017.
- AGN-7.S9 (Backlog) k-anonymity floor on aggregate tools per §13 cascade from §13 D14/D15 — FR-025. `Sprint: Backlog`. Backlog reason: cascade from People MVP cut.

Tasks (4):

- AGN-7.T1 OpenAI integration setup (Task — Sprint-3 early; chat / embeddings / moderation endpoints).
- AGN-7.T2 OTLP wiring stub (vendor-agnostic per memory `project_no_langfuse_mvp.md`) (Task — Sprint-4).
- AGN-7.T3 RTM Appendix D walk-through (Task — Sprint-6, cross-link DOC-3.T15).
- AGN-7.T4 Daily synthetic cross-tenant probe extension to Agents conversations + KB index (Task — Sprint-4, cross-link DEPLOY-3.S1).

AGN-7.S1 AC:

- [ ] Every call against any platform domain (Planner, People, KB) executes under the calling user's identity.
- [ ] No code path elevates to a service account.
- [ ] Static analysis test: grep `apps/api/src/modules/agents/` for any `withServiceAccount` / `asSystem` / equivalent — must return zero matches.
- [ ] **E2E** — A user without permission to read Plan X attempts to query it via chat; receives permission-denied response; no service-account elevation observed in audit log.

- [ ] **Step 2: Run verification**

Run: `docs/superpowers/plans/.scripts/verify-backlog.sh docs/superpowers/specs/2026-05-07-agents-backlog.md`
Expected: "Epics: 5 Stories: 35 Tasks: 4 OK: ..."

### Task 17: Write Agents Epic AGN-2 + Epic AGN-5 + S6 hardening

Both Epics are LINKING work (per spec §3 D41), Sprint-5 (moved from S6).

- [ ] **Step 1: Write Epic AGN-2 — Planner read+write capabilities (LINKING)**

Per spec §6.5: ~4 MVP Stories + ~3 Backlog Stories. SRS coverage FR-060..070. MVP Stories:

- AGN-2.S1 Own-scope reads — "my open tasks", "due this week", "overdue items I own" — FR-060 partial.
- AGN-2.S2 NL task creation constrained — exact-email or already-assigned-to-current-plan — FR-065..066.
- AGN-2.S3 NL single-task mutations (reassign, reschedule, mark done, split, link) — FR-067 (constrained to own + current plan participants).
- AGN-2.S4 Meeting transcript extraction — FR-068..070 (always routes to inbox per FR-013).

Backlog Stories (3):

- AGN-2.S5 Team workload analysis — FR-063 team-lead. `Sprint: Backlog`. Reason: cascade from People placements Backlog.
- AGN-2.S6 Blocker / overload analysis. `Sprint: Backlog`.
- AGN-2.S7 Cross-team / dept-leader / org-leader synthesis — FR-063 dept-lead. `Sprint: Backlog`.

AGN-2.S2 AC explicit:

- [ ] NL "create task" intent extracts task title, due date, owner.
- [ ] Owner resolution: exact-email match via `PeopleQueryFacade.resolveByExactSubject()` ONLY.
- [ ] If owner ambiguous, agent asks user to confirm with email-typed mention.
- [ ] No fuzzy display-name resolution in MVP (cascade D14/D15).
- [ ] kernel audit_event for the resolved write per §13 T1-2.
- [ ] **E2E** — User says "create task: review Q3 brief, due Friday, assign anh@example.com"; confirms; task created in Planner.

- [ ] **Step 2: Write Epic AGN-5 — Scheduled & event-triggered runs (LINKING)**

Per spec §6.5: ~5 Stories. SRS coverage FR-071..075, FR-003. Persona = Employee (opt-in) + Tenant administrator (policy). Stories:

- AGN-5.S1 Morning task brief digest (own-scope only) — FR-071.
- AGN-5.S2 End-of-week status digest (own-scope only) — FR-071.
- AGN-5.S3 Stale-task nudge (own-scope only) — FR-071.
- AGN-5.S4 Per-user delegation grant schema with hardcoded 90-day TTL per §13 T1-4 — FR-072. (Admin TTL config UI is Backlog.)
- AGN-5.S5 Self-service schedule UI (view / modify / pause / cancel) — FR-074.

AGN-5.S4 AC:

- [ ] Schema `{grant_id, tenant_id, principal_user_id, agent_run_kind, scope:{tools, read_resources, write_resources:[]}, expires_at, created_by, audited_event_id}`.
- [ ] Default TTL 90 days hardcoded.
- [ ] User-revocable via FR-074 self-service surface.
- [ ] Auto-revoked on user deactivation.
- [ ] kernel audit_event on every grant use.
- [ ] Phase-1 scopes are read-only or inbox-draft only — `write_resources: []` always.
- [ ] **E2E** — Enable morning brief; confirm next-morning summary fires under valid grant; revoke grant; confirm next-day fires fail with permission denied.

- [ ] **Step 3: Add S6 hardening Tasks for Agents**

Per spec §7 ~6 Tasks. Add at end of file under marker comment. Examples:

- AGN-S6.T1..T3 Bug-fix placeholders BF-AG-01..03.
- AGN-S6.T4 Performance audit — KB ingestion p95 ≤ 60s NFR-006.
- AGN-S6.T5 Performance audit — KB retrieval p95 ≤ 250ms NFR-007.
- AGN-S6.T6 Cancellation latency audit — sub-second NFR-008.

All Sprint-6, P0.

- [ ] **Step 4: Append Traceability Matrix**

End of file: append the Agents SRS Traceability Matrix per `agents-srs Appendix D`. Same shape as Planner. Generated from `### SRS Coverage` blocks.

- [ ] **Step 5: Run final verification**

Run: `docs/superpowers/plans/.scripts/verify-backlog.sh docs/superpowers/specs/2026-05-07-agents-backlog.md`
Expected: "Epics: 7 Stories: 44 Tasks: 10 OK: ..."

- [ ] **Step 6: Format**

Run: `bunx prettier --write docs/superpowers/specs/2026-05-07-agents-backlog.md`

### Task 18: Commit Batch 4

- [ ] **Step 1: Commit**

```bash
git add docs/superpowers/specs/2026-05-07-agents-backlog.md
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
specs(backlog): generate Batch 4 — agents

AGN-1..7 across 7 Epics, ~37 MVP Stories + 7 Backlog Stories + 4 Tasks + 6 S6
hardening Tasks. All blocker resolutions from design §13 baked into AC: kernel
audit transactional, approval-inbox event contract, exec-as-caller everywhere,
free-text taint conservative-secure, output shape metadata-only TTFT, delegation
grant 90-day TTL, replay-by-trace deterministic, English-only strings, direct
OpenAI no abstraction, hardcoded $0.10 minimum-remaining budget.

Cascading cuts from People MVP: AGN-2 role-scoped reads → Backlog;
AGN-7 k-anonymity → Backlog. NL writes constrained to current-task assignees +
exact-email (no fuzzy "reassign to Anh").

Includes Traceability Matrix linking every FR-NNN/UI-NNN/NFR-NNN to its ticket(s).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final pass — cross-file verification + portfolio reconciliation

### Task 19: Cross-file ID uniqueness check

- [ ] **Step 1: Extract all IDs across all 7 backlog files**

Run:

```bash
for f in docs/superpowers/specs/2026-05-07-{foundation,people,deployment,planner,agents,web-admin,docs-sdlc}-backlog.md; do
  grep -E '^ID:' "$f" | awk '{print $2}'
done | sort > /tmp/all-ids.txt
```

- [ ] **Step 2: Check for duplicates**

Run: `uniq -d /tmp/all-ids.txt`
Expected: empty output (no duplicates).

If duplicates exist: rename one. Common cause = overlapping epic-prefix Story IDs (e.g., PLAN-1.S1 and PEOPLE-1.S1 are fine — different prefix; but PLAN-1.S1 and PLAN-1.S1 elsewhere is a bug).

- [ ] **Step 3: Verify expected count**

Run: `wc -l /tmp/all-ids.txt`
Expected: ~152 (close to portfolio total).

### Task 20: Cross-file dependency resolution check

- [ ] **Step 1: Extract every dependency reference**

Run:

```bash
for f in docs/superpowers/specs/2026-05-07-{foundation,people,deployment,planner,agents,web-admin,docs-sdlc}-backlog.md; do
  grep -E '^- (Blocked by|Blocks):' "$f" | grep -oE '[A-Z]+-[0-9]+(\.[ST][0-9]+)?'
done | sort -u > /tmp/dep-refs.txt
```

- [ ] **Step 2: Verify every reference resolves**

Run:

```bash
diff <(sort /tmp/dep-refs.txt) <(sort /tmp/all-ids.txt) | grep '^<' | head
```

Expected: empty (every dep ref exists as an ID in at least one file).

If a dep ref doesn't resolve: either the reference is a typo (fix), or the target ticket was named differently (rename one of them, prefer fixing the reference).

### Task 21: Update portfolio-overview totals

- [ ] **Step 1: Compute actual per-file totals**

Run:

```bash
for f in docs/superpowers/specs/2026-05-07-{foundation,people,deployment,planner,agents,web-admin,docs-sdlc}-backlog.md; do
  epics=$(grep -cE '^## \[EPIC\] ' "$f")
  stories=$(grep -cE '^### \[STORY\] ' "$f")
  tasks=$(grep -cE '^### \[TASK\] ' "$f")
  total=$((stories + tasks))
  echo "$f: epics=$epics stories=$stories tasks=$tasks total=$total"
done
```

- [ ] **Step 2: Update §1 of portfolio-overview.md with actual counts**

Edit `docs/superpowers/specs/2026-05-07-portfolio-overview.md` §1 "Initiatives" table to reflect the computed totals from Step 1.

- [ ] **Step 3: Format**

Run: `bunx prettier --write docs/superpowers/specs/2026-05-07-portfolio-overview.md`

### Task 22: Final atlassian-readiness sweep

- [ ] **Step 1: Run verification on all 7 backlog files + portfolio**

Run:

```bash
for f in docs/superpowers/specs/2026-05-07-*.md; do
  docs/superpowers/plans/.scripts/verify-backlog.sh "$f" || echo "FAILED: $f"
done
```

Expected: every file ends with "OK: ... passes atlassian-readiness checks". No "FAILED" lines.

- [ ] **Step 2: Sample-render one ticket**

Pick a representative Story from `agents-backlog.md` (e.g., AGN-4.S6) and verify by hand that:

- All 11 fields from spec §5.1 are present (ID, Status, Epic, Sprint, Release, Priority, Story Point, Rank, Jira Key, Confluence Link, plus the title)
- Summary uses the persona / I want / so that shape
- AC has at least one **E2E** item
- AC includes any §13 blocker-resolution checkboxes that apply
- Dependencies block has Blocked-by / Blocks lines (even if "none")
- Definition of Done references project DoD

If any field is missing: add it inline. Re-run verify-backlog.sh.

### Task 23: Final commit

- [ ] **Step 1: Stage and commit**

```bash
git add docs/superpowers/specs/2026-05-07-portfolio-overview.md
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
specs(backlog): finalize portfolio totals after cross-file verification

Cross-file ID uniqueness verified (no duplicates).
Cross-file dependency references all resolve.
Per-file totals reconciled against actual ticket counts in each backlog file.
All 8 files pass docs/superpowers/plans/.scripts/verify-backlog.sh.

Backlog is ready for atlassian push via atlassian:spec-to-backlog
(see docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md §14).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Confirm clean tree**

Run: `git status`
Expected: "nothing to commit, working tree clean".

- [ ] **Step 3: Print summary for the user**

```
Backlog generation complete.

8 files committed under docs/superpowers/specs/:
  - 2026-05-07-portfolio-overview.md
  - 2026-05-07-foundation-backlog.md       (~14 Done Tasks)
  - 2026-05-07-people-backlog.md           (~3 MVP + 4 Backlog)
  - 2026-05-07-deployment-backlog.md       (~14 Stories)
  - 2026-05-07-planner-backlog.md          (~38 Stories + 10 Tasks)
  - 2026-05-07-agents-backlog.md           (~44 Stories + 10 Tasks)
  - 2026-05-07-web-admin-backlog.md        (~4 Stories)
  - 2026-05-07-docs-sdlc-backlog.md        (~18 Tasks)

Next step: invoke atlassian:spec-to-backlog against each file to push to Jira.
Pre-push setup checklist in docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md §14.6.
```

---

## Self-review checklist (run after writing the plan, before handoff)

The plan author runs this checklist; not the implementing engineer.

**1. Spec coverage (§ refs are to `2026-05-07-sdlc-backlog-design.md`):**

- §6.1 Foundation 4 epics → Task 2.
- §6.2 People 2 epics → Task 5.
- §6.3 Deployment 3 epics → Task 7.
- §6.4 Planner 7 epics → Tasks 9–12.
- §6.5 Agents 7 epics → Tasks 14–17.
- §6.6 Web Admin 1 epic → Task 6.
- §6.7 Docs/SDLC 2 epics + S6 hardening → Task 3.
- §11 Output writing strategy 4 batches → Tasks 4, 8, 13, 18 commit barriers.
- §13 Tier 1 + Tier 2 blocker resolutions → cited by ID in every relevant Story's AC across all backlog tasks.
- §14 Atlassian-readiness contract → Task 0 verification harness + final sweep in Task 22.

**2. Placeholder scan:**

- "TBD" appears once in Task 1 with explicit instruction to update after Tasks 2–25 (ticket count placeholders in portfolio overview). All other placeholders are template angle-bracket fields inside fenced code blocks (intentional).
- Every step that says "write Story X" includes the persona, AC items, blocker-resolution refs, and SRS-coverage citations — no "fill in details later."

**3. Type / ID consistency:**

- Epic ID format: `<MODULE>-<INT>` (e.g., PLAN-7, AGN-2). Used consistently.
- Story ID format: `<EPIC>.S<INT>` (e.g., PLAN-1.S2). Used consistently.
- Task ID format: `<EPIC>.T<INT>` (e.g., FOUND-1.T1, PLAN-S6.T1). Used consistently.
- Backlog tickets always carry `Sprint: Backlog` and a `Backlog reason:` line in `AI Execution Notes`.
- Field names match spec §5.1 verbatim: `ID:`, `Status:`, `Epic:`, `Sprint:`, `Release:`, `Priority:`, `Story Point:`, `Rank:`, `Jira Key:`, `Confluence Link:`. `Tags:` deliberately absent (auto-derived per §14.3).

If the implementing engineer finds a gap during execution: add the missing Story / Task at the appropriate Epic, run verify-backlog.sh, and update Task 21 portfolio totals at the end.
