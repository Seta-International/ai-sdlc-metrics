# Phase-1 SDLC Backlog — Design

| Field         | Value                                                                    |
| ------------- | ------------------------------------------------------------------------ |
| Date          | 2026-05-07                                                               |
| Status        | Draft — pending user review                                              |
| Author        | Brainstorming session, agreed with user                                  |
| Project start | 2026-04-23                                                               |
| MVP demo      | 2026-05-31 (May end). Phase-1 GA slips to a later date set by the user.  |
| Today         | 2026-05-07 (start of Sprint 3)                                           |
| Deliverable   | 8 markdown files under `docs/superpowers/specs/`                         |
| Output target | Markdown — **atlassian-pushable** via `sdlc:spec-to-backlog` (see §14)   |
| MVP cut       | Full Phase-1 SRS coverage in tickets; non-MVP items go `Sprint: Backlog` |

---

## 1. Context

The user requested a complete Phase-1 SDLC backlog covering the Agents and Planner modules plus the People module, web-admin shell, deployment / IaC, and supporting documentation / SDLC process work. The Foundation week was completed prior to this session and is included for retroactive trace.

The two source SRSs are large:

- `docs/architecture/agents-srs.md` — 1339 lines, FR-001 through FR-088 (88 functional requirements), UI-001..UI-023, NFR-001..NFR-023.
- `docs/architecture/planner-srs.md` — 1487 lines, FR-PL-001 through FR-PL-067 (67 functional requirements), UI-PL-001..UI-PL-025.

Both SRSs target a Phase-1 envelope. The acceptance demo date stated in `agents-srs §1.5` (2026-05-20) is inconsistent with the agreed MVP demo date (2026-05-31) and with the project-start date (2026-04-23) given a three-engineer team. The date defect is acknowledged and tracked as a Docs / SDLC ticket (DOC-1) that updates the SRSs to match.

**MVP-cut framing.** A thorough audit of both SRSs surfaced ~25 ambiguities, missing contracts, and Phase-1-vs-architecture-only items that would have produced confidently-named-but-actually-unworkable tickets. Decisions for each are captured in §13. The May-31 milestone is **MVP demo**, not Phase-1 GA. The portfolio still represents full Phase-1 SRS coverage (every requirement gets a ticket), but only MVP-critical tickets are placed in Sprints S3–S6; non-MVP items go to `Sprint: Backlog`. Phase-1 GA (full SRS launch gates) lands at a later date set by the user. This is an explicit trade-off: the SRS Phase-1 launch gates will not all pass at MVP cut — DOC-1 amends the SRSs accordingly.

There is no `people-srs.md`. The People module scope in MVP is **Profiles only** — placements (manager/reportee, teams, departments), offboarding/GDPR, and fuzzy directory search are deferred to `Sprint: Backlog`. Cascading effects on Agents role-scoped reads are captured in §6.5 and §13.

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

**Total:** 26 epics, ~129 tickets across 7 backlog files plus a portfolio overview index. Of these:

- **~80 tickets MVP-in (S3–S6)** — concentrated on demo-critical surfaces.
- **~49 tickets `Sprint: Backlog`** — full Phase-1 SRS coverage retained for trace, but unscheduled.

Per-initiative split is in §6 and §7.

## 3. Methodology decisions

| Decision                           | Choice                                                                                                                                                            | Rationale                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| SRS coverage                       | (a) Full Phase-1 SRS scope as if greenfield. Every requirement gets a ticket regardless of build state.                                                           | Matches user request; preserves SRS ↔ ticket trace required by RTM (Appendix D of each SRS).                               |
| MVP cut                            | Full SRS coverage in tickets, but only MVP-critical tickets get sprint placement S3–S6. Non-MVP items go `Sprint: Backlog`. May-31 = MVP demo, not Phase-1 GA.    | User decision after blocker audit revealed ~25 unresolved items; cuts scope to demo-critical surfaces while keeping trace. |
| People MVP scope                   | Profiles only. Placements, offboarding, GDPR erasure, fuzzy resolution → Backlog.                                                                                 | User decision: "FOR THE PEOPLE NOW JUST NEED TO HAVE THE Profiles IS FINE, OTHER IS DEFERED".                              |
| Cascading effect on Agents         | Role-scoped reads (FR-060..064 team/dept/manager analysis) → Backlog. NL writes constrained to current-task assignees + exact-email. k-anonymity floor → Backlog. | Without People placements there is no org chart; role-scoped reads cannot be answered correctly.                           |
| Granularity                        | One Story per cohesive feature outcome, even when it covers 5–15 FRs. FRs become AC checkboxes + traceability rows. SP 13 → split.                                | Reduces total ticket count by ~50% vs. one Story per FR while preserving full SRS coverage.                                |
| Output                             | Markdown formatted for `sdlc:spec-to-backlog` / `atlassian:spec-to-backlog` consumption. `Jira Key:` and `Confluence Link:` present-but-empty until sync.         | Lets the user push the entire backlog to Jira with one skill invocation later. Field mapping in §14.                       |
| Sprint cadence                     | 1-week sprints, AI-leveraged velocity.                                                                                                                            | User decision: "we use AI to leverage the speed; must finish all of these in May."                                         |
| Phase-1 finish                     | 2026-05-31. Source SRS date (2026-05-20) is wrong and gets amended via DOC-1.                                                                                     | User decision: "iii — the dates in the SRSs are wrong and need fixing."                                                    |
| Foundation tickets                 | Retroactive, all `Status: Done`, full AC checklist with `[x]` boxes. Each ticket carries a `Built artefact:` line pointing at the code path.                      | User decision: "we still need ticket for foundation." Trace is the value.                                                  |
| Hiring tickets                     | Out of scope.                                                                                                                                                     | User decision: "don't need ticket for hiring here."                                                                        |
| Tags                               | Removed entirely from ticket templates.                                                                                                                           | User decision: "remove tag."                                                                                               |
| `Jira Key:` and `Confluence Link:` | Removed entirely.                                                                                                                                                 | We're not pushing to Jira or Confluence.                                                                                   |
| Sprint and Rank fields             | Added to every ticket (deviation from `standards.md`).                                                                                                            | A professional Scrum board needs sprint placement and rank ordering; otherwise the board is unsortable.                    |
| Contract publication stories       | One SP=2 Story on each cross-module facade, all due S3 day-1: Planner read-facade, Planner write-facade, PeopleQueryFacade, Agents internal FE/BE.                | Without contracts on S3 day-1, parallel tracks cannot mock against each other and S6 linking fails.                        |
| Out-of-scope modules               | `time`, `hiring`, `performance`, `projects`, `finance`, `goals`, `insights` — not ticketed in this portfolio. Treated as future SRS amendments.                   | User confirmed the 5+1 in-scope list (Foundation, People, Deployment, Planner, Agents, Web Admin, Docs/SDLC).              |

## 4. Sprint cadence and capacity

### 4.1 Sprint plan

| Sprint | Window                       | Sprint goal                                                                                                                                                                                                                                                                         | State       |
| ------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| S1     | 2026-04-23 → 2026-04-29      | Monorepo + toolchain ready (FOUND-1)                                                                                                                                                                                                                                                | Done        |
| S2     | 2026-04-30 → 2026-05-06      | Backend + frontend + auth + DB skeletons ready (FOUND-2,3,4)                                                                                                                                                                                                                        | Done        |
| **S3** | **2026-05-07 → 2026-05-13**  | Staging deployable on ECS; People profile CRUD + Planner CRUD + evidence walking skeletons; Agents chat+SSE skeleton; **all 4 cross-module contracts published on day-1**                                                                                                           | **Current** |
| S4     | 2026-05-14 → 2026-05-20      | Planner views + hubs + **MS-365 sync core (started)**; Agents KB + RAG + **exec-mode framework**; Deployment prod readiness; admin shell                                                                                                                                            | —           |
| S5     | 2026-05-21 → 2026-05-27      | **MVP feature-complete.** Planner MS-365 sync finish + admin + conflict-override + **cross-module impl + outbox events**; Agents admin + governance core + **planner R/W own-scope + scheduled runs own-scope**; Deploy hardening + dual-tenant probe. **Code freeze at S5 close.** | —           |
| S6     | 2026-05-28 → 2026-05-31 (4d) | **Hardening sprint — no new features.** Bug fixes from S5 testing, performance/accessibility tuning, security review, MVP demo prep, final docs (DOC-1 SRS amendments + cutover runbook + release notes), RTM verification.                                                         | —           |

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
ID:              <internal ID like PLAN-1.S2 — stable, used for cross-references in this repo>
Status:          Backlog | Todo | In Progress | In Review | Testing | Done
Epic:            <Epic ID — references the parent Epic in this design>
Sprint:          Sprint-1 | Sprint-2 | Sprint-3 | Sprint-4 | Sprint-5 | Sprint-6 | Backlog
Release:         foundation | deployment | phase-1 | phase-1.5 | docs
Priority:        P0 | P1 | P2 | P3
Story Point:     1 | 2 | 3 | 5 | 8
Rank:            <integer; lower = higher priority within Epic / Sprint>
Jira Key:        <blank — populated by atlassian sync after creation>
Confluence Link: <blank — populated post-creation if a supporting page is linked>
```

**Why these fields:** matches the standards.md template exactly except for additions of `ID`, `Sprint`, `Rank`. `Tags` is **not** an authored field — it is **auto-derived during atlassian push** from the other fields (see §14.3). `Jira Key` and `Confluence Link` are present-but-empty so atlassian sync can fill them in-place after creating the issue.

### 5.2 Epic template

```markdown
## [EPIC] <ID> <Title>

ID: <FOUND-1 | PEOPLE-1 | DEPLOY-1 | PLAN-1 | AGN-1 | ADMIN-1 | DOC-1 | etc.>
Status: <Backlog | In Progress | Done>
Sprint: <Sprint-N or range>
Release: <release tag>
Priority: <P0..P3>
Story Point: <rolled up from children, optional>
Rank: <integer>
Jira Key: <blank>
Confluence Link: <blank>

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

ID: <PLAN-1.S2 | AGN-3.S4 | etc. — stable, used for cross-references>
Status: <status>
Epic: <Epic ID>
Sprint: <Sprint-N>
Release: <release tag>
Priority: <P0..P3>
Story Point: <1 | 2 | 3 | 5 | 8>
Rank: <integer>
Jira Key: <blank>
Confluence Link: <blank>

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

### 6.2 People (2 epics, ~3 MVP Stories + ~4 Backlog)

| Epic                                                                                          | Sprint               | Stories    |
| --------------------------------------------------------------------------------------------- | -------------------- | ---------- |
| PEOPLE-1 Profiles & exact-subject facade (PeopleQueryFacade contract on S3 day-1, exact-only) | S3 (S3–S4 if needed) | ~3 MVP     |
| PEOPLE-2 Placements, offboarding, GDPR erasure, fuzzy directory search                        | **Backlog**          | ~4 Backlog |

**MVP scope (PEOPLE-1):**

- Employment profile CRUD (employee record, status: active/inactive)
- `PeopleQueryFacade.resolveByExactSubject(sub)` — used by every persisted assignment in Planner; survives directory mutations to display name and email (planner-srs FR-PL-033, UN-PL-04)
- S3 day-1 contract publication for the facade (SP=2 Story)

**Backlog scope (PEOPLE-2):**

- Org placements (manager/reportee, teams, departments, placement history)
- Offboarding lifecycle (deactivation, transfers)
- GDPR right-to-erasure pipeline (audit-preserving anonymisation; Planner UN-PL-10, Agents NFR-017)
- `PeopleQueryFacade.searchByDisplayName(query, scope)` — fuzzy resolution with confidence ranking

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

### 6.5 Agents Phase-1 (7 epics, ~37 MVP Stories + ~7 Backlog Stories + 4 Tasks)

| Epic                                                              | Sprint                                 | SRS coverage                                        | Stories                                                                                                      |
| ----------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| AGN-1 Conversational surfaces (web-agents zone scaffold included) | S3                                     | FR-001..007 + UI-001..010                           | ~7 stories + 1 contract Story (Agents internal FE/BE)                                                        |
| AGN-2 Planner read+write capabilities — LINKING                   | S6 (own-scope) / Backlog (role-scoped) | FR-060..070                                         | ~4 MVP (own-scope reads + NL writes constrained) + ~3 Backlog (role-scoped reads)                            |
| AGN-3 Tenant KB (RAG)                                             | S4                                     | FR-050..059 + UI-017                                | ~6                                                                                                           |
| AGN-4 Execution-mode framework + approval inbox                   | S4                                     | FR-008..018, FR-040..045 + UI-013, UI-022           | ~6                                                                                                           |
| AGN-5 Scheduled & event-triggered runs — LINKING                  | S6                                     | FR-071..075, FR-003                                 | ~5 MVP (own-scope digests; delegation grant schema with hardcoded 90-day TTL; admin TTL config UI → Backlog) |
| AGN-6 Tenant administration                                       | S5                                     | FR-076..084 + UI-016..019                           | ~6                                                                                                           |
| AGN-7 Governance, replay, cost, GDPR, reliability                 | S5                                     | FR-019..039, FR-046..049, FR-085..088, NFR-001..023 | ~8 MVP + ~1 Backlog (k-anonymity floor → Backlog since aggregates depend on placements) + 4 Tasks            |

**Cascading impact of People MVP cut on Agents (per §1 and §13):**

- Role-scoped reads (FR-063 team-lead / dept-lead / org-lead workload, blockers, throughput) require placements → all Backlog.
- Own-scope reads (FR-060 partial: my open tasks, due-this-week, overdue items I own) → MVP.
- NL writes (FR-065..070): MVP-in but constrained — owner resolution by exact email or already-assigned-to-current-plan; no fuzzy "reassign to Anh".
- k-anonymity floor on aggregates (FR-025) → Backlog (no aggregates in MVP role-scoped reads).

**Backlog from Agents AGN-2 (~3 stories):** team workload analysis; blocker/overload analysis; cross-team dependency synthesis.

**Backlog from Agents AGN-7 (~1 story):** k-anonymity threshold + composition-attack defence on aggregate tools.

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

## 7. Sprint-load summary (MVP only)

| Sprint                | Found | People (MVP) | Deploy | Planner | Agents (MVP) | Admin | Docs | Hardening |                          Total |
| --------------------- | ----: | -----------: | -----: | ------: | -----------: | ----: | ---: | --------: | -----------------------------: |
| S1 (Done)             |     4 |            — |      — |       — |            — |     — |    — |         — |                              4 |
| S2 (Done)             |    10 |            — |      — |       — |            — |     — |    — |         — |                             10 |
| S3                    |     — |            3 |      5 |      12 |            8 |     2 |    1 |         — |                            ~31 |
| S4                    |     — |            — |      4 |      14 |           15 |     2 |    3 |         — |                            ~38 |
| S5                    |     — |            — |      5 |      19 |           17 |     — |    3 |         — | ~39 (heavy — code-freeze gate) |
| S6 (hardening)        |     — |            — |      — |       — |            — |     — |    3 |        15 |                            ~18 |
| **MVP total (S1–S6)** |    14 |            3 |     14 |      45 |           40 |     4 |   10 |        15 |                       **~145** |
| Backlog               |     — |            4 |      — |       2 |            8 |     — |    — |         — |                            ~14 |

Notes:

- S5 is the heaviest sprint (~39 tickets) and includes all linking work (PLAN-7 + AGN-2 own-scope + AGN-5 own-scope). **Code freeze at S5 close is the gate to S6 hardening.**
- S6 contains **only Tasks** (bug fixes, perf/a11y tuning, security review, demo prep, final docs, RTM verification). No new Stories.
- Hardening column is S6-only; carved as ~6 bug-fix placeholders + ~3 perf/a11y + ~2 security review + ~2 demo prep + ~2 RTM verification.
- MVP total grew from ~126 to ~145 because S6 hardening is now ticketed explicitly (was implicit before).
- Counts are approximate (`~`); ±2 between row sums and totals reflect contract Stories counted in both their owning epic and S3.

## 8. Risk register

| #   | Risk                                                                                          | Impact                                               | Mitigation                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Compressed Planner+Agents window (S3–S5).                                                     | Feature land slips to June.                          | Parallel tracks, AC checkboxes for partial credit, late-cut Agents schedules to phase-1.5 if velocity <100 SP/sprint after S3.                                                      |
| 2   | MS-365 sync E2E testing requires real tenant access.                                          | Sync work blocks.                                    | Book Microsoft sandbox tenant by S3 day-2.                                                                                                                                          |
| 3   | Source SRS dates (2026-05-20) are wrong.                                                      | Stakeholder confusion; downstream contracts misread. | DOC-1 epic includes an SRS amendment ticket.                                                                                                                                        |
| 4   | Zero cross-tenant exposure launch gate.                                                       | Cannot ship without proof.                           | Synthetic dual-tenant probe in DEPLOY-3, runs continuously from S4.                                                                                                                 |
| 5   | AI-leveraged velocity assumption (~45 SP/eng/wk) is unproven for this team.                   | Slip risk.                                           | Re-baseline at S3 retro; late-cut path to phase-1.5 if velocity <100 SP/sprint team total.                                                                                          |
| 6   | AC checkbox-as-progress can mask incomplete work.                                             | False confidence.                                    | Every Story has at least one **E2E** AC item that ticks only when the user-visible flow works end-to-end.                                                                           |
| 7   | GDPR right-to-erasure (Agents NFR-017 + Planner UN-PL-10) requires data-flow audit before GA. | Compliance gate fails.                               | PEOPLE-2 GDPR Story + AGN-7 GDPR Story + DOC-1 runbook.                                                                                                                             |
| 8   | Parallel-track integration drift.                                                             | S6 linking fails.                                    | Contract publication on S3 day-1 (4 contracts); weekly contract sync at S3/S4/S5 retros; mock-validation gate before S6.                                                            |
| 9   | S5 overload at ~39 tickets (linking + finishing core + hardening setup).                      | Code freeze gate slips, S6 hardening compressed.     | Code-freeze threshold at S5 mid-week — if velocity <25 tickets, late-cut PLAN-6 admin polish + AGN-7 model-degradation ladder to Backlog. Daily standup tracking against threshold. |
| 10  | AI-led deployment requires explicit Definition of Done.                                       | Hidden config drift.                                 | Every DEPLOY-\* Story has `human-review` AC checkbox a DevOps engineer ticks; AI doesn't self-tick.                                                                                 |
| 11  | Hiring lead time vs May deadline.                                                             | New hires won't help Phase-1.                        | User accepts; staffing decisions deferred to user.                                                                                                                                  |
| 12  | No QA role on the Phase-1 team.                                                               | Launch-gate verification has no owner.               | Engineering self-tests via `apps/e2e/`; named owner per launch gate before S6; user can add a contract QA ticket.                                                                   |
| 13  | Kernel + Identity Phase-1 work is folded into consumer ACs, not given dedicated epics.        | Hidden scope; possible mid-sprint discoveries.       | If real Phase-1 kernel/identity work surfaces during writing-plans, add tickets at that point.                                                                                      |
| 14  | People + Web Admin + Docs/SDLC have no named owner in track allocation.                       | Work falls between cracks.                           | User reassigns at backlog handoff; default fold into Track A / Track B by backlog pull.                                                                                             |
| 15  | Single-engineer Planner track is a bus-factor.                                                | One absence stalls Planner.                          | Every Planner Story has `Reviewer:` in DoD; PR review distributes context.                                                                                                          |
| 16  | Agents FE/BE split inside one track needs an internal contract.                               | Integration drift inside the Agents track.           | AGN-1 contract publication on S3 day-1, same shape as cross-module contracts.                                                                                                       |
| 17  | S6 hardening surfaces unfixable bugs.                                                         | MVP demo slips silently.                             | S5 close = explicit go/no-go gate on demo readiness; if no-go, MVP demo slips to first week of June with explicit user buy-in.                                                      |

## 9. Decision log

| #        | Question                                          | Decision                                                                                                                     | Rationale                                                                                                                                                                                       |
| -------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1       | Coverage vs. gap (full SRS vs. delta-only)?       | (a) Full Phase-1 SRS coverage as if greenfield.                                                                              | User explicitly chose (a). Preserves SRS ↔ ticket trace required by RTM.                                                                                                                        |
| D2       | Granularity rule?                                 | One Story per cohesive feature outcome (not per FR).                                                                         | Cuts ticket count by ~50% while preserving full SRS coverage.                                                                                                                                   |
| D3       | Output format?                                    | Markdown only, no Jira sync.                                                                                                 | User decision.                                                                                                                                                                                  |
| D4       | Scrum cadence?                                    | 1-week sprints, May-end finish, AI-leveraged velocity.                                                                       | User decision.                                                                                                                                                                                  |
| D5       | Foundation tickets?                               | Yes, retroactive, all `Status: Done`.                                                                                        | User decision: "we still need ticket for foundation."                                                                                                                                           |
| D6       | Hiring tickets?                                   | No.                                                                                                                          | User decision: "don't need ticket for hiring here."                                                                                                                                             |
| D7       | Web admin scope?                                  | Light — one epic for shell + platform-admin view.                                                                            | User decision: "and light web-admin."                                                                                                                                                           |
| D8       | Kernel + Identity epics?                          | Folded into consumer ACs, not in scope as standalone epics.                                                                  | User decision: "keep call it the people."                                                                                                                                                       |
| D9       | Out-of-scope modules?                             | time, hiring, performance, projects, finance, goals, insights — not ticketed.                                                | User confirmed in-scope list.                                                                                                                                                                   |
| D10      | DOC-1 SRS-amendment ticket?                       | Keep. Scope = update SRS docs to match reality OR write ADR if a decision is needed.                                         | User decision: "update SRS doc to match or decision if need."                                                                                                                                   |
| D11      | Contract-publication stories?                     | Keep all four (Planner read, Planner write, PeopleQueryFacade, Agents internal FE/BE), all SP=2, all due S3 day-1.           | Without contracts on S3 day-1, parallel tracks cannot mock against each other and S6 linking fails.                                                                                             |
| D12      | `Sprint:` and `Rank:` field additions?            | Add both to every ticket.                                                                                                    | A professional Scrum board needs sprint placement and rank ordering; otherwise the board is unsortable.                                                                                         |
| D13      | May-31 milestone framing?                         | **MVP demo, not Phase-1 GA.** Phase-1 GA slips to a later date set by the user. SRSs amended via DOC-1.                      | User decision after blocker audit: ship demo-critical MVP by May-31; defer non-MVP to Backlog with full SRS coverage retained for trace.                                                        |
| D14      | People MVP scope?                                 | **Profiles only.** Placements, offboarding, GDPR erasure, fuzzy resolution → Backlog.                                        | User decision: "FOR THE PEOPLE NOW JUST NEED TO HAVE THE Profiles IS FINE, OTHER IS DEFERED".                                                                                                   |
| D15      | Cascading effect on Agents role-scoped reads      | Team/dept/manager analysis → Backlog (no org chart). Own-scope reads + NL writes (constrained) → MVP. k-anonymity → Backlog. | Without People placements there is no org chart; role-scoped reads cannot be answered correctly.                                                                                                |
| D16..D40 | All Tier 1 + Tier 2 SRS blocker resolutions       | See §13 for full resolution table.                                                                                           | Blocker audit result locked through batch user approval.                                                                                                                                        |
| D41      | Linking sprint placement (PLAN-7 + AGN-2 + AGN-5) | Move all linking impl to S5; S6 becomes hardening-only with Tasks only. S5 close = code-freeze gate.                         | User decision: "must be working on S5 because we need time for improvement, testing, bug fixing." S5 load balanced by pulling Planner sync core and Agents exec-mode framework forward into S4. |

## 10. Out of scope and Backlog

### 10.1 Out of scope (not in any backlog file)

The following are explicitly **not** in this portfolio:

- **Modules:** `time`, `hiring`, `performance`, `projects`, `finance`, `goals`, `insights` — future SRS amendments.
- **Hiring tickets** — user reassigns staffing separately.
- **Tags field** on tickets — removed from templates per user.
- **Authored Tags / Labels** — derived automatically at push time per §14.3 (not manually authored on each ticket).
- **Phase-1.5 deferral candidates** (Planner §1.5.2.1 and Agents §1.5 deferred items): Copy Plan, Export Excel/CSV, per-bucket colour, Custom fields, Conditional coloring, People view, sprints/backlog, custom calendars, Copilot in Planner, **per-occurrence recurrence edits**, **server-side rich-text editing of new descriptions**, cross-conversation memory, multi-region, multi-AI failover at runtime, OCR, LLM-as-judge, Slack/Teams channel surfaces, event-source triggers — listed in `portfolio-overview.md` "Deferred" appendix only, not ticketed.
- **Subtasks** — banned by `standards.md`. Implementation breakdown is owned by the implementer.

### 10.2 MVP-out — present as tickets in `Sprint: Backlog`

These items have full tickets in their owning backlog file but carry `Sprint: Backlog`. They are deferred from MVP for one of two reasons: nice-to-have polish, or cascade from People MVP cut.

**Nice-to-have polish (deferred to Backlog by user):**

- Configurable delegation-grant TTL admin UI (Agents AGN-5) — schema with hardcoded 90-day default ships in MVP.
- Multi-provider LLM abstraction layer (Agents) — direct OpenAI in MVP code.
- i18n externalisation infrastructure (`t()` wrapper + JSON catalog) — English-only inline strings in MVP.

**Cascade from People MVP cut:**

- People placements (manager/reportee, teams, departments, placement history).
- People offboarding lifecycle.
- People GDPR right-to-erasure pipeline.
- People fuzzy directory search (`searchByDisplayName`).
- Agents role-scoped planner reads (FR-063 team/dept/manager workload, blockers, throughput).
- Agents NL fuzzy owner resolution (still works for already-assigned-to-current-plan + exact email).
- Agents k-anonymity floor on aggregates (FR-025) — moot until aggregates land.
- Planner manager-as-evidence-verifier inferred from org chart (replaced in MVP by explicit per-plan `verify_evidence` permission grants via kernel role).

## 11. Output writing strategy

When writing the 8 files (next step is `writing-plans`), the recommended batching is:

1. **Batch 1 — scaffold:** `portfolio-overview.md` + `foundation-backlog.md` + `docs-sdlc-backlog.md`. These are the smallest and validate the markdown shape. Commit. User can review template before the bulk write.
2. **Batch 2 — small initiatives:** `people-backlog.md` + `web-admin-backlog.md` + `deployment-backlog.md`. Commit.
3. **Batch 3 — Planner:** `planner-backlog.md`. Commit.
4. **Batch 4 — Agents:** `agents-backlog.md`. Commit.

Each commit is independently reviewable. If shape needs revision, only the next batch changes.

## 12. Next step

After user review of this design doc, invoke `superpowers:writing-plans` to produce the implementation plan for generating the 8 backlog files. The plan will sequence the four batches above with explicit per-file content checklists and per-batch acceptance criteria.

## 13. SRS Blocker Resolutions

A two-agent audit of the agents-srs and planner-srs surfaced ~25 ambiguities, missing contracts, and Phase-1-vs-architecture-only items. Each is resolved below with an explicit decision so backlog tickets can be written without `needs-context` ambiguity.

Resolutions are split into:

- **Tier 1 — architectural decisions** (10 items) that change the shape of multiple tickets.
- **Tier 2 — defaults** (16 items) where I committed a recommendation under user batch-approval.

All Tier 1 + Tier 2 decisions are user-approved (`ok` / `same as Tier 1` batched responses).

### 13.1 Tier 1 — architectural decisions

| ID    | Blocker                                                                                     | Decision                                                                                                                                                                                                                                                              | Sprint placement                                              |
| ----- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| T1-1  | Approval-inbox event contract (EI-010, FR-040 auto-reject TTL ownership).                   | Agents owns draft creation; approval-inbox owns TTL/auto-reject. Event shape: `{tenant_id, draft_id, initiator_user_id, tool_id, intent_payload, permission_envelope_at_draft, expires_at}`. Confirmation event back: `{draft_id, decision, decided_by, decided_at}`. | MVP S4 (AGN-4)                                                |
| T1-2  | Kernel audit transactional emission (Agents FR-021, Planner FR-PL-050) failure mode.        | Audit emission writes `kernel.audit_event` row in the SAME Drizzle transaction as the domain mutation. Kernel write failure → tx rolls back, mutation not persisted. **No fallback, no kill-switch.**                                                                 | MVP-critical S3–S5 (every write across all modules)           |
| T1-3  | PeopleQueryFacade query capabilities (fuzzy vs exact).                                      | Two methods on the facade: `resolveByExactSubject(sub)` (canonical, used for all persisted assignments). `searchByDisplayName(query, scope)` (fuzzy, used for NL resolution; threshold confidence 0.9 to auto-resolve, else surface candidates).                      | Exact: MVP S3 (PEOPLE-1). Fuzzy: **Backlog** (cascade D14).   |
| T1-4  | Delegation grant schema (Agents FR-026, FR-072).                                            | Schema: `{grant_id, tenant_id, principal_user_id, agent_run_kind, scope:{tools, read_resources, write_resources:[]}, expires_at, created_by, audited_event_id}`. Default TTL 90 days hardcoded; user-revocable; auto-revoked on user deactivation; audited each use.  | Schema MVP S5 (AGN-5). **TTL admin UI → Backlog.**            |
| T1-5  | MS-365 sync conflict-override re-validation (FR-PL-064).                                    | On admin override, re-run domain invariants (e.g., `due_date ≥ start_date`). Override that violates is rejected with structured error naming the failing invariant. Admin must edit losing snapshot before applying.                                                  | MVP S5 (PLAN-6) — full override flow.                         |
| T1-6  | Audit-shell failure rollback for Planner sync workers.                                      | Same as T1-2 (sync worker treats kernel failure as DB failure: mark sync attempt failed, retry per EIR-PL-010 backoff, surface in FR-PL-035 sync-health summary). No special path.                                                                                    | MVP-critical S4–S5                                            |
| T1-7  | Rich-text round-trip during Future-side edits (Appendix B.5).                               | Future-side description edits replace the opaque rich-text payload with new plain-text content. Rich-text is lost on push. Editor warns: "Editing this description will lose original formatting." Server-side rich-text editor for new content → Backlog.            | Read-only preservation MVP S4 (PLAN-5). **Editor → Backlog.** |
| T1-8  | MS-365 recurrence + field edits (FR-PL-053).                                                | Non-recurrence-field edits push to the parent recurring task (apply to all future occurrences — Microsoft's own behaviour). Per-occurrence edits are not supported in MVP; UI surfaces "this is recurring; edits apply to schedule" warning.                          | MVP S4 (PLAN-5). **Per-occurrence → Backlog (Phase-1.5).**    |
| T1-9  | Multi-provider LLM abstraction (Agents §1.5 "drop-in but not activated").                   | Direct OpenAI in MVP code; no `LlmProvider` interface. Adding a second provider later is a refactor, not a swap.                                                                                                                                                      | **Backlog.**                                                  |
| T1-10 | i18n externalisation infrastructure (NFR-021, I18N-03 "architected so additional locales"). | English-only inline strings in MVP code; no `t()` wrapper, no JSON catalog, no fallback rules. Future-locale support is a refactor.                                                                                                                                   | **Backlog.**                                                  |

### 13.2 Tier 2 — committed defaults

| ID  | Blocker                                                       | Default committed                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Output-shape declaration vs TTFT (FR-004 vs NFR-001).         | Shape declaration is **metadata-only, NOT counted toward TTFT**. p95 ≤ 2.5s applies to first content token.                                                                                                                       |
| B1  | Taint scope (FR-017).                                         | Conservative-secure: **any tool result containing tenant-authored free text (read OR write) taints all subsequent writes in the same turn.** Forces inbox routing for any write after a free-text read.                           |
| B2  | Minimum-group-size threshold (FR-025).                        | Platform default = 5 across all aggregate tools. Per-tool override allowed (declared on tool registration). k-anonymity = bucketed counts only when below threshold. **(Moot in MVP — k-anonymity → Backlog per §13.1 cascade.)** |
| C3  | Notification module channels in Phase-1.                      | **Email + in-app only** (existing platform channels). No Slack/Teams (Agents §1.5 explicit deferral).                                                                                                                             |
| D1  | MS-365 task ceiling per Microsoft tier (NFR-PL-PERF-11).      | **Hard-cap default 1000 active tasks/plan** (matches Microsoft Planner Basic published limit). Surface error to admin if exceeded; pause sync for that plan until under cap. Tunable per tenant.                                  |
| D5  | Bucket ordering after sync (FR-PL-006/029).                   | **LWW with last-write timestamp**, same rule as task fields per FR-PL-031. Conflict log entry if both sides changed within sync window.                                                                                           |
| E2  | Quality-canary "success" definition (NFR-030).                | Success = tool returned without error AND latency within tier SLA AND no user-rated-negative within turn. Rolling 30-min window; 429s and timeouts count as failures.                                                             |
| E3  | Sync pull cadence adaptive widening trigger (line 405).       | Trigger: any Microsoft 429 OR cumulative backoff > 1 min in last 10 min. Double cadence each trigger, ceiling 30 min, decay back to 1-min steady state after 10 successful pulls.                                                 |
| G1  | $0.10 minimum-remaining budget (NFR-004).                     | Keep $0.10 — intentional, lets users spend most of their budget. Document rationale. Tenant-overridable to higher floor.                                                                                                          |
| G2  | 50 concurrent turns/tenant (NFR-003).                         | Keep 50, document as pilot-tuned. Tunable per tenant.                                                                                                                                                                             |
| G3  | 1000 docs / 5MB per doc (FR-057, FR-058).                     | Keep both as pilot defaults. 5MB derived from OpenAI embedding chunk-count limit; 1000 derived from typical handbook+policy+FAQ size. Tunable.                                                                                    |
| H1  | Image-PDF rejection point.                                    | Reject at upload time via MIME + magic-bytes detection in browser; backend re-validates on receive. Fail fast.                                                                                                                    |
| H2  | Carry-Over sweep + computation timing (FR-PL-018, FR-PL-019). | Sweep at 23:00 user-tz; Carry-Over compute at 00:00 user-tz. Sweep runs first. Avoids stale orphan pins in next-day Carry-Over.                                                                                                   |
| H3  | Download proxying vs signed URL (EIR-PL-019).                 | **Signed URL with 5-min expiry + IP-binding where supported.** Backend authorises issue, S3 enforces expiry. Faster + cheaper than streaming proxy.                                                                               |
| I1  | Storage quota enforcement (FR-PL-062).                        | Hard-error at upload finalize with structured error code. UI shows quota-remaining bar.                                                                                                                                           |
| I2  | Checklist 20-item limit (FR-PL-011).                          | Hard-error with user-visible message referencing Microsoft Planner limit ("Microsoft Planner allows up to 20 items").                                                                                                             |

### 13.3 Implications baked into ticket writing

When backlog files are written, every Story / Task with AC related to a Tier-1 or Tier-2 item carries the resolution as an explicit AC checkbox or DoD line. Examples:

- Every domain-write Story includes AC: `[ ] Kernel audit_event row written in same DB transaction as the domain mutation; tx rolls back if audit write fails (per §13 T1-2)`.
- Every Agents write Story includes AC: `[ ] Free-text taint flag honored — any prior tool result with tenant-authored free text routes this write through the approval inbox (per §13 B1)`.
- Every Story with download / attachment delivery includes AC: `[ ] Signed URL issued with 5-min expiry, IP-binding where supported (per §13 H3)`.
- Every Backlog story carries `Sprint: Backlog` and a `Backlog reason:` field referencing the §13 ID.

## 14. Atlassian sync — making the backlog files Jira-pushable

Backlog files are written so that **`atlassian:spec-to-backlog`** (or `mcp__atlassian__jira_create_issue` directly) can ingest them with minimal transformation. This section documents the field mapping, the ticket-recognition contract, and the push workflow.

### 14.1 Ticket-recognition contract

The atlassian skill identifies tickets by markdown structure:

- `## [EPIC] <ID> <Title>` → Jira Epic
- `### [STORY] <ID> <Title>` → Jira Story (parented to its containing Epic)
- `### [TASK] <ID> <Title>` → Jira Task (parented to its containing Epic)

Headers must use the exact `[EPIC]` / `[STORY]` / `[TASK]` markers — the atlassian skill greps for these.

### 14.2 Field mapping — design field → Jira field

| Design field                    | Jira field                   | Notes                                                                                                                |
| ------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Header title                    | Summary                      | The title from `## [EPIC] <ID> <Title>` line                                                                         |
| `ID:`                           | (in Description prefix)      | Internal ID prepended to Description as `**ID:** PLAN-1.S2` so it stays searchable in Jira                           |
| `Status:`                       | Status                       | New tickets start in `Backlog`; transitions per `standards.md` workflow rules                                        |
| `Epic:`                         | Epic Link / Parent           | Resolved by the atlassian skill against the Epic's Jira Key after the Epic is created first                          |
| `Sprint:`                       | Sprint custom field          | `Sprint-N` maps to the named Jira sprint; `Backlog` leaves the sprint field empty                                    |
| `Release:`                      | Fix Version                  | `foundation` / `deployment` / `phase-1` / `phase-1.5` / `docs` create matching Fix Versions                          |
| `Priority:`                     | Priority                     | `P0..P3` maps to Highest / High / Medium / Low                                                                       |
| `Story Point:`                  | Story Points custom field    | Numeric                                                                                                              |
| `Rank:`                         | Rank (lexorank) custom field | Lower integer = higher position in board                                                                             |
| `Jira Key:`                     | (round-trip identifier)      | Blank on author; populated by atlassian skill after issue creation                                                   |
| `Confluence Link:`              | (Description footer)         | Blank on author; rendered in Description if non-empty                                                                |
| `#### Summary` body             | Description (top section)    | "As X, I want Y, so that Z" for Stories; bulleted for Tasks                                                          |
| `#### Acceptance Criteria` body | Description (heading)        | Markdown checkboxes preserved verbatim                                                                               |
| `#### AI Execution Notes` body  | Description (heading)        | Preserved verbatim                                                                                                   |
| `#### Testing Notes` body       | Description (heading)        | Preserved verbatim                                                                                                   |
| `#### Dependencies` body        | Issue Links                  | `Blocked by:` ID list → "is blocked by" links; `Blocks:` ID list → "blocks" links; resolved after all issues created |
| `#### Definition of Done` body  | Description (heading)        | Preserved verbatim                                                                                                   |
| (auto) Tags                     | Labels                       | Derived during push — see §14.3                                                                                      |

### 14.3 Auto-derived Labels (Tags) at push time

Atlassian sync derives Jira Labels from other fields without authoring burden. The derivation rule:

| Source field / detection                                 | Label generated      |
| -------------------------------------------------------- | -------------------- |
| `Release: foundation`                                    | `release-foundation` |
| `Release: deployment`                                    | `release-deployment` |
| `Release: phase-1`                                       | `release-phase-1`    |
| `Release: phase-1.5`                                     | `release-phase-1-5`  |
| `Release: docs`                                          | `release-docs`       |
| Epic ID prefix `FOUND-*`                                 | `module-foundation`  |
| Epic ID prefix `PEOPLE-*`                                | `module-people`      |
| Epic ID prefix `DEPLOY-*`                                | `module-deployment`  |
| Epic ID prefix `PLAN-*`                                  | `module-planner`     |
| Epic ID prefix `AGN-*`                                   | `module-agents`      |
| Epic ID prefix `ADMIN-*`                                 | `module-admin`       |
| Epic ID prefix `DOC-*`                                   | `module-docs`        |
| Sprint = `Backlog`                                       | `sprint-backlog`     |
| Sprint = `Sprint-N`                                      | `sprint-N`           |
| Story Point ≥ 8                                          | `needs-human-review` |
| AC mentions RLS / multi-tenant / cross-tenant            | `risk-data`          |
| AC mentions kernel audit / canDo / permission            | `risk-permission`    |
| AC mentions MS-365 / Graph / sync                        | `risk-external-sync` |
| AC mentions migration / 0000_initial.sql                 | `risk-migration`     |
| AC mentions GDPR / right-to-erasure / PII                | `risk-data`          |
| Ticket has full AC + testing notes + DoD + clear scope   | `ai-ready`           |
| Any FR cited in `### SRS Coverage` is unresolved per §13 | `needs-context`      |

The push wrapper script (or the atlassian skill itself) applies these rules — backlog files do NOT carry an authored `Tags:` line.

### 14.4 Push workflow

```
1. Author writes / updates the 7 backlog files.
2. Run `superpowers:requesting-code-review` for one final pass on the markdown.
3. Invoke `sdlc:spec-to-backlog` (which delegates to `atlassian:spec-to-backlog` if installed).
   - Skill reads the backlog file front-to-back.
   - For each `## [EPIC]` block: creates Jira Epic, captures returned key.
   - For each `### [STORY]` / `### [TASK]` block: creates issue with Epic Link
     resolved from the parent Epic's captured key.
   - Auto-derives Labels per §14.3.
   - Writes `Jira Key:` back into the markdown file in-place.
   - Commits the markdown change so the local file mirrors Jira state.
4. Resolve `#### Dependencies` Issue Links in a second pass (after all issues exist).
5. (Optional) Push design doc to Confluence; populate `Confluence Link:` in each ticket.
```

### 14.5 Idempotency and re-push

If a `Jira Key:` is already populated on a ticket when push runs again, the atlassian skill **updates** the existing issue instead of creating a duplicate. This makes the backlog file the source of truth — edits flow author → markdown → Jira, never the other direction.

If a ticket was deleted in Jira but `Jira Key:` is still set in markdown, the atlassian skill detects the 404 and creates a new issue, then writes the new key back to the markdown file.

### 14.6 What's still your job

The atlassian sync does NOT:

- Configure Jira workflows / statuses / custom fields. Confirm `Sprint`, `Story Points`, and `Rank` custom fields exist in your Jira project before first push.
- Confirm the project key (e.g., `FUTURE`) and pass it to the atlassian skill.
- Set initial Sprint membership in Jira Software (Jira Cloud requires a Sprint to exist before tickets can be added). Sprints S1..S6 must be pre-created or the skill creates them on first push if it has permission.
- Configure Fix Versions (`foundation`, `deployment`, `phase-1`, `phase-1.5`, `docs`) — the skill creates them on first push if it has permission.
