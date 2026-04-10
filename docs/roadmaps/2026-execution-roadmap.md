# Future — 2026 Execution Roadmap

**Date:** 2026-04-08  
**Status:** Draft for review  
**Project:** Seta Future AaaS  
**Time Horizon:** 2026-04-08 to 2026-12-31  
**Audience:** Build team and delivery leadership

---

## Companion Document

- [2026 Master Roadmap](./2026-master-roadmap.md)

---

## Purpose

This is the operating roadmap for the build team.

It translates the 2026 master roadmap into:

- execution workstreams
- dependency order
- cutover sequence
- proof gates
- retirement gates for the legacy stack

This document assumes the 2026 master roadmap is the governing source for business outcome and milestone intent.

---

## Hard Constraints

| Constraint | Execution implication |
|---|---|
| 4 dedicated builders | Keep critical paths narrow. Avoid six-way parallelism. |
| Docs-only starting point | Q2 is foundation-heavy. There is no hidden codebase to save us. |
| Hard deadline: 2026-12-31 | Roadmap must optimize for cutover certainty, not optional breadth. |
| Internal-first year | External GTM and partner packaging are out of scope. |
| Full legacy replacement | Every major legacy workflow needs a destination and a retirement gate. |
| Full data platform from day one | The lakehouse (S3, Glue ETL, Iceberg, Athena) ships in initial infra — not as a later upgrade. |
| Agent tiers A-D by year-end | Agent rollout must be gated and narrow, not magical. |

---

## Execution Laws

1. **No module is "green" until a real SETA workflow has cut over.**
2. **No agent autonomy expands without audit visibility, human override, and measured accuracy.**
3. **No legacy app is retired on vibes.** Retirement needs data parity, workflow parity, and operator sign-off.
4. **No Q4 heroics built on Q2 indecision.** The key architecture and tooling choices must close by the end of Q2.

---

## Critical Path

```text
Foundation and infra (including data platform infrastructure)
  ->
Kernel and canonical identity
  ->
Migration mapping and data import spine
  ->
Core modules online (People, Time, Hiring, Projects)
  ->
Insights on real internal data + Agent Tiers A-B
  ->
First major cutovers (Timesheet, Hiring, core People flows)
  ->
Remaining modules online (Performance, Finance, Goals)
  ->
Athena lakehouse fully serving Cube.js analytics
  ->
Agent Tier C
  ->
Final EMS / Resource Insight cutover
  ->
Agent Tier D for selected internal monitoring
  ->
Legacy shutdown
```

If any stage slips badly, everything to the right becomes fake.

---

## Recommended Workstreams

### Workstream 1: Platform Foundation

**Scope**

- monorepo setup
- shared packages
- auth and tenant context
- core kernel primitives
- infra, CI/CD, environments
- event spine and audit basics

**Why it exists**

This is the load-bearing path. Every later module depends on it.

### Workstream 2: Operational Replacement

**Scope**

- People
- Time
- Hiring
- Projects
- workflow migration from EMS, Timesheet, and Hiring App

**Why it exists**

This is where the first real cutovers happen.

### Workstream 3: Control and Performance Surface

**Scope**

- Performance
- Goals
- Finance
- remaining EMS and Resource Insight workflows

**Why it exists**

This closes the breadth required for full internal replacement.

### Workstream 4: Intelligence Layer

**Scope**

- Insights
- Data platform: Glue ETL jobs, S3 Bronze/Gold, Iceberg tables, Athena, Cube.js (both data sources)
- agent runtime and channel delivery (Web Chat, Teams, Slack)
- observability for agent behavior (Langfuse)

**Why it exists**

Future is not just a replacement admin system. The intelligence layer is part of the product promise and part of the 2026 commitment. The data platform runs from initial deployment — there is no separate stand-up milestone for it.

---

## Legacy Decomposition

The build must not treat the legacy systems as indivisible monoliths.

| Legacy source | Workflow family | Target module(s) |
|---|---|---|
| EMS | employee master data, org placement, role governance | Core, People |
| EMS | account, project, staffing, assignment visibility | Projects, People |
| EMS | contracts, offboarding, partner/webhook governance | People, Finance, Core |
| Timesheet App | attendance, leave, schedules, approval flows | Time |
| Hiring App | recruitment demand, candidates, interviews, reports | Hiring |
| Resource Insight | review cycles, evaluations, performance history, org/project views | Performance, Goals, Projects |

This matters because the cutover plan is by workflow family, not by "rewrite EMS last."

---

## Decisions That Must Close By End of Q2

These are not nice-to-have discussions. They are schedule protectors.

| Decision | Recommended 2026 position | Why |
|---|---|---|
| Agent Builder depth | Minimal internal admin builder only | Full visual builder is not needed for internal replacement |
| Teams integration path | Single-tenant Azure Bot Service + admin-approved sideload | Multi-tenant bot creation deprecated by Microsoft July 2025 |
| Embedding strategy | Multilingual model, selected once in Q2 | Avoid reindex churn later in the year |
| External API strategy | Internal tRPC first, explicit REST only where replacement requires it | Keep build surface focused |
| Core event projection model | Core subscribes to explicit domain events | Keeps module boundaries clean |
| Migration runner | Unified migration entrypoint | Reduces schema drift and ops confusion |
| Data export path | AWS Glue ETL (hourly batch, ~$2/month) | Single pipeline: RDS → S3 Bronze → S3 Gold Iceberg → Athena |
| Terraform bootstrap | Dedicated `infra/bootstrap/` module | Removes day-one infra ambiguity |
| Langfuse timing | Live before Agent Tier C | Proposal and monitoring tiers need full trace visibility |

---

## Capacity Model

With 4 builders, recommended allocation by period:

| Period | Suggested allocation |
|---|---|
| Remaining Q2 | 2 on foundation + data platform infra, 1 on migration mapping + seed imports, 1 on Insights + agent scaffolds |
| Q3 | 1 on foundation/core hardening, 2 on module replacement, 1 on insights/agents |
| Q4 | 1 on cutover + ops hardening, 2 on remaining modules, 1 on Athena lakehouse + agents |

This is a planning shape, not a fixed org chart. The point is to keep one person always holding the cross-cutting platform line.

---

## Remaining Q2 2026: Foundation and Migration Truth

### Objectives

- stand up the repo, environments, delivery path, and shared packages
- implement the kernel baseline
- establish canonical identity and tenant context
- define the migration and parity model for all 4 legacy systems
- stand up the full data platform infrastructure
- start the intelligence layer in the smallest useful way

### Build Focus

#### Platform Foundation

- monorepo structure aligned to the architecture docs
- Next.js multi-zone skeleton and NestJS API shell
- staging and production infra skeleton
- auth, SSO callback flow, tenant resolution, and base RBAC path

#### Kernel

- actor, user identity, external identity map
- role grant and org placement
- decision envelope baseline
- audit event baseline
- outbox/event spine baseline

#### Migration Backbone

- legacy entity inventory and mapping rules
- canonical ID strategy
- import jobs for at least one representative slice from each legacy system
- parity checklist for each workflow family

#### Data Platform and Intelligence Layer

- Glue ETL job wired to staging RDS module schemas
- S3 Bronze and Gold buckets created with correct prefixes
- Glue Data Catalog databases (`future_bronze`, `future_gold`) defined
- Athena workgroup and query path verified
- Cube.js bootstrapped with both data sources configured: RDS read replica (operational) and Athena (historical)
- pgvector memory scaffold
- first agent runtime path in development mode

### Exit Criteria

- staging environment is live
- SETA tenant exists in staging
- first authenticated user can log in and resolve org/role context through Future
- a decision case can be created and audited end to end
- at least one imported entity from each legacy system lands in canonical form
- Glue ETL runs successfully against staging RDS and lands data in S3 Bronze
- Cube.js can serve a basic query from both data sources
- the build team can demonstrate a governed read path from Future, not just static screens

### Kill Shots to Avoid

- spending Q2 on polished UI before migration truth exists
- deferring schema and event decisions into Q3
- inventing custom logic in modules that belongs in the kernel
- treating the data platform as a Q4 concern

---

## Q3 2026: Core Replacement

Q3 has two jobs:

1. make Future operational for high-frequency internal workflows  
2. retire the first legacy systems

### Milestone 2 Window: 2026-07-01 to 2026-08-15

#### Objectives

- bring People, Time, Hiring, and Projects online
- deliver Insights on real internal data via Cube.js
- ship Agent Tier A into real internal use

#### Build Focus

- People: employee profile, employment terms, org placement, manager resolution
- Time: attendance, leave, overtime, schedule, approval chain
- Hiring: recruitment, candidate pipeline, interview operations, reporting baseline
- Projects: assignments, staffing visibility, project roster and health basics
- Insights: standard dashboards via Cube.js (operational queries via RDS replica, trend queries via Athena)
- Agent Tier A: policy Q&A, org lookup, read-only workflow assistance

#### Exit Criteria

- controlled internal user group can perform core People, Time, and Hiring workflows in Future
- Future outputs are being compared against legacy results in shadow mode
- leadership can see basic cross-functional dashboards in Future
- agent Q&A is reading governed internal context, not a toy dataset

### Milestone 3 Window: 2026-08-16 to 2026-09-30

#### Objectives

- complete Timesheet App replacement
- complete Hiring App replacement
- start real EMS displacement
- bring Agent Tier B online

#### Build Focus

- close all Time replacement gaps
- close all Hiring replacement gaps
- deepen People + Projects where EMS workflows are still load-bearing
- bring Performance v1 online to start Resource Insight displacement
- ship Agent Tier B for data and insight workflows

#### Exit Criteria

- Timesheet App is read-only or retired
- Hiring App is read-only or retired
- high-frequency People flows no longer require EMS
- at least one meaningful Performance workflow is live in Future
- internal users trust Future enough that legacy fallback is exception-only for the migrated workflows

---

## Q4 2026: Complete Replacement

Q4 is not for inventing a second roadmap. It is for closing the gaps, hardening cutovers, and turning the old systems off.

### Milestone 4 Window: 2026-10-01 to 2026-11-15

#### Objectives

- complete the full internal module surface
- fully activate the Athena lakehouse path for Cube.js analytics
- bring Agent Tier C online

#### Build Focus

- Performance: complete review-cycle and evaluation replacement
- Finance: internal v1 for the finance workflows required to retire EMS dependencies
- Goals: KPI and OKR v1 tied to the same canonical data layer
- remaining EMS slices: contracts, offboarding, partner/webhook governance, remaining access/governance flows
- Athena lakehouse: validate Cube.js is fully serving historical and trend analytics from S3 Gold Iceberg; decommission any remaining fallback to RDS replica for historical queries
- Agent Tier C: human-approved action proposals in tightly scoped workflows

#### Exit Criteria

- Resource Insight replacement is complete
- all seven modules exist in production with the required internal v1 depth
- Cube.js serves all Insights queries from Athena for historical data, RDS replica for operational data
- agent proposals operate with traceability and approval controls

### Milestone 5 Window: 2026-11-16 to 2026-12-31

#### Objectives

- finish final EMS displacement
- decommission all legacy systems
- bring Agent Tier D online for selected monitoring workflows

#### Build Focus

- shutdown readiness reviews per legacy system
- final data reconciliation and operator sign-off
- cutover support and issue burn-down
- Agent Tier D for anomaly detection, monitoring, and exception routing on narrow internal scopes
- rollback drill and decommission checklist closure

#### Exit Criteria

- EMS retired
- Timesheet App retired
- Hiring App retired
- Resource Insight retired
- Future is the primary system of record for internal operations
- agent monitoring is active on selected internal flows with alerting, logs, and human override

---

## Module Target Order

| Module | First meaningful production target | Dependency notes |
|---|---|---|
| Core | Q2 | Everything depends on it |
| People | Q3 early | Needed for EMS displacement and identity truth |
| Time | Q3 early | First major cutover candidate |
| Hiring | Q3 early | First major cutover candidate |
| Projects | Q3 early | Needed for staffing and delivery visibility |
| Performance | Q3 late | Needed for Resource Insight displacement |
| Finance | Q4 | Needed for final EMS replacement depth |
| Goals | Q4 | Depends on canonical data and insights maturity |
| Insights | Q3 (live on real data) | Cube.js wired to both data sources from Q2; dashboards live as modules ship data |
| Agents | Q3 for A-B, Q4 for C-D | Depends on core governance and data trust |

---

## Agent Rollout Plan

| Tier | Timing | 2026 scope |
|---|---|---|
| Tier A: Knowledge and Q&A | Q3 early | policy Q&A, org lookup, read-only explanation |
| Tier B: Data and Insights | Q3 late | KPI lookups, summaries, analytic support over trusted internal data |
| Tier C: Action Proposals | Q4 early | draft actions and approvals in narrow workflows, always human-approved |
| Tier D: Autonomous Monitoring | Q4 late | anomaly detection and scheduled monitoring for selected internal operational flows |

### Gating Rule

Each tier unlocks only after the prior one is operating on real internal usage with auditability and operator trust. No tier skip.

---

## Data Platform

The data platform runs from initial deployment. There is no transitional phase.

| Component | Status from day one | Notes |
|---|---|---|
| RDS Read Replica | Operational queries, last 30 days | Cube.js data source 1 |
| Glue ETL (hourly batch) | Runs against all module schemas | ~$2/month, 60-min lag acceptable |
| S3 Bronze | Parquet snapshots per module table | Partitioned by `etl_date` |
| S3 Gold (Iceberg) | Merged, deduplicated Iceberg tables | Cube.js data source 2 via Athena |
| Athena | Historical and trend queries | Backed by `future_gold` Glue catalog |
| Cube.js | Semantic layer with explicit routing | Operational → RDS replica; Historical → Athena |

The semantic layer contract is stable from initial deployment. Adding more data to Athena does not require product changes to Insights.

---

## Legacy Retirement Gates

No legacy system is retired until all of the following are true:

1. its target workflows are live in Future
2. key data has been migrated and reconciled
3. the owning operators sign off
4. audit and approval behavior is acceptable in Future
5. there is a documented rollback path for the cutover window
6. the legacy system can move to read-only without breaking the business
7. the rollback path has been rehearsed and is only used during the cutover window

---

## Suggested Legacy Shutdown Sequence

| System | Target retirement window | Why this order |
|---|---|---|
| Timesheet App | By 2026-09-30 | Narrowest high-frequency operational wedge |
| Hiring App | By 2026-09-30 | Distinct workflow family, good early proof system |
| Resource Insight | By 2026-11-15 | Depends on Performance and Goals maturity |
| EMS | By 2026-12-31 | Broadest and messiest, should retire last |

---

## 2026 Not in Scope for Execution

- external pilot tenants
- self-serve onboarding
- generalized marketplace or plugin ecosystem
- full visual Agent Builder
- multi-region production
- optional polish work that does not change internal cutover readiness

---

## Review Questions for Every Milestone

At each milestone, the team should ask:

1. Which real workflows moved off legacy this period?
2. Which legacy write surfaces can now be frozen?
3. What remains on the critical path to full replacement?
4. Which risks are still architectural, and which are now operational?
5. Are agents earning more trust, or are we just widening scope?

If those answers are weak, the roadmap is drifting.
