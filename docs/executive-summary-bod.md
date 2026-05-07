# Board Paper — Future (Agent-Native Enterprise OS)

| Field           | Value                                                             |
| --------------- | ----------------------------------------------------------------- |
| Paper No.       | BP-FUTURE-001                                                     |
| Date            | _<insertion date>_                                                |
| Paper Type      | **For Decision** — pre-kickoff approval                           |
| Sponsor         | _<Executive Sponsor — to be named by BOD>_                        |
| Author          | Project Management Office, Future                                 |
| Status          | **Proposed — Phase-1 not yet commenced**                          |
| Decision Window | Approval requested before 2026-04-22 to enable a 2026-04-23 start |

## Proposed Board Resolution

> _"That the Board approves the commencement of the Future programme on **2026-04-23** with the multi-disciplinary delivery team described in §6 (four engineers full-time, one Business Analyst at 50%, one Scrum Master at 50%, one QA Engineer to be hired full-time), with enabling support from the SETA IT & DevOps team for cloud and Microsoft 365 setup, a six-week MVP build window concluding in a demonstration on **2026-05-31**, an operating envelope of **USD 2,000 per month** for cloud and AI inference (separate from team payroll), and the scope, timeline, and exclusions set out in this paper, on the explicit basis that (i) the May-31 milestone is the MVP demonstration (not General Availability), (ii) external pilot tenants will not be onboarded until the deferred GDPR right-to-erasure pipeline ships, and (iii) the Board separately reconciles this programme with the Action Intelligence Platform proposal v2.0 (2026-04-10)."_

---

## 1. Executive Summary

Future is SETA's proposed agent-native enterprise operating system — one platform that replaces four fragmented internal applications with a canonical data layer and a governed AI agent runtime, validated on SETA's own operations before being commercialised to the Vietnamese SME market and beyond. This paper requests Board approval to commence the Phase-1 build over a six-week window, delivering a working MVP demonstration on 2026-05-31 with two flagship modules — **Agents** and **Planner** — on a multi-disciplinary delivery team (four engineers full-time, one QA Engineer to be hired full-time, one Business Analyst at 50%, one Scrum Master at 50%) with enabling support from SETA's IT & DevOps team for cloud and Microsoft 365 setup.

## 2. Context and Background

SETA today operates four disconnected internal systems for HR, time, projects, and finance. Cross-functional KPI initiatives cannot be built on top of them; finance reconciliation runs days behind real time; project profitability is reported quarterly, after the fact. Retrofitting integration is diminishing-returns work — the structural cause is the absence of a canonical kernel underneath.

The Future programme proposes to build that kernel, deliver two end-user-visible modules on top of it (Agents and Planner), and prove the platform on SETA's own 300-staff operation before offering it externally. The architectural posture is bottom-up: canonical data layer first, governed agent runtime second, domain modules third. AI-assisted development tooling has reached a quality threshold where a four-engineer team can credibly deliver this six-week MVP — but only with protected focus and a ring-fenced mandate.

The Board is asked to approve commencement now, ahead of the proposed 2026-04-23 start date, on the scope and timeline detailed below.

---

## 3. Scope of the Phase-1 MVP

### 3.1 In scope (committed deliverables by 2026-05-31)

| Workstream                      | Headline Deliverables                                                                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Platform architecture (DDD)** | Domain-Driven Design modular monolith with module scaffold CLI, schema-per-module isolation, cross-module facade contracts, row-level security enforcement at every table, build-time architectural lint rules — **designed for new teams to extend the system without rework** |
| **Agents module**               | Conversational AI assistant with knowledge-base Q&A, personal task assistance, approval-inbox-mediated writes, scheduled summaries, tenant cost governance                                                                                                                      |
| **Planner module**              | Plans / buckets / tasks, evidence-backed completion, four view modes, four personal hubs, **bidirectional Microsoft 365 Planner sync** with conflict log                                                                                                                        |
| **People module — Profiles**    | Employment record (active / inactive), canonical identity resolution by exact identifier — the foundation every other module depends on                                                                                                                                         |
| **Web Admin shell** (light)     | Tenant settings, module toggles, platform-admin role-gated view, host shell for module-specific admin surfaces                                                                                                                                                                  |
| **Deployment**                  | Production AWS infrastructure (ECS Fargate ARM64), CI/CD pipelines, dual-tenant isolation probe, secrets rotation runbook, backup and point-in-time recovery                                                                                                                    |
| **Documentation**               | Architectural decision records, runbooks (cutover, incident response, GDPR), updated requirements, contributor docs, module-author guide                                                                                                                                        |

### 3.2 Explicitly out of scope (deferred to Phase-1.5 or later)

The following are deliberately deferred. They will not be built in the six-week window and the Board is asked to confirm the cuts:

**Modules not in MVP:** time, hiring, performance, projects, finance, goals, business-intelligence.

**People module:** org placements (manager / reportee, teams, departments), offboarding lifecycle, **GDPR right-to-erasure pipeline**, fuzzy directory search.

**Agents module:** manager / team-lead dashboards, fuzzy owner resolution from natural language, statistical anonymisation floor on aggregates, multi-provider AI failover, multi-language UI, cross-conversation memory, image / scanned-document ingestion, system-event triggers, Slack / Microsoft Teams chat surfaces, autonomous monitoring (Phase D).

**Planner module:** plan duplication, Excel / CSV export, custom fields, conditional formatting, "People" view, sprints/backlog, custom calendars, Microsoft Copilot inside the Future plan view, per-occurrence recurrence edits, server-side rich-text editor.

**Cross-cutting:** native mobile apps, multi-region deployment, cross-tenant collaboration, Outlook calendar integration.

### 3.3 Platform-architecture commitment (cross-cutting)

A foundational commitment of Phase-1 — distinct from any single module — is the establishment of a **DDD modular-monolith platform** that supports scaling to additional teams and additional domain modules without architectural rework. This is detailed in §4.3 and includes the module scaffold CLI, schema-per-module isolation, cross-module facade contracts, row-level security enforcement, and architectural lint rules. Without this commitment, the marginal cost of adding the next module rises sharply; with it, additional teams can be onboarded onto deferred modules (time, hiring, performance, finance, goals, business intelligence) in days rather than weeks.

### 3.4 What the MVP demonstration will show on 2026-05-31

A live, end-to-end run on real SETA data:

1. An employee opens the chat surface and asks a policy question — the agent answers with citations to the uploaded employee handbook.
2. The same employee asks "what are my overdue tasks?" — the agent reads from Planner and lists them with links.
3. The employee asks the agent to mark a task complete with an attached evidence link — a draft action appears in the approval inbox; the employee approves; the task updates in Future and (within minutes) in Microsoft 365 Planner.
4. The employee subscribes to a daily morning digest — and receives one the following business day.
5. An admin views the synchronisation-health dashboard, the conflict log, and the agent cost ledger.

---

## 4. Solution Detail

### 4.1 Agents Module — Governed AI Assistant

A conversational assistant accessible to every employee through a web chat interface. Trust is earned in four phases — **A: Knowledge Q&A**, **B: Personal Insights**, **C: Action Proposals (with human approval)**, **D: Autonomous monitoring**. Phase A and Phase B are in MVP scope; Phase C is delivered in a constrained form (only own-scope writes, all routed through an approval inbox); Phase D is **explicitly not in scope** for this release.

#### 4.1.1 What the agent actually does — six distinctive flows

This is not a chatbot bolted onto a database. Six named, end-to-end conversational flows ship at MVP:

1. **Tenant-policy Q&A with citations.** The user asks a policy question (parental leave, travel approval, expense limit). The agent retrieves the answer from the tenant's curated Knowledge Base and returns source-document and section citations as navigable links. Retrieval is **tenant-keyed at the database layer** — cross-tenant search is structurally prohibited, not merely application-filtered.
2. **Personal task synthesis (own-scope reads).** "What's overdue?" / "What's due this week?" / "What did I close last Friday?" — natural-language questions answered from Planner data scoped to the caller's own tasks, with task-link rendering inline.
3. **Constrained natural-language writes.** "Mark the design-review task done with this evidence link" / "Push the deadline to Friday." The agent issues a draft, which lands in the user's approval inbox carrying a 72-hour time-to-live and a permission envelope captured at draft time. On confirmation, preconditions are re-validated; if permissions narrowed between draft and execution, the write fails with a structured event. Idempotency keys prevent duplicate writes on retry.
4. **Scheduled own-scope digests.** "Send me a daily morning brief of my open tasks." The user grants a time-bound, scoped delegation (90-day default, revocable, audited on every use). Scheduled runs are read-only or inbox-draft-only — they cannot execute autonomous writes.
5. **Unified approval inbox triage.** Every drafted write — whether from a live chat turn or a scheduled run — surfaces in one inbox. Bulk, cross-target, and destructive operations are **non-bypassable** — they always route to the inbox regardless of the user's execution mode. Tenant admins can globally disable Bypass mode or pin specific tools to always-confirm.
6. **Cost-aware refusal.** When the user's per-day or the tenant's per-day budget is about to be exhausted, the agent refuses **before** the LLM call is dispatched, not after. The user sees a typed refusal (`budget_exceeded`) with the precise amount remaining — never a silent failure or a partial answer that has already cost money.

#### 4.1.2 Architectural backbone — five commitments that make this defensible

| Architectural choice                                | Why it matters                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Router → Sub-agents → Synthesizer pipeline**      | A bounded directed-acyclic-graph of named stages, not a single LLM call. The Router classifies intent; parallel Sub-agents fetch domain context; the Synthesizer composes the user-facing answer. Every stage is independently observable, retryable, and replayable.                             |
| **Permission enforcement at the database layer**    | A successful prompt-injection attack cannot exceed the caller's permissions, because row-level security is enforced by Postgres at the connection level. Tenant isolation is **database-enforced, not application-folklore**.                                                                     |
| **Turn-scoped taint tracking**                      | When any tool reads tenant-authored free text (a task description, a meeting note), the conversation is marked _tainted_. From that point, every write drafted in the same turn is forced to the approval inbox — defending against prompt-injection-via-task-text composition attacks.           |
| **Deterministic prompt-replay by trace identifier** | Every turn's full prompt is content-addressed (hashed) into an append-only store. The same trace identifier always reproduces the same prompt, the same tool calls, the same outcome — for forensic audit, incident response, and regression testing. Replays fail explicitly, never fuzzy-match. |
| **Cache-aware, dollar-denominated cost ceilings**   | Four-tier ceilings in US dollars (per-turn, per-user-per-day, per-tenant-per-day, per-delegation). Cache-read and cache-write tokens are priced separately. A misfiring scheduled run is caught **before the LLM call is dispatched**, not retroactively.                                         |

#### 4.1.3 Reliability architecture

Quality is monitored continuously by a synthetic canary (hourly probe per model tier; rolling 30-minute success-rate window). When the flagship model degrades, the system walks an **explicit ordered fallback ladder** — single retry → fall back to a smaller model with user-visible notice → partial answer → tenant-wide tier shift → hard refusal → budget refusal. Silent degradation is forbidden: if quality drops, the user is told. A single retry layer at the gateway eliminates stacked-retry storms (a known agent failure mode); per-tool circuit breakers disable any tool that fails twice within a turn.

#### 4.1.4 MVP capability summary

| Capability                       | Detail                                                                                                                                                                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conversational web surface       | Dedicated chat application with live token-by-token streaming and turn cancellation; partial writes that committed before the cancel signal are reported to the user with timestamp, never silently rolled back (cancel-race honesty contract)                                          |
| Tenant Knowledge Base            | Admins upload handbook / policies / FAQs; asynchronous ingestion (chunk → embed → tenant-keyed pgvector index) within 60 seconds for ≤1 MB documents; per-tenant quotas of 1,000 documents / 50 MB / 5 MB per file; admins can deprecate documents instantly with audit shell preserved |
| Approval inbox + execution modes | Default mode (every write previews before execution) and Bypass mode (single-target writes execute immediately); non-bypassable floor on bulk, cross-target, and destructive writes regardless of mode                                                                                  |
| Personal task assistance         | Natural-language reads scoped to the caller's tasks; constrained writes (existing assignees + exact-email only)                                                                                                                                                                         |
| Scheduled summaries              | Daily / weekly digests via time-bound delegation grants (90-day default, revocable, audited each use); scheduled runs cannot execute autonomous writes                                                                                                                                  |
| Tenant administration            | Model selection, four-tier dollar ceilings, knowledge-base management, Bypass-mode global disable, per-tool always-confirm pinning                                                                                                                                                      |
| Governance, audit, replay        | Every action audits to the kernel under the caller's identity (never a service account) in the same database transaction as the action; full replayability by trace identifier                                                                                                          |

#### 4.1.5 Performance commitments at MVP

First reply token within 2.5 seconds (95th percentile); full interactive turn within 30 seconds (asynchronous within 5 minutes); knowledge-base retrieval within 250 milliseconds; KB ingestion within 60 seconds for ≤1 MB documents; cancellation propagates within 1 second; 50 concurrent turns per tenant; 99.5% availability during business hours.

### 4.2 Planner Module — Work Tracking with Microsoft 365 Sync

A work-tracking surface designed to **complement** Microsoft 365 Planner, not replace it. Tenants who already work inside Microsoft Teams / 365 keep doing so; Future adds bidirectional sync, evidence-backed completion, personal hubs, and an audit history that Microsoft Planner alone does not provide. This is the single most visible commercial differentiator versus MISA and Base.vn — neither operates inside the Microsoft surface natively.

#### 4.2.1 Architectural backbone — five commitments that make the sync trustworthy

| Architectural choice                                              | Why it matters                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bidirectional sync with explicit conflict surfacing**           | The pull leg uses Microsoft Graph **delta queries** (Microsoft tells us what changed; we don't poll the world). The push leg is **outbox-driven from Future's domain events** (every change emits a durable event; the worker drains the outbox). When the same field changes on both sides, last-write-wins by version comparison, with both prior states preserved as first-class **conflict events** for admin review. **No silent overwrite, ever.** |
| **Per-plan adaptive back-off**                                    | Throttling is per-linked-plan, not global. Steady state: ≤ 1 poll per minute. On sustained errors, cadence widens up to a capped upper bound; on success it resets. **A single heavy tenant cannot starve its neighbours.**                                                                                                                                                                                                                              |
| **Three container types as a tenant-facing topology choice**      | Each plan is **Future-only** (no Microsoft linkage), **MS-Group** (bound to a real Microsoft 365 Group visible in the directory), or **MS-Roster** (bound to a Future-minted roster supporting ad-hoc participants outside any Microsoft group, for sensitive teams). Container type is fixed at link time.                                                                                                                                              |
| **Evidence as a peer object with independent verification state** | Evidence carries three kinds (file, link, note) and four verification states (unsubmitted, submitted, verified, rejected). **Verification state is decoupled from task completion** — a task can be marked done without evidence, and evidence can be verified long after completion. This makes evidence a first-class input to downstream Performance and Goals modules.                                                                               |
| **Evidence file storage in S3 with content hashing**              | Files are stored once in S3, downloaded only via API-proxied signed URLs (no anonymous bucket access). For Microsoft attachments, Future stores a reference plus a content hash; the binary is **never duplicated locally**. Audit-grade provenance without storage bloat.                                                                                                                                                                               |

#### 4.2.2 Personal Hubs as composed queries (not materialised stores)

My Day, My Tasks, Personal Charts, and Carry-Over compose data from base entities at read time — they do not own a separate task store. A nightly orphan-sweep job removes any My-Day entry pointing at a task that has been deleted, archived, or moved out of scope, so the user never sees a broken reference. This composition pattern keeps the hub surface responsive without duplicating data, and it means every personal-hub query is automatically subject to the same row-level security as the underlying tasks.

#### 4.2.3 Rich-text round-trip — deliberately lossy

Microsoft's rich-text payloads are **normalised to plain text** on both sides of the sync. This is an explicit architectural choice: deterministic round-trip wins over fidelity. **Evidence is never synced outward** — it remains a Future-only construct, ensuring Future owns the proof record completely. Tenants moving from "Microsoft Planner alone" gain a permanent, audit-grade record of work-completion proof that they did not have before.

#### 4.2.4 Audit and conflict atomic to the mutation

Every change emits a kernel audit event with tenant, actor, source (`user` / `ms_sync` / `system`), correlation identifier, plan and task references, before/after values, and UTC timestamp. Every conflict logs both prior states plus the triggering operation. As a result, "Show every action this user took on Tuesday" or "Which tasks had Microsoft sync conflicts last week" is a single query, not a forensic exercise.

#### 4.2.5 MVP capability summary

| Capability                              | Detail                                                                                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plans, buckets, tasks (core operations) | Create, edit, assign, prioritise, due-date, complete tasks                                                                                                                        |
| Evidence and verification               | Three-tier model — text note (Tier 1), link (Tier 2), file upload (Tier 3); the tier required is set by the task's impact score; verification state independent of completion     |
| Four view modes                         | Board (kanban), Grid (table), Charts (rollups), Schedule (timeline)                                                                                                               |
| Personal Hubs                           | My Day, My Tasks, Personal Charts, Carry-Over — composed queries, accessible from every module's sidebar, orphan-swept nightly                                                    |
| **Bidirectional Microsoft 365 sync**    | Pull via Graph delta queries; push via outbox-driven worker; per-plan adaptive back-off; three container types (Future-only / MS-Group / MS-Roster)                               |
| Conflict log + admin override           | First-class conflict events with both prior states logged; admins force-resync per task or override the result; override re-runs domain invariants and rejects violating outcomes |
| Admin surface                           | Sync-health summary, conflict log viewer, evidence quota management, container-type management                                                                                    |

#### 4.2.6 Performance commitments at MVP

Microsoft → Future pull cycle within 5 minutes (95th percentile); Future → Microsoft push within 30 seconds; per-plan adaptive back-off on Microsoft throttling; 1,000 active tasks per plan (matches Microsoft's published Basic-tier limit); recovery point ≤ 15 minutes / recovery time ≤ 30 minutes after an outage; 99.5% availability during business hours.

### 4.3 Platform Architecture — Built for Extensibility

The Phase-1 MVP must not be a one-shot delivery. Future is intended to grow well beyond the two flagship modules — over time, other teams must be able to join, take ownership of new domain modules (time, hiring, performance, finance, goals, business intelligence), and extend the platform without architectural rework. The platform architecture established in Phase-1 is therefore an **explicit scope deliverable**, not an emergent by-product.

**Architectural pattern.** Hexagonal architecture combined with Domain-Driven Design (DDD) inside a Turborepo modular monolith. Each domain module is structured into four layers:

| Layer             | Contents                                                                 |
| ----------------- | ------------------------------------------------------------------------ |
| `domain/`         | Entities, value objects, ports — zero framework or database dependencies |
| `application/`    | Commands, queries, facades, event handlers                               |
| `infrastructure/` | Database repositories, schema, listeners                                 |
| `interface/trpc/` | Type-safe API contribution, exposed to the front-end                     |

**Cross-module rules** (enforced by code review, lint rules, and CI):

- Every module owns its own database schema (`core`, `agents`, `planner`, `people`, `time`, …).
- No foreign key constraints across schema boundaries.
- No imports from another module's domain or infrastructure layers.
- Cross-module reads pass through a published QueryFacade only.
- Cross-module writes pass through a published WriteFacade only.
- Asynchronous communication uses domain events in a shared `event-contracts` package.
- Every database table carries a tenant identifier and a row-level security policy.

**Extensibility surface delivered in Phase-1:**

| Deliverable                                      | What It Enables                                                                                                                                                                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Module scaffold CLI**                          | Bootstraps a fully wired new module (schema, repositories, tRPC router, web zone, design-system integration, RLS policy, audit emission, test scaffolding) in minutes — exercised on Agents, Planner, and People                                              |
| **Eleven Next.js zones already in the monorepo** | One independent service per business domain (web-people, web-time, web-hiring, web-projects, web-finance, web-performance, web-goals, web-insights, web-planner, web-admin, plus web-shell). New modules either slot into an existing zone or claim their own |
| **Build-time invariants**                        | Any new database table without a row-level security policy fails CI; any module that imports another module's domain layer fails CI                                                                                                                           |
| **Architectural Decision Records**               | Cross-module facade pattern, outbox event delivery, parallel-track contract publication — written down so future teams inherit the rules, not just the code                                                                                                   |
| **Contributor documentation**                    | `CONTRIBUTING.md`, module-author guide, onboarding runbook                                                                                                                                                                                                    |

**What this means for the Board.** The marginal cost of adding the time, hiring, performance, finance, or goals modules in Phase-2 is the cost of writing that module's domain logic — not the cost of re-architecting the platform. A second engineering team can be onboarded onto a new module in days, not weeks, and can ship in parallel without blocking the Agents / Planner teams.

### 4.4 How the Two Modules Connect

Agents and Planner are built independently through Sprint 5 and integrate in a single 4-day Linking Sprint at the end (Sprint 6, 2026-05-28 to 05-31). For this to work, four module-to-module interface contracts must be locked on Sprint 3 start (2026-05-07):

- **Planner read interface** — lets Agents see the user's own tasks (today, this week, overdue).
- **Planner write interface** — lets Agents update tasks via natural language, within the constraints described above.
- **People identity interface** — lets both modules resolve a person from a unique identifier (exact match only at MVP; fuzzy name matching is deferred).
- **Agents front-end ↔ back-end contract** — keeps the two-engineer Agents track in lockstep across the front-end / back-end split.

Locking these four contracts on the first day of Sprint 3 is the single highest-leverage architectural commitment of the programme. Without them, the parallel tracks cannot test against each other and the Linking Sprint fails.

---

## 5. Timeline and Milestones

The programme runs as **six one-week sprints** over the calendar window **2026-04-23 to 2026-05-31**, leveraging AI-assisted development tooling for compressed delivery. Sprints S1–S2 build the foundation; S3–S5 build feature surfaces in parallel tracks; S6 integrates them.

| Sprint          | Window                      | Sprint Goal                                                                                                                                | Demo / Gate                           |
| --------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| **Pre-kickoff** | by 2026-04-22               | Board approval; team ring-fenced; Microsoft 365 sandbox tenant provisioned; AWS account opened                                             | **BOD approval gate**                 |
| S1              | 2026-04-23 → 04-29          | Monorepo + toolchain ready (CI/CD, type-safety, lint, design-system bootstrap)                                                             | Internal walkthrough                  |
| S2              | 2026-04-30 → 05-06          | Backend + frontend + authentication + database skeletons ready; SSO configured                                                             | Internal walkthrough                  |
| S3              | 2026-05-07 → 05-13          | Staging deployable on AWS; People-Profile + Planner + Agents walking skeletons; **four module-to-module contracts locked on Day 1**        | Velocity re-baseline at retrospective |
| S4              | 2026-05-14 → 05-20          | Planner view modes + personal hubs; Agents knowledge base + retrieval + execution-mode framework; production readiness checklist           | Internal walkthrough                  |
| S5              | 2026-05-21 → 05-27          | Planner Microsoft 365 sync + admin (with conflict-override flow); Agents tenant administration + reliability + cost governance             | Internal walkthrough                  |
| S6              | 2026-05-28 → 05-31 (4 days) | **Linking Sprint** — cross-module integration, Agent ↔ Planner read/write, scheduled own-scope runs, final documentation                   | **MVP demonstration — 2026-05-31**    |
| Post-MVP        | Jun–Aug 2026                | Backlog burn-down toward Phase-1 General Availability; first three external pilot tenants (50–150 staff each, professional-services firms) | **Phase-1 GA gate**                   |
| Commercial      | Q4 2026 onward              | BlueOC client offering (Path B); preparation for standalone SaaS launch (Path C)                                                           | First paying customer                 |

### 5.1 Why six sprints, why one-week cadence

A four-engineer team cannot deliver Phase-1 General Availability in six weeks. What it can deliver — at AI-leveraged velocity, with disciplined scope cuts — is a credible MVP demonstration covering the two visible modules end-to-end on real internal data. Six one-week sprints give the team six retrospectives to course-correct; the one-week cadence is a deliberate hedge against the unproven AI-leveraged velocity assumption (re-baseline opportunity at every sprint end).

### 5.2 Critical scheduling commitments

- **Sprint 3 Day 1 (2026-05-07): four interface contracts must be locked.** Without this, the parallel tracks cannot test against each other and Sprint 6 will fail.
- **Sprint 3 Day 2 (2026-05-08): Microsoft 365 sandbox tenant must be available.** Without it, sync work in S4–S5 stalls.
- **Sprint 3 retrospective (2026-05-13): velocity re-baseline gate.** If team-total velocity is below the planned rate, scope is formally cut to a Phase-1.5 release at this point — not later.
- **Sprint 6 is only four calendar days** (28-May to 31-May). Risk-loaded; integration smoke tests must pass at end of Sprint 5 or scope contracts further.
- **MVP demonstration is the PMO performance-evaluation anchor.** Phase-1 GA is a separate downstream gate, not bundled with the May-31 demo.

### 5.3 What is _not_ promised by 2026-05-31

To prevent the demo being mis-read as launch:

- The platform will **not** be ready for external (non-SETA) tenants on 2026-05-31. External onboarding is gated on the GDPR right-to-erasure pipeline, the dual-tenant isolation soak test, and a sustained zero-incident sync run — none of which are MVP deliverables.
- All other modules (time, hiring, performance, projects, finance, goals, BI) will not be present.
- Manager / team-lead dashboards will not be present.
- Multi-language UI, mobile apps, and multi-region deployment will not be present.

---

## 6. Resourcing and Team Setup

### 6.1 Delivery team — composition and responsibilities

The Phase-1 delivery team is multi-disciplinary, ring-fenced, and dedicated to this programme for the full six-week window.

| Role                   | Allocation                                       | Status                       | Responsibility                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Track A — Planner core | 1 fullstack engineer (100%)                      | Existing                     | Plans / tasks / evidence → views / personal hubs → Microsoft 365 sync + admin → linking                                                                                                                        |
| Track B — Agents core  | 2 fullstack engineers (100% each, FE + BE split) | Existing                     | Chat surface → knowledge base + execution modes → admin / governance / reliability → linking                                                                                                                   |
| Track C — Deployment   | 1 DevOps engineer (100%)                         | Existing                     | Staging on AWS → production readiness → hardening + dual-tenant isolation probe                                                                                                                                |
| **QA Engineer**        | 1 FTE (100%)                                     | **To be hired (BOD action)** | Manual testing, exploratory testing, launch-gate verification, regression suite ownership, defect tracking                                                                                                     |
| Business Analyst (BA)  | 0.5 FTE (50%)                                    | Existing                     | Requirements gathering, acceptance-criteria authoring, requirements-to-feature traceability matrix, stakeholder feedback collection during the SETA-internal pilot, documentation / SDLC work stream ownership |
| Scrum Master           | 0.5 FTE (50%)                                    | Existing                     | Sprint planning, retrospectives, impediment removal, velocity tracking, ceremony facilitation                                                                                                                  |

**Total dedicated team:** 4 engineers (4.0 FTE) + 1 QA (1.0 FTE) + 0.5 BA + 0.5 Scrum Master = **6.0 FTE** committed to the programme.

Velocity is planned at AI-leveraged rates; this assumption is unproven for this team and will be re-baselined at every sprint retrospective. Capacity plan is approximately 675 engineering story-points across S3–S6 against approximately 480 story-points of identified MVP work — the slack absorbs unknowns, hardening, and Sprint 6 demo preparation.

### 6.2 Enabling teams — IT & DevOps support

The delivery team relies on SETA's existing IT and DevOps function for one-off and ongoing infrastructure setup. This is enabling support, not a charge against the delivery team's capacity.

| Activity                                                            | Owner           | Window                     |
| ------------------------------------------------------------------- | --------------- | -------------------------- |
| AWS production and staging account provisioning + billing setup     | IT / DevOps     | Pre-kickoff                |
| Networking, DNS, certificate management (Route 53, ACM)             | IT / DevOps     | Pre-kickoff and S1         |
| Microsoft 365 sandbox tenant provisioning + Entra ID configuration  | IT              | Pre-kickoff (≤ 2026-04-22) |
| Identity provider (Microsoft Entra) administrative consent + scopes | IT              | Pre-kickoff and S5         |
| Shared Terraform module library, IAM baseline, security policies    | DevOps (shared) | Pre-kickoff                |
| Secrets-rotation runbook validation                                 | DevOps (shared) | S4–S5                      |
| Production cutover support (deployment day)                         | DevOps (shared) | Post-MVP                   |

The Board is asked to confirm IT & DevOps engagement on these activities so the in-team DevOps engineer (Track C) is not single-handedly building shared infrastructure capabilities.

### 6.3 Roles required from outside the delivery team

| Role                       | Holder                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Board Sponsor              | _<to be named by BOD>_                                                                                                                                    |
| Senior Manager Accountable | _<Programme Director / Head of Engineering — to be named>_                                                                                                |
| Reporting cadence          | End-of-sprint demo + retrospective (weekly, run by Scrum Master); Board updates after Sprint 3 retrospective (2026-05-13) and after MVP demo (2026-06-02) |

### 6.4 Acknowledged staffing constraints

- **QA hire is a critical-path dependency.** The QA Engineer must be onboarded by the start of Sprint 3 (2026-05-07) at the latest to own launch-gate verification and the manual regression suite from S3 onward. Earlier onboarding is preferred.
- **BA at 50% is tight given the breadth of cross-module requirements work.** If feedback collection from the SETA-internal pilot is heavy in Sprints 4–5, the Board may need to authorise an uplift to 100% for the second half of the programme.
- **People + Web Admin work streams (~11 tickets combined) have no dedicated engineering owner.** These will fold into Tracks A and B as backlog pull; if velocity is constrained, the Board may direct additional engineering capacity.
- **Single-engineer Planner track remains a bus-factor risk.** Mitigated by reviewer-named-on-every-PR discipline; the Board may direct addition of a second engineer to Track A for the Sprint 5 Microsoft-sync work if velocity allows.
- **No new hires beyond the QA Engineer are planned for Phase-1.** Hiring lead time exceeds the MVP window for any other role; further staffing decisions are for Phase-1.5 onward.

---

## 7. Strategic Alignment

| SETA Strategic Pillar   | How Future Contributes                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| AI-First Transformation | Agent runtime + canonical kernel is the architectural moat that incumbents (MISA, Base.vn) cannot retrofit onto monolithic legacy stacks |
| Operational Excellence  | Replaces four fragmented apps with one trusted data layer; unblocks cross-functional KPI reporting that cannot be built today            |
| New Revenue Streams     | Vietnamese SaaS market $156–211M today, $849M by 2034 (16.7% CAGR); global Agent-as-a-Service market $43–63B by 2028                     |
| PMO Governance          | Auditable agent decisions, evidence-backed task completion, real-time utilisation visibility                                             |

Customer Zero is SETA itself (~300 staff, real payroll, real delivery). First three external pilot tenants are targeted at 50–150-staff professional-services firms in Q3 2026, conditional on the post-MVP Phase-1 GA gate.

---

## 8. Financial Impact

| Line Item                                                    | Monthly USD        | Status           |
| ------------------------------------------------------------ | ------------------ | ---------------- |
| AWS infrastructure (production $349 + staging $127)          | ~$476              | Budgeted         |
| OpenAI inference (forecast at SETA scale)                    | ~$880              | Budgeted         |
| OpenAI worst-case envelope (with $50/day per-tenant ceiling) | up to ~$1,500      | Budgeted ceiling |
| **Total operating envelope (recommended cap)**               | **~$2,000**        | **Budgeted**     |
| Four-engineer team cost                                      | (existing payroll) | Already approved |

**One-off costs at kickoff:** Microsoft 365 sandbox tenant (zero marginal cost on existing licences); knowledge-base embedding ingestion of SETA corpus (~$0.20 one-off).

**Variance triggers.** A per-tenant spend ≥2× the ceiling over a rolling seven-day window triggers a budget review; ≥3× triggers admin alert and pricing-tier evaluation.

---

## 9. Risk and Mitigation

| #   | Identified Risk                                                                         | Probability | Impact | Mitigation Strategy                                                                                                      |
| --- | --------------------------------------------------------------------------------------- | ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| R1  | AI-leveraged engineering velocity is unproven for this team                             | Medium      | High   | Re-baseline at every sprint retrospective; pre-agreed Phase-1.5 deferral path if velocity below planned rate at Sprint 3 |
| R2  | Microsoft 365 sandbox tenant not provisioned by Sprint 3 Day 2                          | Medium      | High   | **BOD action: authorise IT to provision pre-kickoff (by 2026-04-22)**                                                    |
| R3  | Single-engineer Planner track — bus-factor                                              | Medium      | High   | Reviewer named on every PR; Board may direct second engineer for Sprint 5 sync work                                      |
| R4  | GDPR right-to-erasure deferred from MVP                                                 | Certain     | Medium | External pilot onboarding gated until pipeline ships (Resolution clause ii)                                              |
| R5  | Single-region deployment (ap-southeast-1) blocks data-residency-regulated tenants       | Certain     | Medium | Commercial process flags such prospects at onboarding; multi-region is post-Phase-1                                      |
| R6  | Single AI provider (OpenAI) — provider outage = service outage                          | Low         | High   | Quality canary + model-ladder fallback in MVP; multi-provider abstraction is a future refactor                           |
| R7  | Unstaffed work streams (People + Web Admin + Docs / SDLC = ~19 tickets, no track owner) | High        | Medium | **BOD action: confirm assignment pre-kickoff**                                                                           |
| R8  | No QA role on team — launch-gate verification has no dedicated owner                    | Medium      | Medium | Engineering self-test; contract QA may be added pre-Sprint 5                                                             |
| R9  | Compressed Sprint 6 Linking Sprint (4 calendar days, 3 epics converging)                | Medium      | Medium | Integration smoke tests gated at end of Sprint 5 or Sprint 6 scope contracts further                                     |
| R10 | Overlap with Action Intelligence Platform proposal v2.0 (2026-04-10)                    | Certain     | High   | **BOD action: reconcile / consolidate (Resolution clause iii)**                                                          |

---

## 10. Governance and Compliance

- **Multi-tenancy** — every database table carries a tenant identifier; row-level security enforced at the database layer; a synthetic dual-tenant probe runs continuously from Sprint 4 as a non-negotiable launch gate.
- **Auditability** — every domain mutation writes an audit-event row in the same database transaction as the mutation itself; agent decisions, tool calls, and approvals are fully replayable.
- **Authority model** — explicit role grants, permission inheritance, and time-bound delegation (90-day default, revocable, audited on every use).
- **GDPR posture** — right-to-erasure pipeline is **deferred** from MVP; external pilot onboarding is gated on its delivery (Resolution clause ii). SETA-internal use proceeds on the basis that data subjects are SETA employees under existing privacy notices.
- **AI governance** — per-turn / per-user-per-day / per-tenant-per-day / per-delegation cost ceilings in US dollars; cache-aware accounting; non-bypassable approval floor on bulk and destructive writes; only Phases A and B live at MVP.
- **Infrastructure compliance** — Terraform-only changes; secrets in AWS Secrets Manager; no manual console access; ARM64-only.

---

## 11. Decisions Required from the Board

1. **Approve the Proposed Resolution above.**
2. **Name the Board Sponsor and the Senior Manager Accountable** for the programme.
3. **Confirm the reconciliation approach** for the Action Intelligence Platform proposal v2.0 (consolidate into Future / run in parallel / cancel). This decision unblocks the most consequential ambiguity in the programme.
4. **Authorise IT to provision the Microsoft 365 sandbox tenant** before 2026-04-22 (pre-kickoff dependency).
5. **Confirm assignment** of the unstaffed People + Web Admin + Documentation / SDLC work streams.
6. **Acknowledge the scope cuts** (GDPR erasure, manager dashboards, multi-language UI, multi-provider AI, full People module, other domain modules) as formally deferred.
7. **Acknowledge that 2026-05-31 is the MVP demonstration, not General Availability.** External pilot onboarding is governed by a separate post-MVP gate.

---

## 12. Sign-Off

| Role                        | Name     | Signature | Date       |
| --------------------------- | -------- | --------- | ---------- |
| Chief Executive Officer     | _<name>_ |           | YYYY-MM-DD |
| Board Sponsor               | _<name>_ |           | YYYY-MM-DD |
| Programme Director / Author | _<name>_ |           | YYYY-MM-DD |

**Preparation support:** Engineering leadership; authors of the Architecture, Kernel, Agent runtime, Planner, and Deployment specifications; Product Vision authors.

**Source documents (referenced, available on request):** `docs/product-vision.md`, `docs/architecture/{overview,kernel,application,data-platform,deployment,agents-sad,agents-srs,planner-sad,planner-srs}.md`, `docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md`, `docs/proposal.md` (Action Intelligence Platform v2.0).

---

_Standard followed: IoD Ireland board paper template — explicit Proposed Resolution, Strategic Alignment / Financial Impact / Risk & Mitigation / Governance & Compliance as distinct sections, named Accountability and Oversight, Sign-Off block. Cross-referenced against AICD annotated sample board paper, Corporate Governance Institute board report guide, and PRINCE2 Project Initiation Documentation composition._
