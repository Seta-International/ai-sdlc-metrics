# Phase-1 SDLC Backlog — Design

| Field          | Value                                            |
| -------------- | ------------------------------------------------ |
| Date           | 2026-05-07                                       |
| Status         | Draft — pending user review                      |
| Author         | Brainstorming session, agreed with user          |
| Project start  | 2026-04-23                                       |
| Phase-1 finish | 2026-05-31 (May end)                             |
| Today          | 2026-05-07 (start of Sprint 3)                   |
| Deliverable    | 8 markdown files under `docs/superpowers/specs/` |
| Output target  | Markdown only — **no Jira sync**                 |

---

## 1. Context

The user requested a complete Phase-1 SDLC backlog covering the Agents and Planner modules plus the People module, web-admin shell, deployment / IaC, and supporting documentation / SDLC process work. The Foundation week was completed prior to this session and is included for retroactive trace.

The two source SRSs are large:

- `docs/architecture/agents-srs.md` — 1339 lines, FR-001 through FR-088 (88 functional requirements), UI-001..UI-023, NFR-001..NFR-023.
- `docs/architecture/planner-srs.md` — 1487 lines, FR-PL-001 through FR-PL-067 (67 functional requirements), UI-PL-001..UI-PL-025.

Both SRSs target a Phase-1 envelope. The acceptance demo date stated in `agents-srs §1.5` (2026-05-20) is inconsistent with the agreed Phase-1 finish (2026-05-31) and with the project-start date (2026-04-23) given a three-engineer team. The date defect is acknowledged and tracked as a Docs / SDLC ticket (DOC-1) that updates the SRSs to match.

There is no `people-srs.md`. The People module epics in this backlog are derived from CLAUDE.md ownership (employment profiles, org placements, offboarding) and from the read-interface contract that Planner and Agents both depend on (planner-srs §UN-PL-04, agents-srs DP-03).

The Kernel and Identity modules are scaffolded under `apps/api/src/modules/{kernel,identity}/` but are not given dedicated epics in this portfolio. Their Phase-1 surface is folded into consumer-epic acceptance criteria (kernel audit emission, canDo() enforcement, Entra OIDC, delegation grants). Risk #13 below captures the consequences if this proves insufficient.

## 2. Goal and deliverables

The goal of this design is to produce a sprint-ready backlog the team can execute against without further refinement, framed in proper Scrum terms (sprints, capacity, sprint goals, definition of ready / done, risk register).

**Deliverables (the 8 files this design defines):**

```
docs/superpowers/specs/
├── 2026-05-07-portfolio-overview.md
├── 2026-05-07-foundation-backlog.md         (~14 tickets, Status: Done)
├── 2026-05-07-people-backlog.md             (~7 tickets)
├── 2026-05-07-deployment-backlog.md         (~14 tickets)
├── 2026-05-07-planner-backlog.md            (~42 tickets)
├── 2026-05-07-agents-backlog.md             (~44 tickets)
├── 2026-05-07-web-admin-backlog.md          (~4 tickets)
└── 2026-05-07-docs-sdlc-backlog.md          (~8 tickets)
```

**Total:** 26 epics, ~133 tickets across 7 backlog files plus a portfolio overview index.

## 3. Methodology decisions

| Decision                           | Choice                                                                                                                                             | Rationale                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| SRS coverage                       | (a) Full Phase-1 SRS scope as if greenfield. Every requirement gets a ticket regardless of build state.                                            | Matches user request; preserves SRS ↔ ticket trace required by RTM (Appendix D of each SRS).                  |
| Granularity                        | One Story per cohesive feature outcome, even when it covers 5–15 FRs. FRs become AC checkboxes + traceability rows. SP 13 → split.                 | Reduces total ticket count by ~50% vs. one Story per FR while preserving full SRS coverage.                   |
| Output                             | Markdown only. No Jira push.                                                                                                                       | User decision; markdown is portable and can be synced later.                                                  |
| Sprint cadence                     | 1-week sprints, AI-leveraged velocity.                                                                                                             | User decision: "we use AI to leverage the speed; must finish all of these in May."                            |
| Phase-1 finish                     | 2026-05-31. Source SRS date (2026-05-20) is wrong and gets amended via DOC-1.                                                                      | User decision: "iii — the dates in the SRSs are wrong and need fixing."                                       |
| Foundation tickets                 | Retroactive, all `Status: Done`, full AC checklist with `[x]` boxes. Each ticket carries a `Built artefact:` line pointing at the code path.       | User decision: "we still need ticket for foundation." Trace is the value.                                     |
| Hiring tickets                     | Out of scope.                                                                                                                                      | User decision: "don't need ticket for hiring here."                                                           |
| Tags                               | Removed entirely from ticket templates.                                                                                                            | User decision: "remove tag."                                                                                  |
| `Jira Key:` and `Confluence Link:` | Removed entirely.                                                                                                                                  | We're not pushing to Jira or Confluence.                                                                      |
| Sprint and Rank fields             | Added to every ticket (deviation from `standards.md`).                                                                                             | A professional Scrum board needs sprint placement and rank ordering; otherwise the board is unsortable.       |
| Contract publication stories       | One SP=2 Story on each cross-module facade, all due S3 day-1: Planner read-facade, Planner write-facade, PeopleQueryFacade, Agents internal FE/BE. | Without contracts on S3 day-1, parallel tracks cannot mock against each other and S6 linking fails.           |
| Out-of-scope modules               | `time`, `hiring`, `performance`, `projects`, `finance`, `goals`, `insights` — not ticketed in this portfolio. Treated as future SRS amendments.    | User confirmed the 5+1 in-scope list (Foundation, People, Deployment, Planner, Agents, Web Admin, Docs/SDLC). |

## 4. Sprint cadence and capacity

### 4.1 Sprint plan

| Sprint | Window                       | Sprint goal                                                                                                                                                | State       |
| ------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| S1     | 2026-04-23 → 2026-04-29      | Monorepo + toolchain ready (FOUND-1)                                                                                                                       | Done        |
| S2     | 2026-04-30 → 2026-05-06      | Backend + frontend + auth + DB skeletons ready (FOUND-2,3,4)                                                                                               | Done        |
| **S3** | **2026-05-07 → 2026-05-13**  | Staging deployable on ECS; People+Planner CRUD + evidence walking skeletons; Agents chat+SSE skeleton; **all 4 cross-module contracts published on day-1** | **Current** |
| S4     | 2026-05-14 → 2026-05-20      | Planner views + hubs; Agents KB + RAG + exec-mode; Deployment prod readiness                                                                               | —           |
| S5     | 2026-05-21 → 2026-05-27      | Planner MS-365 sync + admin; Agents admin + governance + reliability; People offboarding + GDPR                                                            | —           |
| S6     | 2026-05-28 → 2026-05-31 (4d) | Linking sprint: Planner cross-module + Agents planner R/W + scheduled runs + Phase-1 acceptance demo + final docs                                          | —           |

### 4.2 Capacity model

- Active engineering team: **3 feature engineers + 1 DevOps engineer**.
- AI-leveraged velocity assumption: **~45 SP per engineer per 1-week sprint**.
- Team capacity S3–S6 ≈ **~540 SP feature work + ~135 SP deployment** = **~675 SP**.
- Phase-1 backlog load (after merges): ~119 active tickets (excluding 14 Foundation Done tickets), avg 4 SP ≈ ~480 SP.
- Slack: **~195 SP** for unknowns, hardening, and Sprint 6 demo prep.

### 4.3 Default track allocation (user reassigns later)

| Track                     | Engineers           | S3                                                    | S4                   | S5                               | S6                                            |
| ------------------------- | ------------------- | ----------------------------------------------------- | -------------------- | -------------------------------- | --------------------------------------------- |
| Track A — Planner core    | 1 FS eng            | CRUD + evidence                                       | Views + Hubs         | MS-365 sync + Admin              | (joins linking)                               |
| Track B — Agents core     | 2 FS engs (FE + BE) | Chat + SSE + turn model                               | KB + RAG + exec-mode | Admin + governance + reliability | (joins linking)                               |
| Track C — Deployment      | 1 DevOps            | Staging on ECS                                        | Prod readiness       | Hardening + dual-tenant probe    | Continues prod hardening                      |
| People + Web Admin + Docs | unassigned          | Default-fold into Track A and Track B as backlog pull |                      |                                  |                                               |
| Linking sprint            | 3 FS engs converged | —                                                     | —                    | —                                | Cross-module + planner R/W + schedules + demo |

Capacity for People (~7 tickets) and Web Admin (~4 tickets) and Docs/SDLC (~8 tickets) is unassigned; user reassigns. Risk #13 captures the staffing gap.

## 5. Field set and ticket templates

### 5.1 Field set on every ticket

```
Status:        Backlog | Todo | In Progress | In Review | Testing | Done
Epic:          <Epic title or ID>
Sprint:        Sprint-1 | Sprint-2 | Sprint-3 | Sprint-4 | Sprint-5 | Sprint-6 | Backlog
Release:       foundation | deployment | phase-1 | phase-1.5 | docs
Priority:      P0 | P1 | P2 | P3
Story Point:   1 | 2 | 3 | 5 | 8
Rank:          <integer; lower = higher priority within Epic / Sprint>
```

Removed from `standards.md` defaults: `Tags`, `Jira Key`, `Confluence Link`. Added: `Sprint`, `Rank`.

### 5.2 Epic template

```markdown
## [EPIC] <ID> <Title>

Status: <Backlog | In Progress | Done>
Sprint: <Sprint-N or range>
Release: <release tag>
Priority: <P0..P3>
Story Point: <rolled up from children, optional>
Rank: <integer>

### Summary

<1–2 sentences>

### Goal

<one sprint-goal-style sentence: "By S5 close, X is true">

### Scope

- <bullet list of in-scope outcomes>

### Out of Scope

- <bullet list with rationale or reference>

### SRS Coverage

- FR-XX-NNN, FR-XX-NNN, … (or "n/a" for non-SRS epics)
- UI-XX-NNN, …
- NFR-XX-NNN, …

### Acceptance Criteria

- [ ] <epic-level outcome, testable>

### Child Tickets

- <ID> <Title> (Story / Task)
- …

### Definition of Done

- All child tickets are Done.
- SRS Coverage requirements have a verification artefact (test, observation, or audit).
- <epic-specific DoD items, if any>
```

### 5.3 Story template

```markdown
### [STORY] <ID> <Title>

Status: <status>
Epic: <Epic ID>
Sprint: <Sprint-N>
Release: <release tag>
Priority: <P0..P3>
Story Point: <1 | 2 | 3 | 5 | 8>
Rank: <integer>

#### Summary

As <persona>, I want <goal>, so that <value>.

#### Acceptance Criteria

- [ ] <testable outcome>
- [ ] <…>
- [ ] **E2E** — <one user-visible end-to-end check>

#### AI Execution Notes

<implementation hints; for retroactive Done tickets, the artefact path goes here>

#### Testing Notes

- Unit / integration / E2E / manual coverage required
- Happy path: <one sentence>
- Main error path: <one sentence>
- Permission / data / sync behaviour: <if relevant>

#### Dependencies

- Blocked by: <ticket IDs or "none">
- Blocks: <ticket IDs or "none">

#### Definition of Done

- Inherits project DoD.
- <story-specific DoD items only>
```

### 5.4 Task template

Same shape as Story, except:

- `#### Summary` is plain prose, not "As X / I want / so that."
- `#### Requirements` section replaces the user-story summary with a bulleted requirements list.

### 5.5 Project-level Definition of Ready

Inherited from `standards.md` §"Definition of Ready" with the added requirement that every Story has at least one **E2E** AC item that ticks only when the user-visible flow works end-to-end.

### 5.6 Project-level Definition of Done

Inherited from `standards.md` §"Definition of Done" with these project-specific additions:

- Tests pass at ≥70% line / function / branch coverage (per CLAUDE.md).
- Cross-module changes ship the Drizzle schema change in `0000_initial.sql` (single-file migration policy).
- For RLS-touching changes: a synthetic dual-tenant probe assertion is added or updated.
- For agent / kernel audit-emitting changes: a kernel audit-event assertion is added.

## 6. Initiative catalogue

### 6.1 Foundation (4 epics, ~14 Tasks, all `Status: Done`)

| Epic                                      | Sprint | Task count |
| ----------------------------------------- | ------ | ---------- |
| FOUND-1 Monorepo & toolchain              | S1     | ~4         |
| FOUND-2 Backend & data layer              | S2     | ~5         |
| FOUND-3 Frontend skeleton & design system | S2     | ~3         |
| FOUND-4 Auth & session                    | S2     | ~2         |

Each Task has full AC checklist with `[x]` ticked, plus a `Built artefact:` line in `AI Execution Notes` pointing at the code path (e.g., `packages/auth/src/`, `apps/api/src/modules/`).

### 6.2 People (2 epics, ~7 Stories)

| Epic                                                                                      | Sprint | Stories |
| ----------------------------------------------------------------------------------------- | ------ | ------- |
| PEOPLE-1 Profiles & placements                                                            | S3–S4  | ~4      |
| PEOPLE-2 Offboarding, GDPR & cross-module facade (PeopleQueryFacade contract on S3 day-1) | S4–S5  | ~3      |

### 6.3 Deployment (3 epics, ~14 tickets)

| Epic                               | Sprint | Stories / Tasks                                                                                                                                                       |
| ---------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEPLOY-1 AWS infra & Terraform IaC | S3     | ~5 (VPC, ECS Fargate ARM64, RDS Postgres + RDS Proxy, ALB+ACM+Route53, ECR, Secrets Manager)                                                                          |
| DEPLOY-2 CI/CD pipelines           | S3–S4  | ~4 (GitHub Actions OIDC, per-zone build+push, Turbo cache, smoke tests)                                                                                               |
| DEPLOY-3 Production readiness      | S4–S5  | ~5 (synthetic dual-tenant probe, scale-to-zero staging, secrets rotation runbook, alerting wiring vendor-agnostic per memory, DB backup + PITR, prod cutover runbook) |

### 6.4 Planner Phase-1 (7 epics, ~38 Stories + 4 Tasks)

| Epic                                                                                                   | Sprint | SRS coverage                    | Stories                                   |
| ------------------------------------------------------------------------------------------------------ | ------ | ------------------------------- | ----------------------------------------- |
| PLAN-1 Plans, buckets, tasks core CRUD                                                                 | S3     | FR-PL-001..014 + UI-PL-001..006 | ~7                                        |
| PLAN-2 Evidence & verification                                                                         | S3     | FR-PL-015..017 + UI-PL-007..008 | ~3                                        |
| PLAN-3 View modes (Board, Grid, Charts, Schedule)                                                      | S4     | FR-PL-020..024 + UI-PL-009..014 | ~4                                        |
| PLAN-4 Personal hubs (My Day, My Tasks, Personal Charts, Carry-Over)                                   | S4     | FR-PL-017..019 + UI-PL-015..018 | ~5                                        |
| PLAN-5 MS-365 sync (3 container types, conflict log)                                                   | S4–S5  | FR-PL-030..050 + UI-PL-019..022 | ~8                                        |
| PLAN-6 Admin surface                                                                                   | S5     | FR-PL-055..060 + UI-PL-023..025 | ~5                                        |
| PLAN-7 Cross-module surfaces — LINKING (read-facade contract S3 day-1, write-facade contract S3 day-1) | S6     | FR-PL-060..067                  | ~4 stories + 2 contract Stories + 4 Tasks |

### 6.5 Agents Phase-1 (7 epics, ~40 Stories + 4 Tasks)

| Epic                                                              | Sprint | SRS coverage                                        | Stories                                               |
| ----------------------------------------------------------------- | ------ | --------------------------------------------------- | ----------------------------------------------------- |
| AGN-1 Conversational surfaces (web-agents zone scaffold included) | S3     | FR-001..007 + UI-001..010                           | ~7 stories + 1 contract Story (Agents internal FE/BE) |
| AGN-2 Planner read+write capabilities — LINKING                   | S6     | FR-060..070                                         | ~7                                                    |
| AGN-3 Tenant KB (RAG)                                             | S4     | FR-050..059 + UI-017                                | ~6                                                    |
| AGN-4 Execution-mode framework + approval inbox                   | S4     | FR-008..018, FR-040..045 + UI-013, UI-022           | ~6                                                    |
| AGN-5 Scheduled & event-triggered runs — LINKING                  | S6     | FR-071..075, FR-003                                 | ~5                                                    |
| AGN-6 Tenant administration                                       | S5     | FR-076..084 + UI-016..019                           | ~6                                                    |
| AGN-7 Governance, replay, cost, GDPR, reliability                 | S5     | FR-019..039, FR-046..049, FR-085..088, NFR-001..023 | ~9 stories + 4 cross-cutting Tasks                    |

### 6.6 Web Admin (1 epic, ~4 Stories) — light

| Epic                                          | Sprint | Stories                                                                                                                                |
| --------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| ADMIN-1 web-admin zone shell + platform admin | S3–S4  | ~4 (zone scaffold + AppLayout, tenant settings + module toggles, platform-admin role-gated view, host shell for module admin surfaces) |

Note: AI config admin lives in AGN-6. Module-specific admin pages (PLAN-6, AGN-6) are owned by their respective backlogs — web-admin epic provides only the host shell.

### 6.7 Docs / SDLC (2 epics, ~8 tickets)

| Epic                               | Sprint        | Tickets                                                                                                                                                                                                                                        |
| ---------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOC-1 Architecture, ADRs, runbooks | rolling S3–S6 | ~5 (SRS date defect amendment per risk #3, ADR for cross-module facade pattern, ADR for outbox event delivery, ADR for parallel-track contract publication, runbook for prod cutover, runbook for incident response, runbook for GDPR erasure) |
| DOC-2 SDLC process & PR/CI hygiene | rolling S3–S6 | ~3 (PR template, lefthook hooks, CONTRIBUTING.md updates, release-notes template)                                                                                                                                                              |

## 7. Sprint-load summary

| Sprint            | Found |         People | Deploy |                      Planner |         Agents | Admin | Docs | Total tickets |
| ----------------- | ----: | -------------: | -----: | ---------------------------: | -------------: | ----: | ---: | ------------: |
| S1 (Done)         |     4 |              — |      — |                            — |              — |     — |    — |             4 |
| S2 (Done)         |    10 |              — |      — |                            — |              — |     — |    — |            10 |
| S3                |     — | 2 + 1 contract |      5 | 10 + 1 contract + 1 contract | 7 + 1 contract |     2 |    1 |           ~30 |
| S4                |     — |              3 |      4 |                            9 |             12 |     2 |    2 |           ~32 |
| S5                |     — |              2 |      5 |                           13 |             15 |     — |    2 |           ~37 |
| S6 (linking)      |     — |              — |      — |                            6 |             12 |     — |    3 |           ~21 |
| **Phase-1 total** |    14 |              7 |     14 |                           42 |             44 |     4 |    8 |      **~133** |

## 8. Risk register

| #   | Risk                                                                                          | Impact                                               | Mitigation                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Compressed Planner+Agents window (S3–S5).                                                     | Feature land slips to June.                          | Parallel tracks, AC checkboxes for partial credit, late-cut Agents schedules to phase-1.5 if velocity <100 SP/sprint after S3. |
| 2   | MS-365 sync E2E testing requires real tenant access.                                          | Sync work blocks.                                    | Book Microsoft sandbox tenant by S3 day-2.                                                                                     |
| 3   | Source SRS dates (2026-05-20) are wrong.                                                      | Stakeholder confusion; downstream contracts misread. | DOC-1 epic includes an SRS amendment ticket.                                                                                   |
| 4   | Zero cross-tenant exposure launch gate.                                                       | Cannot ship without proof.                           | Synthetic dual-tenant probe in DEPLOY-3, runs continuously from S4.                                                            |
| 5   | AI-leveraged velocity assumption (~45 SP/eng/wk) is unproven for this team.                   | Slip risk.                                           | Re-baseline at S3 retro; late-cut path to phase-1.5 if velocity <100 SP/sprint team total.                                     |
| 6   | AC checkbox-as-progress can mask incomplete work.                                             | False confidence.                                    | Every Story has at least one **E2E** AC item that ticks only when the user-visible flow works end-to-end.                      |
| 7   | GDPR right-to-erasure (Agents NFR-017 + Planner UN-PL-10) requires data-flow audit before GA. | Compliance gate fails.                               | PEOPLE-2 GDPR Story + AGN-7 GDPR Story + DOC-1 runbook.                                                                        |
| 8   | Parallel-track integration drift.                                                             | S6 linking fails.                                    | Contract publication on S3 day-1 (4 contracts); weekly contract sync at S3/S4/S5 retros; mock-validation gate before S6.       |
| 9   | S6 linking sprint is only 4 calendar days for 3 epics.                                        | Phase-1 demo not ready.                              | Carve AGN-5 into "schedules-no-planner" (S5 in core) and "schedules-with-planner-data" (S6) to lighten S6.                     |
| 10  | AI-led deployment requires explicit Definition of Done.                                       | Hidden config drift.                                 | Every DEPLOY-\* Story has `human-review` AC checkbox a DevOps engineer ticks; AI doesn't self-tick.                            |
| 11  | Hiring lead time vs May deadline.                                                             | New hires won't help Phase-1.                        | User accepts; staffing decisions deferred to user.                                                                             |
| 12  | No QA role on the Phase-1 team.                                                               | Launch-gate verification has no owner.               | Engineering self-tests via `apps/e2e/`; named owner per launch gate before S6; user can add a contract QA ticket.              |
| 13  | Kernel + Identity Phase-1 work is folded into consumer ACs, not given dedicated epics.        | Hidden scope; possible mid-sprint discoveries.       | If real Phase-1 kernel/identity work surfaces during writing-plans, add tickets at that point.                                 |
| 14  | People + Web Admin + Docs/SDLC have no named owner in track allocation.                       | Work falls between cracks.                           | User reassigns at backlog handoff; default fold into Track A / Track B by backlog pull.                                        |
| 15  | Single-engineer Planner track is a bus-factor.                                                | One absence stalls Planner.                          | Every Planner Story has `Reviewer:` in DoD; PR review distributes context.                                                     |
| 16  | Agents FE/BE split inside one track needs an internal contract.                               | Integration drift inside the Agents track.           | AGN-1 contract publication on S3 day-1, same shape as cross-module contracts.                                                  |

## 9. Decision log

| #   | Question                                    | Decision                                                                                                           | Rationale                                                                                               |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| D1  | Coverage vs. gap (full SRS vs. delta-only)? | (a) Full Phase-1 SRS coverage as if greenfield.                                                                    | User explicitly chose (a). Preserves SRS ↔ ticket trace required by RTM.                                |
| D2  | Granularity rule?                           | One Story per cohesive feature outcome (not per FR).                                                               | Cuts ticket count by ~50% while preserving full SRS coverage.                                           |
| D3  | Output format?                              | Markdown only, no Jira sync.                                                                                       | User decision.                                                                                          |
| D4  | Scrum cadence?                              | 1-week sprints, May-end finish, AI-leveraged velocity.                                                             | User decision.                                                                                          |
| D5  | Foundation tickets?                         | Yes, retroactive, all `Status: Done`.                                                                              | User decision: "we still need ticket for foundation."                                                   |
| D6  | Hiring tickets?                             | No.                                                                                                                | User decision: "don't need ticket for hiring here."                                                     |
| D7  | Web admin scope?                            | Light — one epic for shell + platform-admin view.                                                                  | User decision: "and light web-admin."                                                                   |
| D8  | Kernel + Identity epics?                    | Folded into consumer ACs, not in scope as standalone epics.                                                        | User decision: "keep call it the people."                                                               |
| D9  | Out-of-scope modules?                       | time, hiring, performance, projects, finance, goals, insights — not ticketed.                                      | User confirmed in-scope list.                                                                           |
| D10 | DOC-1 SRS-amendment ticket?                 | Keep. Scope = update SRS docs to match reality OR write ADR if a decision is needed.                               | User decision: "update SRS doc to match or decision if need."                                           |
| D11 | Contract-publication stories?               | Keep all four (Planner read, Planner write, PeopleQueryFacade, Agents internal FE/BE), all SP=2, all due S3 day-1. | Without contracts on S3 day-1, parallel tracks cannot mock against each other and S6 linking fails.     |
| D12 | `Sprint:` and `Rank:` field additions?      | Add both to every ticket.                                                                                          | A professional Scrum board needs sprint placement and rank ordering; otherwise the board is unsortable. |

## 10. Out of scope

The following are explicitly **not** in this portfolio:

- **Modules:** `time`, `hiring`, `performance`, `projects`, `finance`, `goals`, `insights` — future SRS amendments.
- **Hiring tickets** — user reassigns staffing separately.
- **Tags field** on tickets — removed from templates per user.
- **Jira sync / Confluence sync** — markdown only.
- **Phase-1.5 deferral candidates** (Planner §1.5.2.1 and Agents §1.5 deferred items): Copy Plan, Export Excel/CSV, per-bucket colour, Custom fields, Conditional coloring, People view, sprints/backlog, custom calendars, Copilot in Planner, server-side rich-text editing, cross-conversation memory, multi-region, multi-AI failover at runtime, OCR, LLM-as-judge, Slack/Teams channel surfaces, event-source triggers — listed in `portfolio-overview.md` "Deferred" appendix only, not ticketed.
- **Subtasks** — banned by `standards.md`. Implementation breakdown is owned by the implementer.

## 11. Output writing strategy

When writing the 8 files (next step is `writing-plans`), the recommended batching is:

1. **Batch 1 — scaffold:** `portfolio-overview.md` + `foundation-backlog.md` + `docs-sdlc-backlog.md`. These are the smallest and validate the markdown shape. Commit. User can review template before the bulk write.
2. **Batch 2 — small initiatives:** `people-backlog.md` + `web-admin-backlog.md` + `deployment-backlog.md`. Commit.
3. **Batch 3 — Planner:** `planner-backlog.md`. Commit.
4. **Batch 4 — Agents:** `agents-backlog.md`. Commit.

Each commit is independently reviewable. If shape needs revision, only the next batch changes.

## 12. Next step

After user review of this design doc, invoke `superpowers:writing-plans` to produce the implementation plan for generating the 8 backlog files. The plan will sequence the four batches above with explicit per-file content checklists and per-batch acceptance criteria.
