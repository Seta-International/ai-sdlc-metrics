# Future Phase-1 Portfolio Overview

| Field         | Value                                                                           |
| ------------- | ------------------------------------------------------------------------------- |
| Date          | 2026-05-07                                                                      |
| Project start | 2026-04-23                                                                      |
| MVP demo      | 2026-05-31                                                                      |
| Today         | 2026-05-07 (start of Sprint 3)                                                  |
| Methodology   | Scrum, 1-week sprints, AI-leveraged velocity                                    |
| Output target | Markdown — atlassian-pushable via `sdlc:spec-to-backlog`                        |
| Source design | `docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md` at commit `36edab8f` |

## 1. Initiatives

| #   | Initiative  | File                               | Epics  | MVP     | Backlog | Total   |
| --- | ----------- | ---------------------------------- | ------ | ------- | ------- | ------- |
| 1   | Foundation  | `2026-05-07-foundation-backlog.md` | 4      | 14      | 0       | 14      |
| 2   | People      | `2026-05-07-people-backlog.md`     | 2      | 3       | 4       | 7       |
| 3   | Deployment  | `2026-05-07-deployment-backlog.md` | 3      | 14      | 0       | 14      |
| 4   | Planner     | `2026-05-07-planner-backlog.md`    | 7      | 45      | 2       | 47      |
| 5   | Agents      | `2026-05-07-agents-backlog.md`     | 7      | 40      | 8       | 48      |
| 6   | Web Admin   | `2026-05-07-web-admin-backlog.md`  | 1      | 4       | 0       | 4       |
| 7   | Docs / SDLC | `2026-05-07-docs-sdlc-backlog.md`  | 3      | 18      | 0       | 18      |
|     | **Total**   |                                    | **27** | **138** | **14**  | **152** |

(Counts will be reconciled in Task 21 after all backlogs are written; placeholder values may shift ±5.)

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

Push to Jira via `sdlc:spec-to-backlog` per `2026-05-07-sdlc-backlog-design.md` §14. Pre-push setup:

- Confirm Jira project key (e.g., `FUTURE`).
- Confirm `Sprint` and `Story Points` and `Rank` custom fields exist.
- Sprints S1..S6 should be pre-created OR the skill creates them on first push.
- Fix Versions (`foundation`, `deployment`, `phase-1`, `phase-1.5`, `docs`) created on first push.

## 8. Foundation note

Foundation (FOUND-1..4) was completed in Sprints S1–S2 (week of 2026-04-23 → 2026-05-06). All FOUND tickets are retroactive `Status: Done` for SDLC trace; see `2026-05-07-foundation-backlog.md`.
