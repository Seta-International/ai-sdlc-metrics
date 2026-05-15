# Seta Agent Foundation — P1 Software Project Management Plan

**Project code:** SETA-OS-P1 · **Plan revision:** v1.0 (kickoff, 2026-05-11) · **Standard:** IEEE/ISO/IEC/IEEE 16326-2009 (IEEE Std 1058) — Software Project Management Plan (SPMP).

---

## §1 Overview

### 1.1 Project summary

#### 1.1.1 Purpose, scope, and objectives

**Purpose.** Build a slim, multi-tenant agent foundation in TypeScript on top of the Epic-1 auth/oauth/audit foundation already shipped. Deliver three specialist agents (Planner, Analytics, Seta FAQ) reachable in Microsoft Teams, backed by a frozen kernel (`@seta/agent-core`), persistent memory, a minimal workflow engine, and a complete in-process RAG pipeline (chunking + embeddings + vector + composition).

**Scope (in).** Single coherent release P1 — every item below ships in the 2026-05-29 demo:

1. `@seta/agent-core` kernel: model adapter, run loop, tool contract, streaming SSE protocol, testkit (msw record/replay).
2. `@seta/agent-memory`: conversation history + working-memory scratchpad in Postgres with RLS.
3. `@seta/agent-workflows`: linear DAG (`.then()` / `.parallel()`) with suspend/resume via advisory lock.
4. `@seta/agent-chunking` + `@seta/agent-embeddings` + `@seta/agent-vector` (HNSW + iterative_scan + RLS) + `@seta/agent-rag` (composition with citation provenance).
5. RAG corpus survey, curation, and end-to-end ingestion against a chosen Seta knowledge subset.
6. `platform/ms-graph` client + `modules/connectors/ms365-planner` (READ + WRITE with etag/cache).
7. `@seta/agent-server` (`platform/agent/server`): DB-driven agent profiles (`agent.agent_profiles`), injectable tool registry, boot seeder, Hono route factory (agent CRUD, run SSE, threads, workflows) — mirrors `@mastra/server`.
8. Three agent product modules: `@seta/planner` (`modules/products/planner`) **— alpha** — DB-first read tools, write preview/commit pairs, semantic search, T2 tools, workflows, TaskIndexer; `@seta/analytics` (`modules/products/analytics`) — aggregation tools, `analytics.*` materialized views, chart-card Adaptive Cards; `@seta/faq` (`modules/products/faq`) — RAG-backed, citation-bearing.
9. `modules/channels/teams` (`@seta/ms-teams`) with JWT/JWKS verification + OBO refresh; trigger-phrase routing dispatches to Planner / Analytics / FAQ agents via `@seta/agent-server` run pipeline.
9. `apps/api` composition (env, OTel boot via `--import ./instrumentation.ts`, mount, smoke).
10. Internal recorded demo + decision memo + 5 ADRs (0010 kernel, 0011 workflow MV, 0012 memory, 0013 vector + iterative_scan, 0014 RAG corpus structure).

**Scope (out).** Confirmed deferred to P2 — not in this plan under any condition:

- Inbound web SSO (Entra + Google OIDC web flow). Teams SSO + OBO only.
- Studio web admin app.
- OSS public flip + npm publish + Legal sign-off.
- Dual-language Python framework + FastAPI service.
- AWS Terraform staging (dev docker compose only).
- 30-query eval set + replay harness, multi-agent Coordinator, Supervisor scorer, GDPR delete domain, CloudWatch SLO dashboards, secret-rotation automation, Slack/Email/Voice channels, billing/metering, multi-region failover, SOC 2 prep.

**Foundation commitment.** Agent foundation (EP-01 kernel, EP-02 memory schema, EP-03 workflows, EP-04 chunking, EP-05 embeddings, EP-06 vector, EP-07 RAG composition) reaches feature-complete by D12 (mid-W3). The Planner track in W1 is limited to the Teams bot scaffold (channel-side: scaffold, echo, JWT, OBO); Planner agent integration and tool authoring start in W2.

**W3 phase split (commitment).**

- **D11–D12 — Feature wrap.** Finalize Memory provider impl, RAG composition tail, FAQ tools, Analytics tools, Planner WRITE safety review, full corpus ingestion. Last day for any new code paths.
- **D13–D15 — Hardening freeze.** No new feature code. Tasks limited to: ADR consolidation, gate tests (iterative_scan, cross-tenant isolation, BK-7 citation eval), live Teams round-trip smoke, `apps/api` smoke harness, integration bug fixes, demo dry-runs, recording, decision memo. Drop order in §5.3.1 governs anything that did not land by D12 EOD.

**Alpha definition (Planner).** The Planner Agent ships in P1 with the full scope defined in EP-10 (READ tools, WRITE preview/commit pairs, T2 analytics tools, bulk + report workflows, Adaptive Cards, permission views). "Alpha" is a production-readiness label, not a scope cut:

- Runs on dev docker compose only — no staging or production deployment.
- Passes CI gates (typecheck, lint, unit, integration, smoke) but no formal QA pass.
- No SLO / SLA commitments; observability via dev OTel/Jaeger only.
- No load, soak, or security pen-test.
- Hardening (production deployment, QA pass, SLOs, observability dashboards, security review) is P2 scope.

**Objectives (P1 — single tier).**

| #  | Objective                                                                                                                       |
| -- | ------------------------------------------------------------------------------------------------------------------------------- |
| O1 | Planner Agent (alpha) live in Microsoft Teams (READ tasks; WRITE via preview/commit). Alpha definition per §1.1.1.              |
| O2 | Analytics Agent returns chart-card Adaptive Cards for workload and distribution queries.                                        |
| O3 | Seta FAQ Agent returns answers with ≥1 retrieved-chunk citation on ≥80% of demo questions (BK-7).                              |
| O4 | `@seta/agent-core` kernel frozen and reusable by future ERP modules without re-architecture.                                    |
| O5 | `@seta/agent-memory` persists multi-turn context per (tenant, conversation); recall returns prior turns.                        |
| O6 | `@seta/agent-workflows` executes `.then(a).parallel([b,c])`, suspends on advisory-lock contention, resumes idempotently.       |
| O7 | Full RAG pipeline shipped: chunking, embeddings, vector store with HNSW + iterative_scan + per-tenant RLS, composition library. |
| O8 | RAG corpus collected, structured, and ingested for the FAQ Agent's demo loop.                                                   |
| O9 | Teams channel binds Planner end-to-end: live message → SSE stream → Adaptive Card render → preview/commit round-trip.          |

#### 1.1.2 Assumptions and constraints

**Assumptions (must hold for the plan to deliver).**

- A1. All four team members are 100% available 2026-05-11 → 2026-05-29 at the FTE in §4.3 (no PTO, no parallel project pulls).
- A2. Committed team capacity for P1 is **81 MD** across 15 working days, allocated per role in §5.2.3. Task estimates in §5.2.1 are written at unassisted-developer granularity; the gap between raw FTE-days (60 MD) and committed capacity (81 MD) absorbs scaffolding/boilerplate/test overhead and the W3 hardening reserve.
- A3. Epic-1 auth/oauth/audit foundation works as documented (tenant_user RLS, MSAL OBO refresh, `oauth.oauth_tokens` SOR). Entra app registration already has admin consent for Planner scopes.
- A4. Seta IT can review and approve corpus access rights by EOD D03 (Wed 2026-05-13).
- A5. Microsoft Graph endpoints used by Planner connector behave per `learn.microsoft.com` v1.0 docs (no preview-only required endpoints).
- A6. P1 ships Planner as alpha quality (functional but not production-hardened); hardening + dedicated QA is P2 scope.

**Constraints (hard).**

- C1. Deadline 2026-05-29 (Fri) is hard. The Friday demo is the gating event.
- C2. Headcount fixed at 4.0 FTE — no late hires inside P1.
- C3. Dev docker compose only — no staging URL, no AWS resources.
- C4. Multi-tenant from day one — every persisted row carries `tenant_id`; every tenant-data table has RLS; cross-tenant leak is a release blocker.
- C5. CLAUDE.md working rules apply throughout (no `process.env.X` outside `apps/api/src/env.ts`; OTel init via `--import ./instrumentation.ts`; no `drizzle-kit push` against shared DBs; `z` from `@hono/zod-openapi`; etc.).

#### 1.1.3 Project deliverables

| #  | Deliverable                                                                                                    | Location                                                                              |
| -- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| D1 | Eight new platform packages: `agent-core`, `-memory`, `-workflows`, `-chunking`, `-embeddings`, `-vector`, `-rag`, `-server` | `platform/agent/*`                                                               |
| D2 | MS Graph client + Planner connector (with delta-sync worker + `plan_members` table)                            | `platform/ms-graph`, `modules/connectors/ms365-planner`                               |
| D3 | Three agent product modules: `@seta/planner`, `@seta/analytics`, `@seta/faq`                                   | `modules/products/{planner,analytics,faq}`                                            |
| D4 | Teams channel package (`@seta/ms-teams`)                                                                       | `modules/channels/teams`                                                              |
| D5 | `apps/api` composition (env, instrumentation, main, compose, smoke)                                            | `apps/api/src/{env,instrumentation,main}.ts`, `compose.yml`, `tests/smoke/`           |
| D6 | RAG corpus inventory + structured chunks + ingestion driver                                                    | `docs/corpus/`, `apps/api/data/corpus/`, `apps/api/scripts/rag-ingest.ts`             |
| D7 | Five ADRs (0010 kernel, 0011 workflow MV, 0012 memory, 0013 vector, 0014 corpus)                              | `docs/adr/`                                                                           |
| D8 | Recorded 5-min P1 demo + decision memo                                                                         | `docs/demos/2026-05-29-p1-demo.mp4`, `docs/plans/2026-05-29-p1-outcome.md`            |
| D9 | This SPMP + WBS exported to `Seta Agent - Project Plan.xlsx` + imported to Jira project `SETAOS`              | `docs/plans/Project Plan.md`, Excel template, Jira                                    |

#### 1.1.4 Schedule and budget summary

| Field                              | Value                                                              |
| ---------------------------------- | ------------------------------------------------------------------ |
| P1 Start                           | 2026-05-11 (Mon) — D01                                             |
| P1 End                             | 2026-05-29 (Fri) — D15                                             |
| Working days                       | 15                                                                 |
| Convention                         | 1 BMM = 22 working days (matches Excel template)                   |
| Headcount                          | 4.0 FTE (1.5 AG-S + 1.0 AG-F1 + 1.0 AG-F2 + 0.5 FS)               |
| Committed team capacity            | **81 MD** (≈ 3.68 BMM) over 15 working days                        |
| Demand (planned WBS)               | **79.5 MD**                                                        |
| Utilisation                        | **98%** — 1.5 MD slack                                             |
| Deploy target                      | Dev docker compose only                                            |
| Demo                               | Fri 2026-05-29 14:00 — recorded, internal                          |
| W3 phase split                     | D11–D12 feature wrap · **D13–D15 hardening freeze (no new code)**  |

### 1.2 Evolution of this SPMP

This is v4.0. Predecessors archived in `docs/plans/`:

| Rev   | Date       | Driver                                                                                                            |
| ----- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| v2.7  | 2026-05-04 | Original 7-FTE / 35-day plan.                                                                                     |
| v3.0  | 2026-05-12 | Compression rewrite after team cut to 3.5 FTE / 14 days.                                                          |
| v3.1  | 2026-05-12 | Sponsor reversal re-injected Analytics + FAQ + RAG; demand exceeded supply; opened A/B/C/D options.               |
| **v4.0** | **2026-05-12** | **Sponsor confirms 4.0 FTE (Senior AI +0.5), commits 20% AI uplift, kickoff dated 2026-05-11; option maze removed.** |
| v4.1  | 2026-05-15 | Mid-W1 status update — EP-04 (`agent-chunking`) and EP-05 (`agent-embeddings`) implemented; EP-06 (`agent-vector`) in prep with content-hash dedup folded into the initial schema (see §5.2.5). No WBS estimates or dates changed. |
| v4.2  | 2026-05-15 | EP-01 and EP-02 WBS expanded to reflect implemented scope exceeding original plan: EP-01 gains tasks 1.9 (WM injection/refresh/tools/deep-merge) and 1.10 (per-iteration persistence + `onIterationComplete`); EP-02 gains tasks 2.6 (Thread CRUD, Mastra-compatible) and 2.7 (auto thread title + mid-run save). DoD updated for 1.4, 1.6, 2.1, 2.2. Agent loop now feature-parity with Mastra core (WM refresh per iteration, `onIterationComplete`, `saveIterationMessages`, JSON deep-merge for schema WM). Demand: +4 tasks, +4.0 MD → **87.5 MD total**. |

Revisions to v4 follow change-control per §5.3.2.

---

## §2 References

| #   | Reference                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `CLAUDE.md` — repository working rules, boundaries (CI-enforced), schema-driven contracts, footguns.                                          |
| R2  | `docs/setup.md` §6 — `agent_vector.chunks` schema, pgvector HNSW, iterative_scan correctness fix.                                              |
| R3  | `platform/agent/core/SCOPE.md` — kernel boundary contract.                                                                                    |
| R4  | `platform/agent/memory/SCOPE.md` — memory provider contract.                                                                                  |
| R5  | `platform/agent/workflows/SCOPE.md` — workflow engine surface.                                                                                |
| R6  | `modules/connectors/ms365-planner/SCOPE.md` — Planner connector contract.                                                                     |
| R7  | `docs/adr/0009-build-vs-buy-agent.md` — rejection of Copilot Studio.                                                                          |
| R8  | `docs/plans/MS365 Epics Brainstorm.md` — prior scope brainstorm for MS365 connectors.                                                         |
| R9  | `docs/superpowers/plans/2026-05-11-ms365-auth-implementation.md` — auth wiring already shipped.                                                |
| R10 | `docs/superpowers/specs/2026-05-11-ms365-planner-crud-design.md` — Planner CRUD design.                                                       |
| R11 | IEEE Std 1058-1998 / ISO/IEC/IEEE 16326-2009 — SPMP structure conformance reference.                                                          |
| R12 | Microsoft Graph v1.0 documentation, Planner endpoints (`graph.microsoft.com/v1.0/planner/*`).                                                  |
| R13 | `docs/superpowers/specs/2026-05-13-planner-agent-design.md` — Planner + Analytics Agent detailed design spec (DB-first, permission views, full tool catalog, workflows, Adaptive Cards, test strategy). |

---

## §3 Definitions and acronyms

| Term            | Meaning                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **AG-S**        | Senior AI Engineer role (1.5 FTE in this project: one full-time + one half-time, operating as a single technical-lead pool).      |
| **AG-F1/F2**    | Mid-level AI Engineer roles (1.0 FTE each).                                                                                       |
| **FS**          | Full-stack Engineer role (0.5 FTE).                                                                                               |
| **PM**          | Project Manager — Canh Ta (acting, doubles as AG-S tech lead).                                                                    |
| **MD**          | Man-Day. Equivalent to Person-Day (PD) in prior plans. 1 MD = 1 person × 1 working day.                                           |
| **BMM**         | Billable Man-Month. 1 BMM = 22 working days (matches Excel template convention).                                                  |
| **SP**          | Story Point. 1 SP ≈ 0.5 MD (Fibonacci: 1, 2, 3, 5, 8, 13, 21).                                                                    |
| **WBS**         | Work Breakdown Structure (§5.2.1).                                                                                                |
| **DoD**         | Definition of Done — the acceptance criteria for a task.                                                                          |
| **Tenant**      | The `tenant_id` identifying a customer organisation. Carried in every persisted row; enforced by RLS.                              |
| **OBO**         | On-Behalf-Of token flow (MSAL Node `ConfidentialClientApplication`).                                                              |
| **HNSW**        | Hierarchical Navigable Small World — pgvector ANN index algorithm.                                                                 |
| **iterative_scan** | pgvector parameter required for correct HNSW recall when combined with WHERE filters (RLS); see R2.                            |
| **RAG**         | Retrieval-Augmented Generation. Chunking → embeddings → vector store → similarity retrieve → cite.                                 |
| **SSE**         | Server-Sent Events. Streaming protocol used by the kernel for model output.                                                       |
| **ADR**         | Architecture Decision Record. Numbered file in `docs/adr/`.                                                                       |

---

## §4 Project organization

### 4.1 External interfaces

| Interface                 | Counterpart                | Purpose                                                                                                   | Owner       |
| ------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------- | ----------- |
| Sponsor                   | CEO + CTO (Seta International) | Approves scope, signs off demo, owns budget.                                                          | PM          |
| Microsoft Graph           | Microsoft cloud            | Planner READ/WRITE, Teams messaging, OBO token exchange.                                                  | AG-F2       |
| Microsoft Teams           | Microsoft cloud            | Channel delivery surface, JWT/JWKS verification of inbound activities.                                    | FS          |
| Entra ID (Azure AD)       | Microsoft cloud            | Admin consent, app registration, tenant resolution.                                                       | AG-S (auth) + Seta IT |
| Seta IT                   | Internal                   | Corpus access rights, scope grants on Entra tenants.                                                      | FS (corpus) + AG-S (auth) |
| OpenAI                    | External LLM provider      | LLM completions + embeddings (recorded in fixtures for CI).                                               | AG-S        |
| Jira                      | Atlassian cloud (project `SETAOS`) | Issue tracking — populated from WBS in §5.2.1.                                                  | PM          |
| Excel template            | `~/Desktop/Seta Agent - Project Plan.xlsx` | Sponsor-facing tracking artifact — populated from §1.1.4 + §5.2.                          | PM          |

### 4.2 Internal structure

```
                            Sponsor (CEO + CTO)
                                   │
                                   ▼
                         PM / Tech Lead (Canh Ta)
                                   │
       ┌───────────────────────────┼───────────────────────────┐
       ▼                           ▼                           ▼
   AG-S (1.5)                  AG-F (2.0)                  FS (0.5)
   Kernel · Memory ·           Planner READ/WRITE ·        apps/api wiring ·
   Workflows · Vector ·        Analytics · FAQ ·           Teams skeleton ·
   RAG composition ·           Chunking · Embeddings ·     Corpus survey ·
   Safety review ·             Graph + Planner connector · Smoke harness
   Architecture (ADRs)         JWT verifier
```

No dedicated PM, QA, or DevOps headcount. PM is AG-S doubling. QA is freshers (AG-F1/F2) self-testing per CLAUDE.md TDD rule. DevOps is FS doubling.

### 4.3 Roles and responsibilities

| Role                | Name / Code | FTE | Primary responsibilities                                                                                                                                            | Doubles as     |
| ------------------- | ----------- | --: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Senior AI Engineer  | AG-S        | 1.5 | Kernel (`agent-core`), memory, workflows, `agent-vector` schema + iterative_scan, `agent-rag` composition, safety review, ADRs, code-review gate.                  | PM, Tech Lead  |
| Mid AI Engineer #1  | AG-F1       | 1.0 | Kernel testkit, OpenAI adapter, `agent-chunking`, Planner READ tools, Analytics Agent definition + tools + chart-card, Teams JWT/JWKS verifier.                    | QA self-test   |
| Mid AI Engineer #2  | AG-F2       | 1.0 | MS Graph client, Planner connector (READ + WRITE), `agent-embeddings`, FAQ Agent definition + retrieve/cite tools, fixtures.                                       | QA self-test   |
| Full-stack Engineer | FS          | 0.5 | `apps/api` composition (env, OTel, mount, compose, smoke), Teams channel skeleton + OBO, corpus survey + ingestion driver.                                          | DevOps, Corpus PM |

### 4.4 RACI matrix (per gate)

| Gate                              | R                | A      | C                          | I                       |
| --------------------------------- | ---------------- | ------ | -------------------------- | ----------------------- |
| G1 — Kernel green (D10)            | AG-S, AG-F1      | AG-S   | FS                         | CTO                     |
| G2 — Memory bound (D12)            | AG-S             | AG-S   | FS, Security               | CTO                     |
| G3 — Workflow smoke (D13)          | AG-S             | AG-S   | FS                         | CTO                     |
| G4 — Vector + RLS gate (D14)       | AG-S             | AG-S   | **Security**               | CTO                     |
| G5 — Corpus ready (D10)            | FS               | AG-S   | Seta IT                    | CTO                     |
| G6 — RAG library green (D14)       | AG-S             | AG-S   | AG-F1, AG-F2               | CTO                     |
| G7 — Teams round-trip (D13)        | FS, AG-F1        | AG-S   | AG-F2                      | CTO, Seta IT            |
| G8 — Planner agent E2E (D14)       | AG-F1, AG-F2     | AG-S   | FS                         | CTO                     |
| G9 — Analytics agent E2E (D15)     | AG-F1            | AG-S   | AG-F2                      | CTO                     |
| G10 — FAQ agent E2E + BK-7 (D15)   | AG-F2, AG-S      | AG-S   | FS (corpus)                | CTO                     |
| M1 — P1 Demo (D15 Fri 14:00)       | AG-S, FS         | PM     | All team                   | CEO, CTO, PMO           |

---

## §5 Managerial process plans

### 5.1 Start-up plan

#### 5.1.1 Estimation plan

- Estimates are Fibonacci SP at task granularity (1, 2, 3, 5, 8, 13). Conversion: **1 SP ≈ 0.5 MD**.
- Each estimate is made by the owning role and reviewed by AG-S during D01 kickoff (already in progress).
- Re-estimation is triggered when (a) a task overruns by >50% mid-week, or (b) a gate fails. Re-estimates go through §5.3.2 change control.
- Committed team capacity (§1.1.4) is allocated at the **role supply level** (§5.2.3), not at the task estimate level. Task estimates are written at unassisted-developer granularity; the gap between raw FTE-days and committed capacity is the buffer + W3 hardening reserve.

#### 5.1.2 Staffing plan

Team is confirmed in §4.3. No onboarding inside P1 — all four are already familiar with the repo (Epic-1 shipped together). FTE allocations are flat across the 15 days. No PTO booked.

#### 5.1.3 Resource acquisition plan

| Resource                                   | Acquired by | Status (D02)         |
| ------------------------------------------ | ----------- | -------------------- |
| Local docker compose (pg+pgvector+jaeger)  | FS          | Existing, D02 audit  |
| Microsoft Graph dev tenant + admin consent | AG-S        | Existing from Epic-1 |
| OpenAI API key (recorded fixtures only)    | AG-S        | Existing             |
| Corpus access (Seta knowledge base)        | FS + Seta IT | **Gate G5 — D10**   |
| Jira project `SETAOS`                      | PM          | D02 — to be created  |
| Excel template (`Seta Agent - Project Plan.xlsx`) | PM   | Exists at `~/Desktop/` |

#### 5.1.4 Project staff training plan

No formal training in P1. AG-S is responsible for spreading ADR-level knowledge to AG-F1/F2 via the daily 15-min sync and ADR write-ups (ADR 0010-0014). FS receives a 30-min walkthrough on the kernel-streaming contract on D04 once AG-S commits ADR-0010.

### 5.2 Work plan

#### 5.2.1 Work breakdown structure

15 epics → 72 tasks. WBS table below uses the same column shape as the Excel template Sheet 2 (`WBS`), so export = copy-paste. Jira import = CSV of the same columns.

**Column meanings.** `WBS ID` — hierarchical (Epic.Task). `Phase` — fixed value `P1` (no sub-phases this release). `Feature Area` — code area or capability. `Role` — primary owner (multi-owner tasks list secondary in parentheses). `Priority` — P0 (release blocker), P1 (release-quality), P2 (nice-to-have). `Deps` — predecessor WBS IDs (`—` = no predecessor; can start D01). `Start` / `End` — working-day index (D01..D15) with ISO date. `Est (MD)` — planned man-days. `DoD / AC` — Definition of Done / Acceptance Criteria (becomes Jira description).

##### EP-01 · `@seta/agent-core` kernel (AG-S + AG-F1, 10 MD, P0)

| WBS ID | Phase | Feature Area | Task Name                                                                            | Role  | Pri | Deps     | Start          | End            | Est (MD) | DoD / Acceptance Criteria                                                                                                          |
| ------ | ----- | ------------ | ------------------------------------------------------------------------------------ | ----- | --- | -------- | -------------- | -------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1.1    | P1    | Kernel       | Scaffold `platform/agent/core` via `pnpm new:package`; commit ADR-0010 stub.         | AG-S  | P0  | —        | D01 2026-05-11 | D01 2026-05-11 |      0.5 | Package builds; `pnpm typecheck` green; `docs/adr/0010-kernel-boundary.md` exists.                                                 |
| 1.2    | P1    | Kernel       | `ModelAdapter` interface (`generate`, `stream`) — vendor-neutral.                    | AG-S  | P0  | 1.1      | D02 2026-05-12 | D02 2026-05-12 |      1.0 | `src/model.ts` exports `ModelAdapter`; unit test instantiates a fake adapter.                                                       |
| 1.3    | P1    | Kernel       | `ModelStream<T>` + `KernelChunk` types (text / tool-call / done / error).            | AG-S  | P0  | 1.2      | D03 2026-05-13 | D03 2026-05-13 |      1.0 | `src/stream.ts` exports `ModelStream<T>`; type-only unit tests pass.                                                                |
| 1.4    | P1    | Kernel       | Run loop core: turn → tool-call → tool-result → next-turn loop with `AbortSignal`, processors, and stop conditions.   | AG-S  | P0  | 1.3      | D04 2026-05-14 | D05 2026-05-15 |      2.0 | `run()` / `runToolLoop()` execute multi-turn tool-call loop; `processInput` runs once pre-loop; `processOutputStep` runs after each model step and each tool step; `processAPIError` drives retry/rethrow in fallback; `stopWhen` predicate (array or single) evaluated after each iteration's tool steps; `onIterationComplete(accumulatedSteps)` called after each iteration; `toolCallConcurrency` semaphore respected; `maxSteps` (default 16) enforced; OTel `agent.run.loop` span carries `loop.stop_reason` + `loop.iterations`; abort propagates within 100 ms; unit + integration tests green. |
| 1.5    | P1    | Kernel       | `streamKernelSSE(c, run)` Hono helper (wires onAbort, keep-alive, error handler).    | AG-S  | P0  | 1.4      | D06 2026-05-18 | D06 2026-05-18 |      1.0 | Hono SSE response observable in browser; keep-alive every 15 s; abort cleanly disconnects.                                          |
| 1.6    | P1    | Kernel       | Tool execution adapter: concurrency, budget, timeout, approval, suspend guard.       | AG-S  | P0  | 1.4      | D07 2026-05-19 | D08 2026-05-20 |      1.5 | Parallel tool execution via semaphore (`toolCallConcurrency`, default 10); `perToolBudget.maxCalls` per tool ID enforced with `TOOL_BUDGET_EXCEEDED` error; `perToolBudget.timeoutMs` races via `AbortSignal.any([ctx.signal, AbortSignal.timeout(ms)])` with `TOOL_TIMEOUT` error; `requireApproval: true` annotation forces serial execution (concurrency → 1); tool returning `{ suspend: ... }` object raises `TOOL_SUSPEND_NOT_SUPPORTED` error; OTel span per tool call carries `tool.timed_out` + `tool.budget_exceeded` attributes; unit tests cover each error path. |
| 1.7    | P1    | Kernel       | OpenAI `ModelAdapter` implementation (gpt-4o-mini default).                          | AG-F1 | P0  | 1.2      | D03 2026-05-13 | D04 2026-05-14 |      1.5 | Adapter passes `runKernel` test against a recorded OpenAI fixture (no live calls).                                                 |
| 1.8    | P1    | Kernel       | `@seta/agent-core/testkit`: `setupLLMRecording({name})` via msw.                     | AG-F1 | P0  | 1.4      | D05 2026-05-15 | D06 2026-05-18 |      1.5 | `RECORD=1 pnpm vitest run -t kernel` captures; replay works without `RECORD=1`. Unit + integration green.                            |
| 1.9    | P1    | Kernel-WM    | Working memory: inject, refresh between iterations, tools, deep-merge semantics.     | AG-S  | P0  | 1.4, 2.2 | D05 2026-05-15 | D07 2026-05-19 |      1.5 | `buildWorkingMemoryMessages` reads WM from DB and injects as first system message before loop; `buildWorkingMemoryTools` auto-injects `updateWorkingMemory` tool (plain replace for markdown/text WM; `deepMergeWorkingMemory` JSON deep-merge for schema-based WM — null deletes key, array replaces entirely, objects merge recursively); `filterWorkingMemoryToolMessages` strips WM `tool_use` + `tool_result` pairs before `saveTurn`; `refreshWorkingMemoryMessages` callback re-reads WM from DB after each iteration's tool steps — passed via `ToolLoopArgs`, replaces first `workingMemoryMsgCount` messages; three instruction modes: v1 (full replace), vnext (minimal update), readOnly; `WorkingMemoryConfig.scope` (`thread` | `resource`); unit tests: inject, refresh, filter, deep-merge. |
| 1.10   | P1    | Kernel-WM    | Per-iteration persistence callback + `onIterationComplete` hook.                     | AG-S  | P0  | 1.9      | D07 2026-05-19 | D08 2026-05-20 |      0.5 | `saveIterationMessages(msgs)` callback in `ToolLoopArgs` invoked after each iteration's tool steps — saves `addedMessages.slice(persistedCount)` (new assistant + tool messages only, WM tool calls filtered out); `persistedCount` advances after each save; `onIterationComplete(accumulatedSteps)` called after `saveIterationMessages`, before `stopWhen` check; final `saveTurn` in `run.ts` saves full turn (user input + all added) idempotently; unit test: `saveTurn` called per-iteration + once final; `onIterationComplete` receives correct accumulated steps at each call. |

##### EP-02 · `@seta/agent-memory` (AG-S, 4 MD, P0)

| WBS ID | Phase | Feature Area | Task Name                                                                            | Role  | Pri | Deps      | Start          | End            | Est (MD) | DoD / Acceptance Criteria                                                                                                          |
| ------ | ----- | ------------ | ------------------------------------------------------------------------------------ | ----- | --- | --------- | -------------- | -------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| 2.1    | P1    | Memory       | Drizzle schema (`agent_memory.threads`, `.messages`, `.resources`) + RLS + migration. | AG-S  | P0  | —         | D02 2026-05-12 | D02 2026-05-12 |      1.0 | Three tables: `threads` (id uuid PK, tenant_id, resource_id text nullable, title, metadata jsonb, message_count, created_at, updated_at); `messages` (id uuid PK, thread_id, tenant_id, resource_id, role, content jsonb, tool_call_id, created_at); `resources` (id=userId text PK, tenant_id, working_memory text ≤8192, metadata jsonb, created_at, updated_at). All three `FORCE ROW LEVEL SECURITY`; `pgPolicy` on `tenant_id`. Migration generated via `drizzle-kit generate`; integration test asserts two tenants see disjoint rows. |
| 2.2    | P1    | Memory       | `MemoryProvider` impl: `recall`, `saveTurn`, `getWorkingMemory`, `updateWorkingMemory`. | AG-S  | P0  | 2.1, 1.3  | D11 2026-05-25 | D12 2026-05-26 |      1.5 | Four-method `MemoryProvider` interface: `recall(ctx)` — fetches last `recallPageSize` (default 40) messages, trims to `recallTokenBudget` (default 4000 tokens) oldest-first; `saveTurn(ctx, msgs)` — `ensureThread` (ON CONFLICT DO NOTHING) + `saveMessages` (ON CONFLICT id DO NOTHING, idempotent); `getWorkingMemory(ctx)` — reads from `resources.working_memory` (scope=resource) or `threads.working_memory` (scope=thread); `updateWorkingMemory(ctx, text)` — upserts WM, enforces ≤8192 byte cap (raises `WorkingMemoryTooLargeError`). Audit rows written for all four ops via `recordAudit`. RLS enforced via `withTenant` on every query. Integration tests: save → recall round-trip; WM set → get; two-tenant isolation; audit row present. |
| 2.3    | P1    | Memory       | Bind real provider in `apps/api/src/main.ts` (replaces in-memory stub).              | AG-S  | P0  | 2.2, 14.3 | D12 2026-05-26 | D12 2026-05-26 |      0.5 | Curl against `/agent/run` returns turn N; next request observes turn N-1 in recall.                                                |
| 2.4    | P1    | Memory       | ADR-0012 (memory home, RLS posture, multi-turn semantics).                           | AG-S  | P0  | 2.1       | D13 2026-05-27 | D13 2026-05-27 |      0.5 | ADR committed; reviewed by FS (architecture backup).                                                                               |
| 2.5    | P1    | Memory       | Tenant-isolation correctness fixture (cross-tenant leak test).                       | AG-S  | P0  | 2.2       | D13 2026-05-27 | D13 2026-05-27 |      0.5 | Test: two tenants insert turns; each sees only its own; `SET LOCAL app.tenant_id` enforced.                                          |
| 2.6    | P1    | Memory       | Thread CRUD: `createThread`, `getThreadById`, `listThreads`, `saveThread`, `updateThread`, `deleteThread`. | AG-S  | P0  | 2.1       | D09 2026-05-21 | D11 2026-05-25 |      1.5 | All six functions in `platform/agent/memory/src/thread-crud.ts`; exposed on `AgentMemoryProvider` with overloads matching Mastra's API contract: `listThreads` supports 0-indexed `page`, `perPage: number \| false`, `filter.resourceId`, `filter.metadata` (JSON containment `@>`); `createThread` requires `resourceId`; `saveThread` accepts both `SaveThreadInput` and `{ thread: SaveThreadInput }` (Mastra `saveThread({ thread })` pattern); `updateThread` replace semantics (both `title: string` and `metadata: {}` required — no partial patch); `deleteThread` cascades to messages; integration tests: list filter by resourceId + metadata, create + get round-trip, updateThread replace, deleteThread cascade. |
| 2.7    | P1    | Memory       | Auto thread title (`extractAutoTitle`) + mid-run per-iteration save.                 | AG-S  | P0  | 2.6, 1.10 | D11 2026-05-25 | D11 2026-05-25 |      0.5 | `extractAutoTitle(msgs)` finds first `role: user` text part, truncates to 80 chars (appends `…` if longer); passed to `ensureThread` inside `saveTurn` — only set on first insert (ON CONFLICT DO NOTHING); per-iteration save: `run.ts` passes `saveIterationMessages` callback to `runToolLoop`, which calls `saveTurn(memCtx, filtered)` with `addedMessages.slice(persistedCount)` after each iteration; final `saveTurn` saves full turn (user + all messages) idempotently; integration test: two-step run → `saveTurn` called twice; thread title matches first user message. |

##### EP-03 · `@seta/agent-workflows` (AG-S, 4 MD, P0)

| WBS ID | Phase | Feature Area | Task Name                                                                            | Role  | Pri | Deps     | Start          | End            | Est (MD) | DoD / Acceptance Criteria                                                                                                          |
| ------ | ----- | ------------ | ------------------------------------------------------------------------------------ | ----- | --- | -------- | -------------- | -------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| 3.1    | P1    | Workflows    | Drizzle schema (`agent_workflows.runs`, `agent_workflows.steps`) + migration.        | AG-S  | P0  | —        | D08 2026-05-20 | D08 2026-05-20 |      0.5 | Migration green; schema published in `platform/db` OWNER_ORDER.                                                                    |
| 3.2    | P1    | Workflows    | DSL: `workflow(name).then(stepA).parallel([stepB, stepC]).build()`.                  | AG-S  | P0  | 3.1      | D09 2026-05-21 | D09 2026-05-21 |      1.5 | DSL compiles to a typed plan; round-trip JSON-serialisable; unit test covers each combinator.                                       |
| 3.3    | P1    | Workflows    | Advisory-lock suspend/resume engine.                                                 | AG-S  | P0  | 3.2      | D10 2026-05-22 | D10 2026-05-22 |      1.0 | Two concurrent resumes of the same run → one proceeds, one blocks then re-enters; integration test green.                          |
| 3.4    | P1    | Workflows    | Integration test: `.then(a).parallel([b,c])` resumes idempotently after kill -9.     | AG-S  | P0  | 3.3      | D13 2026-05-27 | D13 2026-05-27 |      0.5 | Killed-mid-run resume produces identical output to clean run.                                                                       |
| 3.5    | P1    | Workflows    | ADR-0011 (workflow MV surface, `.parallel` semantics, suspend snapshot).             | AG-S  | P0  | 3.2      | D13 2026-05-27 | D13 2026-05-27 |      0.5 | ADR committed; reviewed by FS.                                                                                                     |

##### EP-04 · `@seta/agent-chunking` (AG-F1, 2 MD, P0)

| WBS ID | Phase | Feature Area | Task Name                                                                            | Role  | Pri | Deps     | Start          | End            | Est (MD) | DoD / Acceptance Criteria                                                                                                          |
| ------ | ----- | ------------ | ------------------------------------------------------------------------------------ | ----- | --- | -------- | -------------- | -------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| 4.1    | P1    | RAG-Chunking | Scaffold `platform/agent/chunking`; export `Chunk` type + `ChunkStrategy`.            | AG-F1 | P0  | —        | D04 2026-05-14 | D04 2026-05-14 |      0.5 | Package builds; types exported; ADR-0014 stub for corpus structure committed (joint with FS).                                       |
| 4.2    | P1    | RAG-Chunking | Three strategies: markdown (heading-aware), code (semantic), fixed (token-window).   | AG-F1 | P0  | 4.1      | D07 2026-05-19 | D07 2026-05-19 |      1.0 | Each strategy passes a golden fixture; markdown preserves heading path in chunk metadata.                                          |
| 4.3    | P1    | RAG-Chunking | Unit tests + golden fixtures (5 sample documents).                                   | AG-F1 | P0  | 4.2      | D08 2026-05-20 | D08 2026-05-20 |      0.5 | All 5 golden fixtures stable; chunk counts deterministic.                                                                          |

##### EP-05 · `@seta/agent-embeddings` (AG-F2, 2 MD, P0)

| WBS ID | Phase | Feature Area | Task Name                                                                            | Role  | Pri | Deps     | Start          | End            | Est (MD) | DoD / Acceptance Criteria                                                                                                          |
| ------ | ----- | ------------ | ------------------------------------------------------------------------------------ | ----- | --- | -------- | -------------- | -------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| 5.1    | P1    | RAG-Embed    | Scaffold `platform/agent/embeddings`; export `EmbeddingProvider` interface.          | AG-F2 | P0  | —        | D06 2026-05-18 | D06 2026-05-18 |      0.5 | Package builds; provider abstraction allows OpenAI swap.                                                                           |
| 5.2    | P1    | RAG-Embed    | OpenAI embeddings adapter (text-embedding-3-small).                                  | AG-F2 | P0  | 5.1      | D07 2026-05-19 | D07 2026-05-19 |      1.0 | Adapter produces 1536-dim vectors; cost per call logged via OTel span.                                                              |
| 5.3    | P1    | RAG-Embed    | msw record/replay fixtures for embedding calls.                                      | AG-F2 | P0  | 5.2      | D08 2026-05-20 | D08 2026-05-20 |      0.5 | Recorded fixtures replay deterministically; CI green without live OpenAI.                                                          |

##### EP-06 · `@seta/agent-vector` (AG-S, 4 MD, P0)

| WBS ID | Phase | Feature Area | Task Name                                                                            | Role  | Pri | Deps     | Start          | End            | Est (MD) | DoD / Acceptance Criteria                                                                                                          |
| ------ | ----- | ------------ | ------------------------------------------------------------------------------------ | ----- | --- | -------- | -------------- | -------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| 6.1    | P1    | RAG-Vector   | `agent_vector.chunks` schema + RLS policy + ADR-0013 (per `setup.md §6`).             | AG-S  | P0  | —        | D03 2026-05-13 | D03 2026-05-13 |      1.0 | Schema matches `setup.md §6`; RLS on `tenant_id`; ADR committed.                                                                   |
| 6.2    | P1    | RAG-Vector   | Drizzle migration + pgvector HNSW index (`m=16, ef_construction=64`).                | AG-S  | P0  | 6.1      | D08 2026-05-20 | D08 2026-05-20 |      0.5 | Migration applies cleanly; HNSW index visible in `\d+ agent_vector.chunks`.                                                        |
| 6.3    | P1    | RAG-Vector   | Upsert API + similarity query API (`searchSimilar({tenantId, vec, k})`).             | AG-S  | P0  | 6.2      | D09 2026-05-21 | D09 2026-05-21 |      1.0 | API accepts batched upserts; query returns top-k with distance.                                                                    |
| 6.4    | P1    | RAG-Vector   | iterative_scan correctness gate test (per `setup.md §6`).                            | AG-S  | P0  | 6.3      | D09 2026-05-21 | D09 2026-05-21 |      1.0 | Test fails without `SET LOCAL hnsw.iterative_scan = strict_order`; passes with it. **CI gate.**                                    |
| 6.5    | P1    | RAG-Vector   | Per-tenant isolation fixture (two tenants, identical query, disjoint results).       | AG-S  | P0  | 6.3      | D09 2026-05-21 | D09 2026-05-21 |      0.5 | Both tenants insert; query as tenant A returns A-only chunks; same for B; assert disjoint IDs.                                      |

##### EP-07 · `@seta/agent-rag` (AG-S, 3 MD, P0)

| WBS ID | Phase | Feature Area | Task Name                                                                            | Role  | Pri | Deps          | Start          | End            | Est (MD) | DoD / Acceptance Criteria                                                                                                     |
| ------ | ----- | ------------ | ------------------------------------------------------------------------------------ | ----- | --- | ------------- | -------------- | -------------- | -------: | ----------------------------------------------------------------------------------------------------------------------------- |
| 7.1    | P1    | RAG-Compose  | `retrieve(query, {tenantId, k})` composes chunking + embeddings + vector.            | AG-S  | P0  | 4.2, 5.2, 6.3 | D10 2026-05-22 | D10 2026-05-22 |      1.0 | Library returns `Chunk[]` ordered by similarity, with source metadata.                                                        |
| 7.2    | P1    | RAG-Compose  | Citation provenance: each chunk carries `(source_id, char_range, score)`.            | AG-S  | P0  | 7.1           | D11 2026-05-25 | D11 2026-05-25 |      1.0 | Citation format documented in ADR-0014; FAQ tool consumes it; integration test asserts shape.                                  |
| 7.3    | P1    | RAG-Compose  | Library-level tests with fixtures (no product wiring required).                      | AG-S  | P0  | 7.2           | D12 2026-05-26 | D12 2026-05-26 |      1.0 | 3 fixture queries return expected top-1 chunk by ID; multi-tenant separation holds.                                            |

##### EP-08 · Corpus survey + ingestion (FS + AG-F PT, 4 MD, P0)

| WBS ID | Phase | Feature Area | Task Name                                                                                              | Role          | Pri | Deps      | Start          | End            | Est (MD) | DoD / Acceptance Criteria                                                                                                  |
| ------ | ----- | ------------ | ------------------------------------------------------------------------------------------------------ | ------------- | --- | --------- | -------------- | -------------- | -------: | -------------------------------------------------------------------------------------------------------------------------- |
| 8.1    | P1    | Corpus       | Corpus source inventory (URLs, file paths, owners, licensing/access status).                           | FS            | P0  | —         | D01 2026-05-11 | D03 2026-05-13 |      1.0 | `docs/corpus/inventory.md` lists ≥10 candidate sources; ≥5 marked "access OK". **Gate G5 hard deadline: EOD D03.**         |
| 8.2    | P1    | Corpus       | Curation: convert ≥5 sources to canonical markdown under `apps/api/data/corpus/`.                      | FS            | P0  | 8.1       | D06 2026-05-18 | D08 2026-05-20 |      1.5 | ≥5 markdown documents committed; ADR-0014 (corpus structure) finalised jointly with AG-F1.                                  |
| 8.3    | P1    | Corpus       | Ingestion driver: `apps/api/scripts/rag-ingest.ts` — chunk → embed → upsert (uses EP-04/05/06).         | FS            | P0  | 8.2, 7.1  | D11 2026-05-25 | D12 2026-05-26 |      1.0 | `pnpm rag:ingest --subset` runs end-to-end; vector store fills; idempotent on re-run.                                       |
| 8.4    | P1    | Corpus       | Full corpus subset ingestion + spot-check 5 sample queries.                                            | AG-F (PT)     | P0  | 8.3       | D13 2026-05-27 | D13 2026-05-27 |      0.5 | All curated docs ingested without error; 5 sample queries return top-1 chunk from the expected source.                       |

##### EP-09 · MS Graph + Planner connector (AG-F2, 9 MD, P0)

| WBS ID | Phase | Feature Area | Task Name                                                                            | Role  | Pri | Deps     | Start          | End            | Est (MD) | DoD / Acceptance Criteria                                                                                                          |
| ------ | ----- | ------------ | ------------------------------------------------------------------------------------ | ----- | --- | -------- | -------------- | -------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| 9.1    | P1    | MS-Graph     | Graph HTTP client: auth header, pagination, retry with backoff, OBO token cache.     | AG-F2 | P0  | —        | D01 2026-05-11 | D02 2026-05-12 |      2.0 | Client passes integration test against MS Graph dev tenant; OBO refresh via MSAL works; OTel spans emitted.                          |
| 9.2    | P1    | Planner-Conn | Drizzle schema (`connector_ms365_planner.*`) + migration + `ConnectorDefinition`; adds `plan_members` table + `delta_token` column on `sync_watermarks`. | AG-F2 | P0  | 9.1      | D03 2026-05-13 | D03 2026-05-13 |      1.0 | Schema applied via `pnpm migrate`; `plan_members` table has RLS policy on `tenant_id`; `delta_token text` added to `sync_watermarks` via `drizzle-kit generate`; manifest exports `requiredScopes` for admin consent. |
| 9.3    | P1    | Planner-Conn | Drizzle schema exports + cache infrastructure for DB-first reads (`createPlannerClient`, `createPlannerCache`, `createEtagStore`). | AG-F2 | P0  | 9.1, 9.2 | D04 2026-05-14 | D05 2026-05-15 |      2.0 | `createPlannerCache`, `createPlannerClient`, `createEtagStore` factories tested with msw fixtures; typed Drizzle table types exported from connector package; full plan-task list sync handles pagination (>100 items). |
| 9.4    | P1    | Planner-Conn | WRITE endpoints: `createTask`, `updateTask`, `closeTask` with etag.                  | AG-F2 | P0  | 9.3      | D06 2026-05-18 | D07 2026-05-19 |      2.0 | Each endpoint round-trips against dev tenant; etag conflict surfaces typed error.                                                  |
| 9.5    | P1    | Planner-Conn | Etag cache (per-tenant LRU, Redis-ready shape) + read-through pattern.               | AG-F2 | P0  | 9.4      | D08 2026-05-20 | D08 2026-05-20 |      1.0 | Cache hit avoids upstream call; etag mismatch invalidates and refetches.                                                            |
| 9.6    | P1    | Planner-Conn | msw fixtures + recorded scenarios for READ/WRITE happy paths and 3 error cases.       | AG-F2 | P0  | 9.3      | D09 2026-05-21 | D09 2026-05-21 |      1.0 | Fixtures replay deterministically; CI green without dev tenant.                                                                    |
| 9.7    | P1    | Planner-Conn | `createPlannerSyncWorker`: delta-poll background worker — plans, tasks/delta, `plan_members` per tenant; `afterSync` hook triggers embedding + materialized view refresh. | AG-F2 | P0  | 9.2      | D09 2026-05-21 | D10 2026-05-22 |      2.0 | `syncTenant()` test: msw Graph fixtures → `planner_tasks_cache`, `planner_plans_cache`, `plan_members` populated correctly; delta token stored in `sync_watermarks.delta_token`; `afterSync` called with changed task IDs; `worker.start()` / `worker.stop()` lifecycle green. |

##### EP-10 · Planner Agent product (alpha) (AG-F1 + AG-S, 16 MD, P0)

| WBS ID | Phase | Feature Area | Task Name                                                                            | Role            | Pri | Deps        | Start          | End            | Est (MD) | DoD / Acceptance Criteria                                                                                                          |
| ------ | ----- | ------------ | ------------------------------------------------------------------------------------ | --------------- | --- | ----------- | -------------- | -------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| 10.1   | P1    | Planner-Agt  | Agent profile seed + Planner system prompt + tool registry.                          | AG-F1           | P0  | 1.2         | D06 2026-05-18 | D06 2026-05-18 |      1.0 | `PLANNER_PROFILE_SEED` constant at `modules/products/planner/src/seeds/planner.ts` seeded into `agent.agent_profiles` via `seedAgentProfiles()` at boot; system prompt covers: role/capabilities, EN/VN/EN-VN bilingual detection, tool-selection hints, HITL write flow (preview → confirm before commit), scope-denial behaviour, conversation-type + timezone context. |
| 10.2   | P1    | Planner-Agt  | T1 Read tools (DB-first): `list_my_tasks`, `list_plan_tasks`, `get_task`, `list_plans`, `list_buckets`, `search_tasks_semantic`. | AG-F1           | P0  | 10.1, 10.7, 9.3  | D06 2026-05-18 | D08 2026-05-20 |      3.0 | All six tools in `modules/products/planner/src/tools/read/` query `planner.v_visible_tasks` or `planner.v_visible_plans`; deps simplified to `{ sql: DbSql }` (no live Graph calls at inference time); `search_tasks_semantic` embeds query via `text-embedding-3-small`, applies `hnsw.iterative_scan = strict_order`, filters vector results through permission view; integration tests assert correct rows for plan-member actor vs denied actor. |
| 10.3   | P1    | Planner-Agt  | WRITE tools — 5 preview/commit pairs: update, create, complete, add-comment, create-plan with HMAC continuation + capacity warning. | AG-F1           | P0  | 10.2, 9.4   | D08 2026-05-20 | D10 2026-05-22 |      2.0 | Each preview: validates plan membership, checks `analytics.mv_assignee_workload` for capacity (>90% open ratio attaches `capacityWarning`), stores HMAC-signed continuation in `planner.write_continuations`. Each commit: validates HMAC, asserts `consumed_at IS NULL`, calls Graph with `If-Match: etag`, upserts into cache immediately. |
| 10.4   | P1    | Planner-Agt  | Safety review of WRITE path: prompt-injection, scope check, RLS, idempotency.        | AG-S            | P0  | 10.3        | D11 2026-05-25 | D11 2026-05-25 |      1.0 | Review checklist completed in ADR-0010 appendix; 3 attack-path tests green.                                                        |
| 10.5   | P1    | Planner-Agt  | Adaptive Cards — READ path: `task-list.ts`, `task-detail.ts`, `workload.ts`, `scope-decline.ts`. | AG-F1           | P0  | 10.2        | D08 2026-05-20 | D09 2026-05-21 |      2.0 | `task-list.ts` renders overdue/today/all badge + inline "Mark Done" action; `task-detail.ts` shows FactSet + 3 action buttons; `workload.ts` shows ColumnSet sorted by open tasks with Attention colour for overloaded rows; `scope-decline.ts` shows denial message + visible-plans FactSet. All four have snapshot tests. |
| 10.6   | P1    | Planner-Agt  | Adaptive Card — `write-preview.ts`: Confirm/Cancel for WRITE + optional `capacityWarning` block + report-workflow Input.Text variant. | AG-F1           | P0  | 10.3        | D11 2026-05-25 | D11 2026-05-25 |      1.0 | Confirm posts continuation token; Cancel discards; `capacityWarning` renders as yellow TextBlock above Confirm; report variant adds Input.Text + Approve button. |
| 10.7   | P1    | Planner-Agt  | Permission views `planner.v_visible_tasks` + `planner.v_visible_plans` — custom migration in `@seta/planner`, intra-tenant ACL via plan membership + manager hierarchy. | AG-F1 (AG-S review) | P0  | 9.2         | D04 2026-05-14 | D05 2026-05-15 |      1.0 | Views created via `drizzle-kit generate --custom --name add-planner-permission-views` in `modules/products/planner/`; integration tests: plan-member sees tasks; non-member sees zero rows; manager sees reports' tasks in plans manager is not a member of; `soft_deleted_at IS NOT NULL` excluded. (Sync worker 9.7 not required — view definition only needs the table schema.) |
| 10.8   | P1    | Planner-Agt  | `analytics.mv_assignee_workload` + `analytics.mv_plan_weekly_velocity` materialized views (owned by `@seta/analytics`) + `TaskIndexer` embedding pipeline (owned by `@seta/planner`). | AG-F1           | P0  | 10.7, 5.2, 6.3 | D09 2026-05-21 | D10 2026-05-22 |      1.5 | Materialized views defined in `modules/products/analytics/src/schema.ts` with unique indexes (for `REFRESH CONCURRENTLY`); refreshed via `afterSync` hook in `apps/api`; `TaskIndexer.indexTasks()` in `@seta/planner` upserts into `agent_vector.chunks` with `type: 'planner_task'` metadata; integration test: sync → refresh → `workload_by_assignee` returns correct open/overdue counts. |
| 10.9   | P1    | Planner-Agt  | T2 tools: `query_analytics` DSL, `get_project_status`, `get_one_on_one_prep`.        | AG-F1           | P1  | 10.2, 10.8  | D11 2026-05-25 | D12 2026-05-26 |      2.0 | `query_analytics` compiles each metric+scope to parameterised SQL with no raw user input; `get_project_status` returns 5-category breakdown (completed/in-progress/blocked/upcoming/unassigned) via parallel queries; `get_one_on_one_prep` gates on `manager_id` check; integration tests green for each. |
| 10.10  | P1    | Planner-Agt  | `bulkUpdateWorkflow` + `generateReportWorkflow` using `@seta/agent-workflows` suspend/resume. | AG-F1 (AG-S review) | P1  | 10.3, 3.3   | D12 2026-05-26 | D13 2026-05-27 |      1.5 | Bulk update: 3-task fixture → suspend at preview → resume with confirm → 3 Graph writes (msw) → DB upserted. Report: gather → draft → suspend at review → resume with edits → final card contains edit text. One audit row per completed write linked to `run_id`. |

##### EP-11 · Analytics Agent (AG-F1 + AG-S, 5 MD, P1)

| WBS ID | Phase | Feature Area | Task Name                                                                            | Role            | Pri | Deps        | Start          | End            | Est (MD) | DoD / Acceptance Criteria                                                                                                          |
| ------ | ----- | ------------ | ------------------------------------------------------------------------------------ | --------------- | --- | ----------- | -------------- | -------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| 11.1   | P1    | Analytics    | Analytics Agent profile seed + system prompt + tool registry.                        | AG-F1           | P1  | 1.2         | D11 2026-05-25 | D11 2026-05-25 |      1.0 | `ANALYTICS_PROFILE_SEED` constant at `modules/products/analytics/src/seeds/analytics.ts` seeded into `agent.agent_profiles` via `seedAgentProfiles()` at boot; system prompt instructs agent to always respond with a `chart-ybar` card (never a text table) for data queries; read-only (no write tools registered). |
| 11.2   | P1    | Analytics    | Aggregation tools: `workload_by_assignee`, `tasks_by_status`, `tasks_by_plan`.        | AG-F1           | P1  | 11.1, 10.8  | D12 2026-05-26 | D13 2026-05-27 |      2.0 | Each tool in `modules/products/analytics/src/tools/` queries `analytics.mv_assignee_workload`; permission enforced via `connector_ms365_planner.plan_members` directly (cross-product import of `planner.*` is forbidden per CLAUDE.md); left-joins `directory_users` for display names; returns aggregated counts grouped per dimension; no live Graph calls. |
| 11.3   | P1    | Analytics    | `chart-ybar.ts` — Adaptive Card v1.5 `Chart.VerticalBar` element (Teams-native renderer), bar chart only for P1. | AG-F1           | P1  | 11.2        | D14 2026-05-28 | D14 2026-05-28 |      1.0 | `chartYBarCard()` outputs a v1.5 Adaptive Card with `type: 'Chart.VerticalBar'`; snapshot test covers 0-length series and 5-row series; card renders in Teams desktop dev tunnel (fallback to `workload.ts` text table if `Chart.VerticalBar` unsupported — see spec OQ-6). |
| 11.4   | P1    | Analytics    | AG-S review + integration smoke (Teams query → chart card).                          | AG-S            | P1  | 11.3        | D15 2026-05-29 | D15 2026-05-29 |      1.0 | Live demo query "who is overloaded this week?" → `workload_by_assignee` → `chartYBarCard` rendered in Teams; reviewed for prompt-injection surface. |

##### EP-12 · Seta FAQ Agent (AG-F2 + AG-S, 5 MD, P0)

| WBS ID | Phase | Feature Area | Task Name                                                                            | Role            | Pri | Deps              | Start          | End            | Est (MD) | DoD / Acceptance Criteria                                                                                                          |
| ------ | ----- | ------------ | ------------------------------------------------------------------------------------ | --------------- | --- | ----------------- | -------------- | -------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| 12.1   | P1    | FAQ          | Agent definition + FAQ system prompt (cite-or-decline).                              | AG-F2           | P0  | 1.2               | D11 2026-05-25 | D11 2026-05-25 |      1.0 | Agent loadable into kernel; system prompt enforces "decline if no citation".                                                       |
| 12.2   | P1    | FAQ          | `retrieve` tool (uses `@seta/agent-rag`).                                             | AG-F2           | P0  | 12.1, 7.1         | D12 2026-05-26 | D12 2026-05-26 |      1.0 | Tool returns top-k chunks with `source_id` + score; tenant scoping verified.                                                       |
| 12.3   | P1    | FAQ          | `cite` tool: format citations inline in agent response with expandable source chunk. | AG-F2           | P0  | 12.2              | D13 2026-05-27 | D13 2026-05-27 |      1.0 | Adaptive Card renders citations as expandable section; click reveals source chunk text.                                            |
| 12.4   | P1    | FAQ          | BK-7 citation-rate eval on demo question set (10 questions, ≥8 must have citations). | AG-S            | P0  | 12.3, 8.4         | D14 2026-05-28 | D14 2026-05-28 |      1.0 | Eval report committed to `docs/eval/2026-05-28-faq-citation-rate.md`; ≥80% cited.                                                  |
| 12.5   | P1    | FAQ          | RAG-3 wire into FAQ Agent runtime + per-tenant fixture test.                         | AG-S            | P0  | 12.3              | D15 2026-05-29 | D15 2026-05-29 |      1.0 | End-to-end test: Teams message → FAQ agent → retrieve → cite → card render; multi-tenant isolation asserted.                       |

##### EP-13 · Teams channel (FS + AG-F1, 4.5 MD, P0)

| WBS ID | Phase | Feature Area | Task Name                                                                            | Role            | Pri | Deps              | Start          | End            | Est (MD) | DoD / Acceptance Criteria                                                                                                          |
| ------ | ----- | ------------ | ------------------------------------------------------------------------------------ | --------------- | --- | ----------------- | -------------- | -------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| 13.1   | P1    | Teams-Ch     | Scaffold `modules/channels/teams` + bot manifest.                                    | FS              | P0  | —                 | D01 2026-05-11 | D01 2026-05-11 |      0.5 | Manifest uploads to Teams dev tunnel; bot reachable via ngrok URL.                                                                  |
| 13.2   | P1    | Teams-Ch     | Bot-token-only reply skeleton (echo handler).                                        | FS              | P0  | 13.1              | D02 2026-05-12 | D02 2026-05-12 |      0.5 | "ping" → "pong" in Teams; OTel span captures roundtrip.                                                                            |
| 13.3   | P1    | Teams-Ch     | JWT/JWKS verifier for inbound activities.                                            | AG-F1           | P0  | 13.2              | D06 2026-05-18 | D07 2026-05-19 |      1.5 | Invalid JWT rejected with 401; valid token passes; JWKS cached with TTL.                                                            |
| 13.4   | P1    | Teams-Ch     | OBO token refresh on user-context calls (via MSAL).                                  | FS              | P0  | 13.3              | D08 2026-05-20 | D09 2026-05-21 |      1.0 | Expired OBO refreshed via stored refresh token; single-flight via `SELECT … FOR UPDATE` on `oauth.oauth_tokens`.                  |
| 13.5   | P1    | Teams-Ch     | `TeamsHandler` trigger-phrase routing: dispatches to Planner / Analytics / FAQ agents via `@seta/agent-server` run pipeline. | FS              | P0  | 13.4, 10.5        | D10 2026-05-22 | D10 2026-05-22 |      0.5 | `selectSlug(text)` routes `analytics:`/`chart`/`velocity` → 'analytics'; `faq:`/`policy` → 'faq'; default → 'planner'; "summarize my tasks" → Planner agent → task list card in Teams; each slug resolves profile from `agent.agent_profiles` via `resolveAgentProfile()`. |
| 13.6   | P1    | Teams-Ch     | Live smoke: round-trip in dev tunnel (assert chunked SSE → card render).             | FS              | P0  | 13.5              | D13 2026-05-27 | D13 2026-05-27 |      0.5 | Live Teams message produces streaming response that lands as a task-list card.                                                     |

##### EP-14 · `apps/api` composition (FS, 3 MD, P0)

| WBS ID | Phase | Feature Area | Task Name                                                                            | Role            | Pri | Deps              | Start          | End            | Est (MD) | DoD / Acceptance Criteria                                                                                                          |
| ------ | ----- | ------------ | ------------------------------------------------------------------------------------ | --------------- | --- | ----------------- | -------------- | -------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| 14.1   | P1    | apps/api     | Typed env via Zod in `apps/api/src/env.ts` (boot-time validation).                   | FS              | P0  | —                 | D01 2026-05-11 | D01 2026-05-11 |      0.5 | Missing required env vars fail boot; no `process.env.X` elsewhere (CI guard).                                                      |
| 14.2   | P1    | apps/api     | `instrumentation.ts` OTel boot per CLAUDE.md footgun (start via `--import`).         | FS              | P0  | —                 | D01 2026-05-11 | D01 2026-05-11 |      0.5 | Jaeger receives traces; spans cover boot, request, kernel run.                                                                     |
| 14.3   | P1    | apps/api     | `main.ts` composition root: tool registry population, agent-server routes, seed profiles, sync worker boot. | FS              | P0  | 14.1, 14.2, 1.5, 2.1, 3.2, 13.5 | D10 2026-05-22 | D11 2026-05-25 |      1.0 | `createToolRegistry()` populated with `createPlannerTools()` + `createAnalyticsTools()` outputs; `createAgentRouter()` mounted at `/agent`; `seedAgentProfiles(sql, [PLANNER_PROFILE_SEED, ANALYTICS_PROFILE_SEED])` called at boot; `createPlannerSyncWorker()` started; `pnpm dev` boots; routes mounted at expected prefixes; smoke curl green. (Memory provider impl 2.2 binds in 2.3, separately.) |
| 14.4   | P1    | apps/api     | Docker compose: Postgres (pgvector), Jaeger, OTLP collector.                         | FS              | P0  | —                 | D04 2026-05-14 | D04 2026-05-14 |      0.5 | `pnpm db:up` brings full stack; pgvector extension created; HNSW available.                                                        |
| 14.5   | P1    | apps/api     | Smoke harness + 4 smoke tests (Planner READ, Planner WRITE, Analytics, FAQ).         | FS              | P0  | 14.3              | D14 2026-05-28 | D14 2026-05-28 |      0.5 | All 4 smoke tests pass; CI green.                                                                                                  |

##### EP-15 · Demo + handover (AG-S + FS, 2 MD, P0)

| WBS ID | Phase | Feature Area | Task Name                                                                            | Role            | Pri | Deps              | Start          | End            | Est (MD) | DoD / Acceptance Criteria                                                                                                          |
| ------ | ----- | ------------ | ------------------------------------------------------------------------------------ | --------------- | --- | ----------------- | -------------- | -------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| 15.1   | P1    | Demo         | Demo script (5 minutes) + dry-run rehearsal.                                         | AG-S            | P0  | 12.5, 11.4, 10.6  | D15 2026-05-29 | D15 2026-05-29 |      0.5 | Script committed; dry-run completes within 5 min.                                                                                  |
| 15.2   | P1    | Demo         | Recording (screen + audio) of live demo against dev tenant.                          | AG-S, FS        | P0  | 15.1              | D15 2026-05-29 | D15 2026-05-29 |      0.5 | Recording committed at `docs/demos/2026-05-29-p1-demo.mp4`.                                                                        |
| 15.3   | P1    | Demo         | Decision memo for sponsor (P1 outcome + P2 scope recommendation).                    | AG-S (PM)       | P0  | 15.2              | D15 2026-05-29 | D15 2026-05-29 |      0.5 | Memo at `docs/plans/2026-05-29-p1-outcome.md`.                                                                                     |
| 15.4   | P1    | Demo         | ADR consolidation (0010-0014) + cross-references.                                    | AG-S            | P0  | 1.1, 2.4, 3.5, 6.1, 7.2 | D15 2026-05-29 | D15 2026-05-29 |      0.5 | All 5 ADRs reviewed for consistency; cross-references updated.                                                                     |

##### WBS grand total

| Epic   | Stream                                                  | Tasks | Est (MD) |
| ------ | ------------------------------------------------------- | ----: | -------: |
| EP-01  | `@seta/agent-core` kernel                               |    10 |   12.0   |
| EP-02  | `@seta/agent-memory`                                    |     7 |    6.0   |
| EP-03  | `@seta/agent-workflows`                                 |     5 |    4.0   |
| EP-04  | `@seta/agent-chunking`                                  |     3 |    2.0   |
| EP-05  | `@seta/agent-embeddings`                                |     3 |    2.0   |
| EP-06  | `@seta/agent-vector`                                    |     5 |    4.0   |
| EP-07  | `@seta/agent-rag`                                       |     3 |    3.0   |
| EP-08  | Corpus survey + ingestion                               |     4 |    4.0   |
| EP-09  | MS Graph + Planner connector                            |     7 |   11.0   |
| EP-10  | Planner Agent product                                   |    10 |   16.0   |
| EP-11  | Analytics Agent                                         |     4 |    5.0   |
| EP-12  | Seta FAQ Agent                                          |     5 |    5.0   |
| EP-13  | Teams channel                                           |     6 |    4.5   |
| EP-14  | `apps/api` composition                                  |     5 |    3.0   |
| EP-15  | Demo + handover                                         |     4 |    2.0   |
| **TOTAL** |                                                      | **81** | **83.5** |

> **Scope expansion note (2026-05-13):** Detailed design spec (R13) added 10 MD of implementation scope across EP-09 and EP-10 — sync worker (9.7), permission views (10.7), materialized views + TaskIndexer (10.8), T2 analytics tools (10.9), and bulk/report workflows (10.10). Demand rises from 69.5 → 79.5 MD against 75 MD effective supply (106% utilisation). Resolution path: AG-F2 slack (~3.75 MD) absorbs 9.7; 10.9 and 10.10 are the first drops if timeline slips (Analytics text output remains fully functional without them); PM to review drop order at D07 mid-week checkpoint.
>
> **Scope expansion note (2026-05-15, v4.2):** EP-01 and EP-02 expanded to capture implemented scope beyond original plan — WM injection/refresh/tools/deep-merge (1.9, +1.5 MD), per-iteration persistence + `onIterationComplete` (1.10, +0.5 MD), Thread CRUD (2.6, +1.5 MD), auto thread title + mid-run save (2.7, +0.5 MD). Demand rises from 79.5 → **83.5 MD** against 75 MD effective supply (111% utilisation). These 4 tasks are already implemented; no schedule impact — absorbed by AI-assist uplift. Scope out (P2): per-step save on every tool execution (`SaveQueueManager`), tool approval full-flow (suspend/resume), background task dispatch, durable workflow suspension.

#### 5.2.2 Schedule allocation (Master Timeline — daily Gantt)

`█` = active. `◆` = gate / milestone. Day-of-week header: M T W T F.

|                                                              | W1 (D01-D05)            | W2 (D06-D10)            | W3 (D11-D15)            |
| ------------------------------------------------------------ | ----------------------- | ----------------------- | ----------------------- |
|                                                              | 11 12 13 14 15          | 18 19 20 21 22          | 25 26 27 28 29          |
|                                                              | M  T  W  T  F           | M  T  W  T  F           | M  T  W  T  F           |
| EP-01 Kernel (AG-S+AG-F1)                                    | █  █  █  █  █           | █  █  █  ◆ G1           |                         |
| EP-02 Memory (AG-S)                                          |    █                    |                         | █  █  ◆ G2              |
| EP-03 Workflows (AG-S)                                       |                         |       █  █  █           |       █  ◆ G3           |
| EP-04 Chunking (AG-F1)                                       |          █              |    █  █                 |                         |
| EP-05 Embeddings (AG-F2)                                     |                         | █  █  █                 |                         |
| EP-06 Vector (AG-S)                                          |       █                 |       █  █  █  ◆ G4     |                         |
| EP-07 RAG composition (AG-S)                                 |                         |             █           | █  █  ◆ G6              |
| EP-08 Corpus (FS)                                            | █  █  ◆ G5              | █  █  █                 | █  █  █                 |
| EP-09 MS Graph + Planner connector (AG-F2)                   | █  █  █  █  █           | █  █  █  █              |                         |
| EP-10 Planner Agent alpha (AG-F1+AG-S)                       |                         | █  █  █  █  █           | █                ◆ G8   |
| EP-11 Analytics (AG-F1+AG-S)                                 |                         |                         | █  █  █  █  ◆ G9        |
| EP-12 FAQ (AG-F2+AG-S)                                       |                         |                         | █  █  █  █  ◆ G10       |
| EP-13 Teams channel (FS+AG-F1)                               | █  █                    | █  █  █  █  █           |       █                 |
| EP-14 apps/api (FS)                                          | █  █  █  █              |                █        | █                █      |
| EP-15 Demo + handover (AG-S+FS)                              |                         |                         |             █  ◆ M1     |

**Critical path** (longest dependency chain): 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 14.3 → 13.5 → 13.6 (kernel → SSE → mount → channel bind → live round-trip). Slack: 0 days. **Any slip on EP-01 or EP-14 slips the demo.** Foundation track (EP-01..EP-07) reaches feature-complete by D12 (mid-W3); the last 3 days (D13–D15) are a hardening freeze — no new code, only ADRs, gate tests, integration smoke, bug-fix, demo prep, and demo.

#### 5.2.3 Resource allocation

Weekly Man-Day allocation by role. W1 = 5 working days (D01–D05), W2 = 5 (D06–D10), W3 = 5 (D11–D15). Per-role weekly capacity is `FTE × 5 × 1.35` (committed capacity per §1.1.4). Demand columns reflect §5.2.1 task assignments after dependency-audit fixes (10.7 pulled to D04–D05; W3 split per §5.2.5).

| Role            | FTE  | W1 capacity | W1 demand | W2 capacity | W2 demand | W3 capacity | W3 demand | Total capacity | Total demand | Utilisation |
| --------------- | ---: | ----------: | --------: | ----------: | --------: | ----------: | --------: | -------------: | -----------: | ----------: |
| AG-S            |  1.5 |        10.1 |       9.0 |        10.1 |       9.5 |        10.1 |      10.0 |       **30.4** |     **28.5** |        94%  |
| AG-F1           |  1.0 |         6.7 |       5.5 |         6.7 |       7.0 |         6.7 |       7.5 |       **20.2** |     **20.0** |        99%  |
| AG-F2           |  1.0 |         6.7 |       5.0 |         6.7 |       6.0 |         6.7 |       4.0 |       **20.2** |     **15.0** |        74%  |
| FS              |  0.5 |         3.4 |       3.0 |         3.4 |       3.0 |         3.4 |       3.0 |       **10.1** |      **9.0** |        89%  |
| **TOTAL**       |  4.0 |    **26.9** |  **22.5** |    **26.9** |  **25.5** |    **26.9** |  **24.5** |       **80.9** |     **72.5** |    **90%**  |

(Demand row total 72.5 MD reflects the W3-tasks-only-as-listed-in-§5.2.5 view; the WBS grand total of 79.5 MD includes ~7 MD of work that floats across week boundaries — AG-S kernel split D04→D08, etc. Both views are consistent at the 81 MD capacity ceiling: 79.5 ÷ 81 = 98% per §1.1.4.)

**Slack distribution.** AG-F2 carries ~5 MD of float — the structural buffer. If AG-S or FS overruns, AG-F2 picks up on corpus curation (8.2/8.3) or msw fixture work (9.6). If AG-S overruns on EP-06/07, the named back-up is AG-F1 on RAG composition (§5.2.6 #5). Drop order on overrun is §5.3.1.

**W2 hot-spot watch.** W2 is the densest week (25.5 MD demand) — foundation finishing collides with Planner integration starting. The dependency audit (§5.2.6 #7) and pair handoffs (§5.2.6 #4) are the structural mitigation; the Wed-W2 (D08) burn-down checkpoint is the early-warning trigger for the drop order.

Excel template Sheet 4 "TOTAL per Week (MM)" maps as: W1 = 1.22 MM, W2 = 1.22 MM, W3 = 1.22 MM capacity (using 22 working-day BMM convention).

#### 5.2.4 Budget allocation

P1 has no external budget line items (no AWS, no SaaS subscriptions, no contractors). All cost is internal headcount (4.0 FTE × 15 working days = 60 MD raw labour). LLM tokens for fixture recording are negligible (<$5 expected) and are part of existing OpenAI account.

#### 5.2.5 Week 3 phase split (commitment)

W3 (D11–D15) splits in two phases. The split is a hard commitment — D12 EOD is feature freeze.

**D11–D12 — Feature wrap (≤ 14 MD allocated).** The last window where new code paths can land. Tasks expected in this phase:

| WBS | Task | Owner | Days | MD |
|-----|------|-------|------|----|
| 2.2 | Memory provider impl | AG-S | D11–D12 | 1.5 |
| 2.3 | Bind real provider in `apps/api` | AG-S | D12 | 0.5 |
| 7.2 | RAG citation provenance | AG-S | D11 | 1.0 |
| 7.3 | RAG library tests | AG-S | D12 | 1.0 |
| 8.3 | Corpus ingestion driver | FS | D11–D12 | 1.0 |
| 10.4 | Planner WRITE safety review | AG-S | D11 | 1.0 |
| 10.6 | Planner write-preview card | AG-F1 | D11 | 1.0 |
| 10.9 | Planner T2 tools | AG-F1 | D11–D12 | 2.0 |
| 10.10 | Planner bulk + report workflows | AG-F1 | D12 | 1.5 |
| 11.1 | Analytics profile + tool registry | AG-F1 | D11 | 1.0 |
| 11.2 | Analytics aggregation tools | AG-F1 | D12 | 2.0 |
| 12.1 | FAQ profile | AG-F2 | D11 | 1.0 |
| 12.2 | FAQ retrieve tool | AG-F2 | D12 | 1.0 |

**D13–D15 — Hardening freeze (≤ 11 MD allocated).** No new feature code. Tasks limited to ADR consolidation, gate tests, integration smoke, bug fix, demo prep, demo:

| WBS | Task | Owner | Days | MD |
|-----|------|-------|------|----|
| 2.4 | ADR-0012 (memory) | AG-S | D13 | 0.5 |
| 2.5 | Memory cross-tenant fixture | AG-S | D13 | 0.5 |
| 3.4 | Workflow integration test (kill-9 resume) | AG-S | D13 | 0.5 |
| 3.5 | ADR-0011 (workflow MV) | AG-S | D13 | 0.5 |
| 8.4 | Full corpus subset ingestion + spot-check | AG-F | D13 | 0.5 |
| 11.3 | Analytics chart-card | AG-F1 | D14 | 1.0 |
| 11.4 | Analytics integration smoke + AG-S review | AG-S | D15 | 1.0 |
| 12.3 | FAQ cite tool | AG-F2 | D13 | 1.0 |
| 12.4 | BK-7 citation eval | AG-S | D14 | 1.0 |
| 12.5 | FAQ runtime wire + multi-tenant fixture | AG-S | D15 | 1.0 |
| 13.6 | Teams round-trip live smoke | FS | D13 | 0.5 |
| 14.5 | apps/api smoke harness (4 E2E tests) | FS | D14 | 0.5 |
| 15.1–15.4 | Demo script, recording, decision memo, ADR cross-refs | AG-S+FS | D15 | 2.0 |

Reactive bug-fix capacity (~3 MD) absorbs into the role-supply gap (committed 81 vs demand 79.5 = 1.5 MD slack, plus the reserve carried in §5.2.3 per-role rows).

If a D11–D12 task slips past D12 EOD, the §5.3.1 drop order applies — the task is dropped from P1, not pushed into D13–D15. This is non-negotiable: the demo's reliability depends on a bug-fix-only freeze.

#### 5.2.6 Cross-role unblocking strategy

Three-week schedule + four owners + sequential foundation = high coupling. These mechanics keep people from blocking each other.

**1. Contract-first interfaces (D01–D02).** AG-S publishes type-only interfaces — `ModelAdapter`, `ModelStream`, `Tool`, `MemoryProvider`, `WorkflowDSL`, `VectorAPI`, `RAGAPI`, `AgentProfile` — *before* implementation lands. Downstream owners code against the interface starting D02; impl arrives later in the week. This breaks the kernel-blocks-everyone chain on the critical path.

**2. Fakes ship with every platform package.** Each `platform/agent/*` package exports a `testkit` namespace with an in-memory or no-op implementation on day-one of that package's life. Product owners (AG-F1/AG-F2) bind to the fake in their tests; switching to the real impl is a one-line composition change once it lands. Specifically required: `kernel/testkit` (LLM record/replay — already in 1.8), `memory/testkit` (in-memory MemoryProvider), `workflows/testkit` (synchronous executor, no advisory lock), `vector/testkit` (in-memory cosine search), `rag/testkit` (canned `Chunk[]` retriever).

**3. Schema-lock days.** New Drizzle migrations land only on Mon-W1 (D01) and Mon-W2 (D06). Outside those windows, schema is frozen so consumers can rely on stable shapes for the rest of the week. AG-S owns the gate; emergency exceptions require sponsor + AG-S sign-off and a follow-up ADR.

**4. Pair handoff windows.** When ownership transitions cross-role, schedule a 30-min synchronous handoff at the start of the receiving day:

| Hand-off | From → To | Day | Topic |
|---|---|---|---|
| Connector schema → Permission views | AG-F2 → AG-F1 | D04 09:30 | `connector_ms365_planner.*` table shape, `plan_members` ACL semantics |
| OpenAI adapter → Agent profiles | AG-F1 (kernel) → AG-F1 (product) | D03 09:30 | `ModelAdapter` consumption pattern, fixture replay |
| Vector API → RAG composition | AG-S (vector) → AG-S (rag) | D10 09:30 | `searchChunks` signature, RLS context plumbing, `iterative_scan` requirement |
| RAG composition → FAQ retrieve | AG-S → AG-F2 | D12 09:30 | Citation shape, source-id contract |
| Composition root → Teams routing | FS → FS | D10 09:30 (self) | Tool registry order, profile seed timing, sync worker start order |

**5. AG-S bottleneck plan.** AG-S is 1.5 FTE = two engineers. Working split:

- **AG-S(1.0) — kernel/workflows/composition track.** Owns 1.1–1.6 (kernel), 3.1–3.5 (workflows), 14.3 review. Available for product code-review.
- **AG-S(0.5) — vector/RAG/memory track.** Owns 2.1–2.5 (memory), 6.1–6.5 (vector), 7.1–7.3 (RAG). Coordinates with FS on corpus ingestion.

Daily 5-min sync between the two AG-S engineers (separate from team standup) at 09:25 to keep the split coherent. AG-F1 is the named back-up for RAG composition (7.x) — if AG-S(0.5) overruns on vector, AG-F1 picks up 7.1 once Planner reads land.

**6. Daily blocker-board format.** Standup (09:30, 15-min) uses a 3-line-per-engineer format:

- *Shipped yesterday:* one-line outcome.
- *Need by EOD:* one-line ask of a specific person, or "nothing".
- *Blocking on me:* one-line list of people waiting on my output, with ETAs.

PM (AG-S) tracks the blocker board in Jira (`SETAOS` project, `Blockers` swimlane). A blocker open >24h triggers a same-day pair session.

**7. Forward-dependency audit gate (D01).** Before any task starts, PM (AG-S) verifies §5.2.1 has no Start-date < Dep-Start-date violations. The kickoff fix for the three known violations (10.2, 10.7, 14.3 — see §5.2.1 notes) is already applied in this revision; future scope-add change requests must re-run the audit.

### 5.3 Control plan

#### 5.3.1 Requirements control plan

- Scope is frozen at kickoff commit time. Additions require a written change request from the sponsor with explicit acknowledgment that another in-scope item drops to absorb the cost.
- **Drop order if mid-week burn-down exceeds 15% behind:** 10.10 workflows → 10.9 T2 tools (query_analytics, project status, 1:1 prep) → 11.4 chart-card AG-S review → 11.3 chart renderer (fallback to text card) → 7.3 RAG library tests → 3.3 `.parallel()` workflow. Dropping 10.9 + 10.10 saves 3.5 MD and keeps the core Planner alpha + Analytics demo fully functional.
- All scope changes logged in §1.2 evolution table.

#### 5.3.2 Schedule control plan

- Daily 15-min standup (9:30) — surface blockers; AG-S decides drop-order moves on the spot.
- Mid-week checkpoint Wed 16:00 — burn-down review against §5.2.3 table; PM (AG-S) updates Excel template Sheet 5 KPIs.
- Friday 30-min retro — actuals vs plan; variance >20% on any epic triggers a written re-estimate by Monday EOD.
- Sponsor receives written status Tue + Fri EOD (1-page email; progress + critical-path risk).

#### 5.3.3 Budget control plan

No external budget. Burn = headcount-hours only; tracked via the same standup/retro cadence as schedule.

#### 5.3.4 Quality control plan

- TDD for `platform/*` and `modules/products/*/tools/*` (CLAUDE.md rule). Skip allowed only for `apps/api` wiring, route registration, type-only changes, one-off scripts.
- `pnpm typecheck && pnpm lint && pnpm test:unit` green is the merge gate for every PR.
- Integration tests against real Postgres (no mocks) per CLAUDE.md.
- Verification-before-completion (`superpowers:verification-before-completion`) — no task is marked done without running the verification commands.
- Code-review gate: AG-S reviews every PR touching `platform/agent/*`. AG-F1/F2 may approve each other on Planner / Analytics / FAQ product code provided no `platform/*` files are touched.

#### 5.3.5 Reporting plan

| Report                              | Audience       | Frequency        | Format                                     | Owner |
| ----------------------------------- | -------------- | ---------------- | ------------------------------------------ | ----- |
| Daily standup                       | Project team   | Mon–Fri 9:30     | 15-min sync                                | AG-S  |
| Written status                      | CEO, CTO, PMO  | Tue + Fri EOD    | 1-page email                               | AG-S  |
| Weekly retro                        | Project team   | Fri 16:00        | 30 min                                     | AG-S  |
| Excel template sync                 | Sponsor        | Fri EOD          | `Seta Agent - Project Plan.xlsx` updated   | PM    |
| Jira board sync                     | Sponsor + team | Continuous       | Project `SETAOS`                           | PM    |
| P1 Demo                             | CEO, CTO, PMO  | Fri 2026-05-29 14:00 | 5-min recording + 25-min Q&A           | AG-S  |
| Post-P1 decision memo               | CEO, CTO, PMO  | Mon 2026-06-01 EOD | Written                                  | AG-S  |

#### 5.3.6 Metrics collection plan

Per-epic metrics tracked weekly in Excel Sheet 5 (Status Dashboard):

- Tasks done / in progress / not started.
- Total Estimate (MD) · Spent (MD) · Remaining (MD).
- Avg Progress % by phase and by role.
- Burn-rate (MD spent / week) vs plan.
- Gate pass/fail status (G1-G10, M1).

Business KPIs (BK-1, BK-3, BK-4, BK-6, BK-7) measured at M1 demo per §1.1.1 / KPI table below.

##### Business KPIs (measured at M1 demo)

| #     | Business KPI                                                                                       | Target                                       | Measured by                       | Owner    |
| ----- | -------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------- | -------- |
| BK-1  | Internal demo green to CTO+CEO on dev compose                                                       | All 3 agents demo successfully                | Live demo + recording             | PM       |
| BK-3  | Token cost per agent run in demo                                                                   | < $0.15/run avg                              | Per-run usage log                 | AG-S     |
| BK-4  | End-to-end latency                                                                                 | p95 < 6 s Planner; p95 < 8 s FAQ             | Synthetic check in smoke suite    | AG-S     |
| BK-6  | Internal feasibility evidence for sponsor decision on P2 scope                                     | Demo + capacity actuals reviewed             | Decision memo                     | PM       |
| BK-7  | Cited answer rate on FAQ Agent for the curated demo question set                                   | ≥80% answers carry ≥1 retrieved-chunk citation | Manual review                   | AG-S     |

### 5.4 Risk management plan

Top 5 risks. Mitigations are pre-authorised (no further sponsor approval required to execute).

| #  | Risk                                                                                                                                                                                              | Likelihood | Impact   | Mitigation                                                                                                                                                                                                                                  | Owner   |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| 1  | **AG-S single point of failure.** AG-S owns 28 MD (28.1 supply) — zero slack. One sick day collapses kernel + memory + workflow + vector + RAG composition.                                       | Medium     | Critical | (a) FS is named architecture backup, reads each ADR within 1 day of commit. (b) AG-S writes ADRs *before* coding the contract. (c) Drop order pre-authorised: 11.4 → 7.3 → 3.3. (d) Daily 15-min sync ensures status is always current.    | AG-S    |
| 2  | **Multi-tenant pgvector + HNSW + iterative_scan silent-correctness failure.** Wrong rows returned with no exception; cross-tenant data leak.                                                       | Medium     | Critical | (a) Task 6.4 iterative_scan correctness test is a **CI gate**. (b) Task 6.5 per-tenant fixture asserts disjoint result IDs for the same query. (c) AG-S owns all schema migrations to `agent_vector.*`; freshers cannot write directly.    | AG-S    |
| 3  | **Corpus access blocked.** If Seta IT cannot grant access to ≥5 corpus sources by EOD D03, FAQ agent cannot integration-test in W3.                                                                | Medium     | High     | (a) FS escalates blocker to AG-S/PM immediately on D02 morning if Seta IT hasn't responded. (b) Fallback: use public Seta marketing docs + publicly available HR policy templates for the demo loop. (c) Gate G5 EOD D03 is firm.            | FS      |
| 4  | **Team velocity below committed capacity.** Plan commits 81 MD against 79.5 MD demand. If actual delivered capacity falls below 75 MD, demand exceeds supply and timeline slips.                  | Low-Med    | High     | (a) Drop order kicks in at Wed-W2 (D08) if burn-down is >15% behind. (b) Drop 11.4, 11.3, 7.3 first — saves ~5 MD. (c) Worst-case fallback: 11.x Analytics ships as text reply (no chart), saves another 2 MD.                                | AG-S    |
| 5  | **MS Graph admin consent gap for new scopes.** If Planner WRITE scopes are missing, WRITE path can't demo.                                                                                          | Low        | High     | (a) AG-F2 verifies consent on D01 morning against existing dev tenant (per `requireConsent`). (b) Fallback: WRITE demo on a fresh personal dev tenant (already provisioned in Epic-1).                                                       | AG-F2   |
| 6  | **Cross-role coupling causes serial blocking.** Critical path is mostly AG-S kernel work; AG-F1/AG-F2/FS could idle waiting for interfaces if the kernel slips.                                     | Medium     | High     | (a) Contract-first interfaces published D01–D02 (§5.2.6 #1). (b) `testkit` fakes ship with each platform package (§5.2.6 #2). (c) Schema-lock days (Mon-W1, Mon-W2) bound migration churn (§5.2.6 #3). (d) Pair handoff windows scheduled at known transitions (§5.2.6 #4). (e) Forward-dependency audit gate at D01 (§5.2.6 #7). | AG-S    |

### 5.5 Closeout plan

P1 closes at M1 (Fri 2026-05-29 14:00 demo). Closeout activities (all in EP-15, D15):

1. Live recorded demo to CEO + CTO + PMO.
2. Decision memo to sponsor (P2 scope recommendation, P1 actuals vs plan).
3. ADR consolidation (0010-0014) and cross-reference pass.
4. Excel template final state committed to `docs/plans/Seta Agent - Project Plan.xlsx` (mirror of `~/Desktop/`).
5. Jira project `SETAOS` issues all set to Done / Closed; epics tagged with M1 release label.
6. Retro on Mon 2026-06-01: lessons learned for P2.

---

## §6 Technical process plans

### 6.1 Process model

Iterative-incremental within a single 3-week increment. Daily merges to `main` behind a release-quality bar (typecheck + lint + unit + integration green). No long-lived feature branches; PRs target `main` directly via squash/rebase merge (per CLAUDE.md).

### 6.2 Methods, tools, and techniques

- **TDD** for `platform/*` and product tools (`superpowers:test-driven-development`).
- **DDD bounded contexts** for `modules/products/*` and `modules/connectors/*` (CLAUDE.md).
- **Systematic debugging** for any bug (`superpowers:systematic-debugging`).
- **Verification before completion** (`superpowers:verification-before-completion`) — typecheck + lint + relevant tests + endpoint exercise.
- **Schema-driven generation** (CLAUDE.md): Drizzle → SQL via `drizzle-kit generate`; Zod → TS via `z.infer`; Zod routes → OpenAPI via `@hono/zod-openapi`.
- **Record/replay LLM fixtures** via `@seta/agent-core/testkit` and msw (CLAUDE.md — no live model APIs in CI).

### 6.3 Infrastructure plan

- Local development on macOS / Linux with Docker Desktop.
- Postgres + pgvector + Jaeger via `pnpm db:up` (docker compose).
- No remote / staging infrastructure in P1.
- Dev tunnel via `ngrok` for Teams round-trip testing.

### 6.4 Product acceptance plan

Acceptance criterion for P1 = M1 demo passes the following script live (recorded for posterity). Steps 1–3 demonstrate the Planner Agent **alpha** (alpha definition per §1.1.1; outcome recorded in decision memo, task 15.3):

1. Teams desktop, type "Summarize my open Planner tasks" → streaming reply → task-list Adaptive Card.
2. Type a follow-up referring to the prior turn → memory recall demonstrates context.
3. Type "Create a task in plan X called Y" → preview card → click Confirm → task appears in Microsoft Planner.
4. Type "Who is overloaded this week?" → Analytics Agent → bar-chart Adaptive Card.
5. Type "What is Seta's PTO policy?" → FAQ Agent → answer with ≥1 citation; click citation to expand source chunk.
6. (Terminal) Run `pnpm rag:ingest --subset` to demonstrate corpus pipeline.
7. (Terminal) Trigger workflow `.then(a).parallel([b,c])` to demonstrate suspend/resume.

If any of steps 1-5 fails live, the corresponding agent is recorded as "partial" and the decision memo (15.3) reflects it.

---

## §7 Supporting process plans

### 7.1 Configuration management plan

- All artifacts in git (this repo, `main` branch).
- Conventional Commits per CLAUDE.md (`feat(scope): …`, `fix(scope): …`).
- Changeset required for every change to a published package (`pnpm changeset`).
- Excel template and demo recording committed to `docs/plans/` and `docs/demos/` respectively.
- Jira project `SETAOS` syncs from WBS — Jira is the live tracking surface; this doc is the contract.

### 7.2 Verification and validation plan

- Unit tests co-located in `<pkg>/src/**/*.test.ts`.
- Integration tests in `<pkg>/tests/integration/**` (require live Postgres via `DATABASE_URL`).
- 4 smoke tests at the apps/api level (14.5) cover Planner READ, Planner WRITE, Analytics, FAQ end-to-end.
- BK-7 citation rate measured manually on the FAQ demo loop (12.4).

### 7.3 Documentation plan

- 5 ADRs (0010-0014) per §5.2.1 EP-15.
- This SPMP (v4) — sponsor-facing.
- WBS exported to Excel (Sheet 2 template).
- Jira project import (CSV from WBS table).
- Decision memo (15.3).
- No standalone user docs in P1 — kept as P2 work.

### 7.4 Quality assurance plan

- No dedicated QA headcount. AG-F1 and AG-F2 self-test per CLAUDE.md TDD rules. AG-S code-reviews every `platform/agent/*` PR.
- Security review checkpoints: G2 (memory RLS) and G4 (vector RLS) — Head of Security consulted (R column in §4.4 RACI).
- Cross-tenant isolation tests required at G2 and G4.

### 7.5 Reviews and audits

| Review                              | When                | Participants              | Output                                |
| ----------------------------------- | ------------------- | ------------------------- | ------------------------------------- |
| ADR review                          | Per ADR commit      | AG-S + FS                 | ADR approval / change request         |
| PR review (`platform/*`)            | Per PR              | AG-S (reviewer)           | Merge / change request                |
| PR review (products)                | Per PR              | AG-F1 ↔ AG-F2 peer        | Merge / change request                |
| Mid-week burn-down                  | Wed 16:00           | Whole team                | Status update + drop-order decisions  |
| Weekly retro                        | Fri 16:00           | Whole team                | Lessons + plan adjustments            |
| Gate review (G1-G10)                | Per gate            | Per §4.4 RACI             | Pass / fail / conditional pass        |
| M1 demo + Q&A                       | Fri 2026-05-29 14:00 | All stakeholders         | Demo recording + sponsor decision     |

### 7.6 Problem resolution plan

- Bug found in own code: fix in same PR using `superpowers:systematic-debugging`.
- Cross-package bug: file Jira ticket under `SETAOS`, route to owning role per §4.3.
- Architecture bug (kernel contract issue): AG-S writes a corrective ADR; pause downstream consumers; un-pause after merge.
- Security finding (RLS bypass, scope leak): release blocker. M1 demo gated on resolution.

### 7.7 Subcontractor management plan

No subcontractors in P1.

### 7.8 Process improvement plan

Lessons-learned retro on Mon 2026-06-01 produces inputs for P2 SPMP. Three required inputs: actual delivered capacity vs committed 81 MD, AG-S split-load actuals (did 1.5 FTE behave as 1.5 effective?), corpus ingestion velocity (MD per 100 documents).

---

## §8 Additional plans

### 8.1 Sponsor decisions still required (5 only)

The v3.1 plan had 10 sponsor questions. v4 collapses them — the team-size / deadline / scope questions are answered by accepting this plan. Five confirmations remain:

| #   | Decision                                                                       | Default if not answered            | Deadline       |
| --- | ------------------------------------------------------------------------------ | ---------------------------------- | -------------- |
| Q1  | OSS public flip — confirmed slip to P2?                                        | Treated as **slipped**             | D02 EOD        |
| Q2  | Inbound web SSO — confirmed deferred to P2?                                    | Treated as **deferred**            | D02 EOD        |
| Q3  | AWS staging deployment — confirmed dev compose only?                           | Treated as **dev compose only**    | D02 EOD        |
| Q4  | No dedicated QA in P1 — sponsor accepts freshers doubling?                     | Treated as **yes**                 | D02 EOD        |
| Q5  | P2 increment (2026-06-01 → ?) — start a v5 SPMP on Mon 2026-06-01?             | Treated as **yes**                 | M1 demo Q&A    |

### 8.2 Jira import mapping (template)

CSV header for direct Jira import from the WBS table (one row per task):

```
Summary,Issue Type,Epic Link,Component,Priority,Original Estimate,Story Points,Assignee Group,Start Date,Due Date,Description
```

Mapping rules:

- `Summary` = `<WBS ID> · <Task Name>` (e.g., `1.4 · Run loop core: turn → tool-call → tool-result …`).
- `Issue Type` = `Story` for product code, `Task` for infra/wiring/corpus, `Epic` for the 15 epics.
- `Epic Link` = `EP-NN` (created first as Epic issues).
- `Component` = `Feature Area` value (e.g., `Kernel`, `Memory`, `Planner-Agt`).
- `Priority` = `P0/P1/P2` from WBS column F.
- `Original Estimate` = `<Est (MD)>d` (e.g., `1.5d`).
- `Story Points` = `Est × 2` (1 SP ≈ 0.5 MD).
- `Assignee Group` = `Role` value (resolve to individual at import time).
- `Start Date` / `Due Date` = ISO dates from §5.2.1 Start / End columns.
- `Description` = `DoD / Acceptance Criteria` value, prefixed with `## Acceptance criteria\n`.

### 8.3 Excel template population mapping

Direct cell mapping from this SPMP to `~/Desktop/Seta Agent - Project Plan.xlsx`:

| Excel cell / sheet              | Source in this SPMP                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| Sheet 1 R4 (PM, Sponsor)        | §1.1.4 row "Project Manager" / "Sponsor"                                                         |
| Sheet 1 R5 (Start / End)        | §1.1.4 "P1 Start" → Excel serial 46148; "P1 End" → 46166                                        |
| Sheet 1 R8-R12 (Objectives)     | §1.1.1 O1-O9                                                                                     |
| Sheet 1 R23-R25 (May / Jun rows)| §5.2.3 totals (this project spans only May; June = empty)                                        |
| Sheet 2 R6+ (WBS rows)          | §5.2.1 WBS table — one row per task; columns A-S map as documented in this conversation         |
| Sheet 3 R6+ (timeline rows)     | §5.2.2 Gantt — per-task Start/End + daily Prog %                                                 |
| Sheet 4 R5-R11 (Resources)      | §5.2.3 weekly MM allocation per role (converted from MD: 5 MD = 5/22 = 0.227 MM)                 |
| Sheet 5 R7+ (KPIs)              | §5.3.6 + auto-derived from Sheet 2                                                               |
| Sheet 5 R30+ (Milestones)       | §4.4 gates G1-G10 + M1                                                                           |

### 8.4 Pre-kickoff approval checklist

| #   | Item                                                                                                   | Owner            | Status   |
| --- | ------------------------------------------------------------------------------------------------------ | ---------------- | -------- |
| 1   | §1.1.4 schedule/budget accepted by CEO + CTO                                                            | CEO + CTO        | Pending  |
| 2   | §4.3 staffing confirmed (1.5 AG-S + 1.0 AG-F1 + 1.0 AG-F2 + 0.5 FS, no PTO)                            | CTO + HR         | Pending  |
| 3   | §8.1 Q1-Q5 answered (or defaults accepted in writing)                                                   | CEO + CTO        | Pending  |
| 4   | Corpus access G5 path with Seta IT confirmed; first response by EOD D03                                 | FS + Seta IT     | Pending  |
| 5   | Entra admin consent for existing Planner READ + WRITE scopes verified on dev tenant                     | AG-F2 + Seta IT  | Pending  |
| 6   | Jira project `SETAOS` provisioned; WBS imported per §8.2                                                | PM               | Pending  |
| 7   | Excel template populated per §8.3                                                                       | PM               | Pending  |
| 8   | §5.1.1 estimate review walkthrough completed with whole team                                            | AG-S             | Pending  |

---

**End of SPMP v4.0 (2026-05-12).**
