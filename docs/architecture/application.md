# Future — Application Architecture Design

**Date:** 2026-04-08  
**Status:** Agreed  
**Project:** Seta Future AaaS

---

## Purpose

This document captures the agreed application architecture for Future — how domain modules are structured, how the frontend and backend are organized, how modules communicate, and how the system can scale from a small team monolith to independent services without rewriting code.

---

## Core Principles

- **DDD first** — each module is a Bounded Context. Naming matches the ubiquitous language buyers and business people use.
- **Hexagonal architecture within every module** — domain is pure, infrastructure is pluggable.
- **CQRS throughout** — commands and queries are explicitly separated via CommandBus and QueryBus.
- **Facade + Events inter-module contract** — modules expose a read-only `QueryFacade` for cross-module data reads and domain events for state change propagation. No direct service or repository imports across module boundaries.
- **Published Language for events** — all cross-module event contracts live in `packages/event-contracts`. Zero NestJS dependencies. Extracting a module to a separate service requires only a transport swap, no domain code changes.
- **Soft references across modules** — no FK constraints across module schemas. Application layer enforces integrity via facades. Each module's DB is independently extractable.
- **Multi-Zones from day one** — each domain module is an independent Next.js app with its own ECS service and release pipeline. No module deployment ever impacts another module. Deployment isolation is a first-class requirement for an enterprise AaaS product.
- **Shell is routing + auth only** — `web-shell` owns Microsoft SSO (MSAL) and zone routing. Each zone is fully autonomous: renders its own nav chrome, fetches its own session context. No zone has a runtime dependency on `web-shell`.

---

## Module Naming (Ubiquitous Language)

Names are chosen to match industry-standard HR/AaaS product naming — what customers recognize from Rippling, HiBob, Gusto, Personio, etc. Not internal SETA terminology.

| Module      | Canonical Name | Domain Responsibility                                                                                                |
| ----------- | -------------- | -------------------------------------------------------------------------------------------------------------------- |
| Core        | `core`         | Kernel primitives — Actor, Identity, Role, Org, Decision, Audit, Exposure                                            |
| People      | `people`       | Employee profiles, employment terms, org placements, offboarding                                                     |
| Time        | `time`         | Attendance, leave, overtime, timesheets                                                                              |
| Hiring      | `hiring`       | Recruitment requests, candidate pipeline, interviews, offers                                                         |
| Performance | `performance`  | Review cycles, evaluations, feedback, 1:1s                                                                           |
| Projects    | `projects`     | Project staffing, assignments, client delivery tracking                                                              |
| Finance     | `finance`      | Invoices, payroll execution, budget (future)                                                                         |
| Goals       | `goals`        | OKRs, KPIs, objectives, scoring                                                                                      |
| Insights    | `insights`     | Analytics, dashboards, reporting, exports                                                                            |
| Agents      | `agents`       | AI agent configs, execution logs, tool registry                                                                      |
| Planner     | `planner`      | Org-wide task and action tracking, AI-powered reminders, meeting action item extraction (read.ai-style), KPI linkage |
| Admin       | `admin`        | Tenant settings, AI provider config, module entitlements                                                             |

---

## Frontend Architecture — Next.js Multi-Zones

Each domain module is an independent Next.js application. They share one public domain via ALB host-based routing on subdomains of `seta-international.com`. Each zone has its own ECS service, its own ECR repo, and its own GitHub Actions deployment workflow.

**Why from day one:** deploying the Finance module must never risk downtime for People, Time, or any other module. Deployment isolation is a first-class requirement for a multi-tenant AaaS product with enterprise SLA expectations.

```
apps/
  web-shell/       → Navigation, auth, landing — shell.seta-international.com
  web-people/      → People module — people.seta-international.com
  web-time/        → Time module — time.seta-international.com
  web-hiring/      → Hiring module — hiring.seta-international.com
  web-performance/ → Performance module — performance.seta-international.com
  web-projects/    → Projects module — projects.seta-international.com
  web-finance/     → Finance module — finance.seta-international.com
  web-goals/       → Goals module — goals.seta-international.com
  web-insights/    → Insights module — insights.seta-international.com
  web-agents/      → Agents module — agents.seta-international.com
  web-planner/     → Planner module — planner.seta-international.com
  web-admin/       → Admin zone — admin.seta-international.com
```

Each zone is a standalone Next.js app with no `basePath` — each lives at the root of its own subdomain:

```ts
// apps/web-finance/next.config.ts
export default {
  output: 'standalone',
}
```

```ts
// apps/web-admin/next.config.ts
export default {
  output: 'standalone',
}
```

**UX note:** Navigation between zones is a hard reload (full page load). Cross-zone navigation in the shell sidebar uses `<a>` tags, not Next.js `<Link>`. Enterprise users typically live in one module per session — this is an accepted trade-off for deployment isolation.

### Cross-Zone Shell Pattern

**Inspired by how Google Workspace and Microsoft 365 work:** the shell owns auth only. Each app is fully autonomous.

`web-shell` is the **navigation hub** — the home users return to between modules — and owns auth. Four responsibilities:

1. **Navigation hub (`/`)** — authenticated home: module tiles, org switcher, waffle menu, global notification bell. The Microsoft 365 `office.com` equivalent.
2. **Microsoft SSO (MSAL)** — owns the Entra OIDC flow, sets httpOnly session cookie, redirects back to the originally requested zone post-login.
3. **Global search** (future) — cross-module search lives here, not inside any zone.
4. **Global fallback** — ALB `/*` catch-all for any unmatched path.

Each zone is fully self-contained:

```
Zone boots (e.g. web-finance)
  → reads session from httpOnly cookie (SSR via /api/auth/me)
  → renders <GlobalNav /> from packages/ui (same visual shell across all zones)
  → calls trpc.kernel.me.useQuery() to hydrate actor, roles, tenant
  → renders page content
```

`<GlobalNav />` uses plain `<a>` tags for cross-zone navigation — no Next.js `<Link>`, no runtime dependency on other zones.

**Result:**

- `web-shell` outage → users inside any module zone are completely unaffected
- Finance deploys → no other zone restarts, no shared state invalidated
- No `window.__FUTURE__` globals — no hidden coupling between zones

### Shared Packages

```
packages/
  ui/                 → shadcn/ui base design system (overridable per brand direction)
  auth/               → MSAL helpers, useSession hook, token parsing — no React dep
  api-client/         → AppRouter type (re-export only) + tRPC client factory
  event-contracts/    → Cross-module domain event classes (Published Language) — no NestJS dep
  db/                 → Drizzle schema definitions + migration runner
  tsconfig/           → Base tsconfig.json
  eslint-config/      → Shared ESLint rules + eslint-plugin-boundaries
```

**Hard rules:**

- `packages/ui` — no API calls, no auth, pure presentational only
- `packages/api-client` — no React, no UI; type + factory only
- `packages/event-contracts` — no NestJS, no Drizzle; plain TS classes only
- `packages/auth` — no React, no UI; MSAL helpers and session parsing only
- No Tailwind JS config packages — Tailwind v4 is CSS-first; shared tokens go in a shared CSS file imported into each zone's `globals.css`
- Domain-specific types stay inside their module. No `packages/kernel-types` — shared kernel types live in `packages/api-client`

### API Communication — tRPC

Frontend ↔ backend communication is end-to-end type-safe via tRPC. No REST contract drift, no codegen.

**Assembly rule:** `apps/api` assembles the full `AppRouter` (it has the NestJS DI context). `packages/api-client` re-exports only the inferred type — zero runtime code shipped to the frontend.

```ts
// apps/api/src/trpc/app.router.ts — assembled in NestJS app
export const appRouter = router({
  kernel: kernelRouter,
  people: peopleRouter,
  time: timeRouter,
  hiring: hiringRouter,
  performance: performanceRouter,
  projects: projectsRouter,
  finance: financeRouter,
  goals: goalsRouter,
  insights: insightsRouter,
  agents: agentsRouter,
})
export type AppRouter = typeof appRouter

// packages/api-client/src/index.ts — type re-export + client factory only
export type { AppRouter } from '/api'
export { createTRPCClient } from './client'

// Each zone creates its own typed client
// apps/web-finance/src/trpc.ts
import { createTRPCClient, type AppRouter } from '/api-client'
export const trpc = createTRPCClient<AppRouter>({ baseUrl: '/api/trpc' })

// Zone uses only its slice — compile-time safe
const invoice = trpc.finance.getInvoice.useQuery({ id })
```

Each zone connects to `https://api.seta-international.com/trpc` directly via ALB — no routing through `web-shell`.

---

## Backend Architecture — NestJS Modular Monolith

One NestJS application. Domain logic is organized into DDD modules. Each module is a Bounded Context — it owns its own domain model, persistence schema, and has no runtime dependency on other modules' internals.

### Monorepo Backend Structure

```
apps/
  api/                → Single NestJS entry point
    src/
      main.ts
      app.module.ts   → Imports all domain modules
      modules/
        kernel/
        people/
        time/
        hiring/
        performance/
        projects/
        finance/
        goals/
        insights/
        agents/
        admin/
```

### Module Internal Structure (Hexagonal + DDD)

Every module follows the same layout:

```
modules/people/
  domain/
    entities/           → Person, Employment (pure TypeScript — zero NestJS/Drizzle imports)
    value-objects/      → Email, PositionTitle, PhoneNumber
    events/             → Internal events only (NOT cross-module)
    repositories/       → IPeopleRepository (port — interface only)
  application/
    commands/           → HirePersonCommand + handler
    queries/            → GetPersonQuery + handler
    facades/            → PeopleQueryFacade  ← only export visible to other modules
    event-handlers/     → OnCandidateHiredHandler (listens to cross-module events)
  infrastructure/
    repositories/       → DrizzlePeopleRepository (adapter — implements IPeopleRepository)
    schema/             → people.schema.ts (Drizzle table definitions)
    listeners/          → subscribes to events from other modules via EventBus
  interface/
    trpc/               → people.router.ts (contributes to AppRouter)
  people.module.ts      → exports: [PeopleQueryFacade] only
```

**Boundary rules enforced two ways:**

1. `people.module.ts` exports only `PeopleQueryFacade` — NestJS DI enforces this at runtime
2. `eslint-plugin-boundaries` — warns at compile time if any module imports from another module's `domain/` or `infrastructure/`

**What other modules may import from People:**

- `PeopleQueryFacade` (via NestJS DI injection) — read-only queries
- `PersonHiredEvent` (from `packages/event-contracts/people/`) — event subscription

**What other modules may NOT import:**

- Anything from `modules/people/domain/`
- Anything from `modules/people/infrastructure/`
- `DrizzlePeopleRepository` or any Drizzle schema from the people module

---

## Inter-Module Communication — Facade + Events

Two mechanisms, clearly separated:

| Mechanism     | When to use                                      | Direction                   |
| ------------- | ------------------------------------------------ | --------------------------- |
| `QueryFacade` | Module B needs to read data owned by Module A    | Synchronous, request-scoped |
| Domain Events | Module A's state changes and Module B must react | Async, decoupled            |

No direct service imports. No shared repositories across module boundaries.

`AdminQueryFacade` is also available cross-module for reading AI config and module entitlements:

- `getResolvedAiConfig(tenantId)` — tenant override → platform default resolution
- `isModuleEnabled(tenantId, moduleKey)` — used by tRPC middleware before routing

### Event Contracts — Published Language

Cross-module events live in `packages/event-contracts`. Zero NestJS or Drizzle dependencies — plain TypeScript classes only.

```ts
// packages/event-contracts/src/people/person-hired.event.ts
export class PersonHiredEvent {
  static readonly eventName = 'people.person.hired'
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly employmentId: string,
    readonly effectiveDate: Date,
  ) {}
}
```

**Two categories of events:**

| Category            | Location                      | Visibility                     |
| ------------------- | ----------------------------- | ------------------------------ |
| Internal events     | `modules/x/domain/events/`    | Own module only                |
| Cross-module events | `packages/event-contracts/x/` | Any module, any future service |

**Canonical cross-module event catalog** (minimum required for default agents and module wiring):

```
packages/event-contracts/
  people/
    PersonHiredEvent          { tenantId, actorId, employmentId, effectiveDate }
    PersonOffboardedEvent     { tenantId, actorId, effectiveDate }
    OrgPlacementChangedEvent  { tenantId, actorId, newManagerId, newDepartmentId }

  time/
    LeaveApprovedEvent        { tenantId, actorId, leaveRequestId, from, to }
    LeaveRejectedEvent        { tenantId, actorId, leaveRequestId, reason }

  hiring/
    CandidateHiredEvent       { tenantId, actorId, candidateId, startDate }

  projects/
    AssignmentChangedEvent    { tenantId, actorId, projectId, role, effectiveDate }

  performance/
    ReviewCycleCompletedEvent { tenantId, cycleId, completedAt }

  goals/
    KpiScoreSubmittedEvent    { tenantId, actorId, kpiId, score, period }

  finance/
    InvoiceApprovedEvent      { tenantId, invoiceId, approvedBy, amount }

  planner/
    TaskCreatedEvent          { tenantId, actorId, taskId, title, kpiId?, dueDate? }
    TaskCompletedEvent        { tenantId, actorId, taskId, completedAt }

  kernel/
    DecisionCaseResolvedEvent { tenantId, caseId, finalAction, decidedBy }
```

### Event Flow

```
Hiring module:
  CandidateHiredCommand
    → handler writes to DB + outbox_event in same transaction
    → publishes CandidateHiredEvent to in-process EventBus

People module:
  OnCandidateHiredHandler (subscribes via @EventsHandler)
    → creates employment record internally
    → publishes PersonHiredEvent

Kernel module:
  OnPersonHiredHandler
    → writes audit_event record
```

### Event Delivery — Transactional Guarantee

```
1. Command handler: DB write + outbox_event INSERT (same transaction)
2. In-process EventBus: synchronous delivery to all handlers in same process
   → on success: immediately mark outbox_event.status = 'delivered'
3. Outbox relay worker (every 5s, FOR UPDATE SKIP LOCKED):
   → picks up rows WHERE status = 'pending' (only undelivered — process crash recovery)
   → re-publishes to EventBus
   → marks delivered, pruned after 7 days
```

Background jobs (emails, notifications, scheduled tasks) use **pg-boss** — separate from outbox_event.

### Event Handler Idempotency — Required

**Rule:** All cross-module event handlers MUST be idempotent. The outbox pattern provides at-least-once delivery. Handlers will execute more than once in crash-recovery scenarios even with the `delivered` status optimization above.

**Implementation pattern — use upsert, never blind insert:**

```ts
// ❌ WRONG — creates duplicate on re-delivery
@EventsHandler(CandidateHiredEvent)
export class OnCandidateHiredHandler {
  async handle(event: CandidateHiredEvent) {
    await this.peopleRepo.insert({ actorId: event.actorId, ... })
  }
}

// ✓ CORRECT — idempotent via conflict handling
@EventsHandler(CandidateHiredEvent)
export class OnCandidateHiredHandler {
  async handle(event: CandidateHiredEvent) {
    await this.peopleRepo.upsert(
      { actorId: event.actorId, ... },
      { onConflict: 'actorId', updateSet: { updatedAt: new Date() } }
    )
  }
}
```

**Idempotency key:** `outbox_event.id` is the universal idempotency key. Before any cross-module event handler runs its business logic, it checks `core.processed_events(event_id, handler_name)`. If the row exists, the handler exits immediately — no-op. If not, it inserts the row and proceeds. This is a single check against a kernel-owned dedup table, applied uniformly to every handler.

```ts
// ✓ CORRECT — universal idempotency check before handler logic
@EventsHandler(CandidateHiredEvent)
export class OnCandidateHiredHandler {
  async handle(event: CandidateHiredEvent) {
    const alreadyProcessed = await this.kernelQuery.isEventProcessed(
      event.outboxEventId,
      OnCandidateHiredHandler.name
    )
    if (alreadyProcessed) return

    await this.peopleRepo.upsert(
      { actorId: event.actorId, ... },
      { onConflict: 'actorId', updateSet: { updatedAt: new Date() } }
    )

    await this.kernelQuery.markEventProcessed(event.outboxEventId, OnCandidateHiredHandler.name)
  }
}
```

`core.processed_events` schema:

```sql
processed_events
  event_id      UUID NOT NULL   -- outbox_event.id
  handler_name  TEXT NOT NULL   -- handler class name
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  PRIMARY KEY (event_id, handler_name)
```

### Microservice Extraction Path

When a module is extracted to its own service:

1. `packages/event-contracts` stays unchanged — same event class, same schema
2. Transport swap: replace in-process `EventBus.publish()` with BullMQ producer (Redis already in stack)
3. Handler swap: replace `@EventsHandler` with BullMQ consumer
4. Domain, application, and facade code: **zero changes**

```ts
// This handler works in monolith AND as a separate service
@EventsHandler(PersonHiredEvent) // ← swap decorator only for microservice
export class OnPersonHiredHandler implements IEventHandler<PersonHiredEvent> {
  async handle(event: PersonHiredEvent) {
    await this.timeService.createDefaultLeaveBalance(event.actorId)
  }
}
```

---

## Database Strategy — Schema-per-Module

One PostgreSQL instance. Each module owns its own schema. No cross-schema foreign keys at the application layer — modules join across schemas only in read models and analytics projections.

```
PostgreSQL (single RDS instance)
  Schema: core         → tenant, actor, user_identity, external_identity_map,
                          department, role_grant, delegation, org_placement,
                          decision_case, decision_step, decision_outcome,
                          audit_event, outbox_event,
                          visibility_scope, exposure_contract
  Schema: people       → person_profile, employment_term, emergency_contact, ...
  Schema: time         → attendance_record, leave_request, overtime_entry, ...
  Schema: hiring       → recruitment, candidate, application, interview_schedule, ...
  Schema: performance  → review_cycle, evaluation, reviewer_assignment, ...
  Schema: projects     → project, project_member, assignment, ...
  Schema: finance      → invoice, payroll_run, budget_item, ...
  Schema: goals        → objective, key_result, kpi_score, ...
  Schema: insights     → no persistent tables; all queries proxied to Cube.js (see Data Platform Design)
  Schema: agents       → agent_config, execution_log, tool_registry, ...
  Schema: planner      → task, task_assignment, task_tag, reminder, meeting_action_item, ...
```

### Cross-Module References — Soft Only

No FK constraints across module schemas. Application layer enforces integrity.

```ts
// people module references kernel actor — soft reference, no .references()
export const employment = pgTable('employment', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(), // ← validated by PeopleCommandHandler via KernelQueryFacade
})

// Within a module — hard FK is fine (never crosses boundary)
export const decisionStep = pgTable('decision_step', {
  caseId: uuid('case_id')
    .notNull()
    .references(() => decisionCase.id), // ← same module
})
```

**Rule:** hard FKs within a module boundary. Soft references across module boundaries. Each module's tables are independently extractable to a separate DB.

### Cross-Module FK Validation Contract (Required)

**Every command handler that references an entity from another module MUST validate the reference via the appropriate QueryFacade before writing.**

```ts
// ✓ REQUIRED PATTERN — validate cross-module reference before write
@CommandHandler(SubmitLeaveRequestCommand)
export class SubmitLeaveRequestHandler {
  constructor(
    private readonly kernelQuery: KernelQueryFacade,
    private readonly timeRepo: ITimeRepository,
  ) {}

  async execute(command: SubmitLeaveRequestCommand) {
    // Step 1: Validate cross-module actor reference (throws if not found or archived)
    const actor = await this.kernelQuery.getActor(command.actorId, command.tenantId)
    if (!actor || actor.status === 'archived') {
      throw new ActorNotFoundException(command.actorId)
    }

    // Step 2: Write (actor reference is now validated)
    await this.timeRepo.insert({
      actorId: command.actorId,
      tenantId: command.tenantId,
      ...
    })
  }
}
```

**Rule:** Never write a cross-module reference (actorId, projectId, departmentId) without first calling the relevant QueryFacade. The QueryFacade call is the enforcement point. If it throws or returns null, the command must fail — not silently continue with a dangling reference.

This applies to every module. The `eslint-plugin-boundaries` rule enforces import boundaries; this rule enforces data integrity. Both are required.

### Multi-Tenancy

See **Architecture Overview — Multi-Tenancy Contract** for the canonical definition.

Summary: `tenant_id` on every table, RLS enforced at DB layer via `set_config`, nestjs-cls middleware per request. All IDs: UUID v7.

### Why Drizzle over Prisma

|               | Drizzle                             | Prisma                             |
| ------------- | ----------------------------------- | ---------------------------------- |
| Bundle size   | ~7.4 KB                             | ~1.6 MB                            |
| RLS support   | Native (set_config + RLS policies)  | Requires middleware workarounds    |
| Type safety   | TypeScript-native SQL builder       | Generated client                   |
| Query control | Full SQL when needed                | Abstracted, escape hatches limited |
| Migration     | SQL migrations (version controlled) | Prisma migrate                     |

---

## Full Monorepo Layout

```
future/                          (Turborepo root)
  apps/
    api/                        → NestJS modular monolith
      src/
        modules/
          kernel/               → tenant, actor, identity, role, delegation, org, decision, outbox
          people/               → employment, profiles, departments
          time/                 → attendance, leave, OT
          hiring/               → jobs, candidates, pipeline
          performance/          → review cycles, evaluations
          projects/             → staffing, assignments
          finance/              → invoices, payroll
          goals/                → OKRs, KPIs
          insights/             → Cube.js proxy, analytics queries
          agents/               → agent configs, execution, MCP
          planner/              → tasks, reminders, meeting action items, KPI linkage
          admin/                → tenant settings, AI provider config, entitlements
        trpc/
          app.router.ts         → assembles all module routers into AppRouter
        main.ts
    web-shell/                  → MSAL auth + zone routing only (thin)
    web-people/                 → basePath: /people
    web-time/                   → basePath: /time
    web-hiring/                 → basePath: /hiring
    web-performance/            → basePath: /performance
    web-projects/               → basePath: /projects
    web-finance/                → basePath: /finance
    web-goals/                  → basePath: /goals
    web-insights/               → basePath: /insights
    web-agents/                 → agents.seta-international.com
    web-planner/                → planner.seta-international.com
    web-admin/                  → admin.seta-international.com (tenant_admin + platform_admin)
  packages/
    ui/                         → shadcn/ui base design system (overridable)
    auth/                       → MSAL helpers, useSession, token parsing
    api-client/                 → AppRouter type re-export + tRPC client factory
    event-contracts/            → Cross-module domain events (Published Language, no NestJS)
    db/                         → Drizzle schema definitions + migration runner
    tsconfig/                   → Base tsconfig.json
    eslint-config/              → Shared ESLint + eslint-plugin-boundaries
  infra/
    terraform/                  → vpc, alb, ecs-cluster, ecs-service, rds, redis, ecr, secrets
  docs/
    superpowers/specs/
    legacy/
  turbo.json
  bun.lockb
  package.json
```

**Turborepo pipeline:**

```json
{
  "build": { "dependsOn": ["^build"] },
  "typecheck": { "dependsOn": ["^build"] },
  "lint": {},
  "dev": { "cache": false, "persistent": true }
}
```

Independent zone deployment: `turbo build --filter=web-finance` builds only Finance zone and its package dependencies.

---

## Decisions Log

| Decision                      | Outcome                                                                                                                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend architecture         | Next.js Multi-Zones — 10 independent zones + shell, each own ECS service                                                                                                                                                           |
| Shell responsibility          | Navigation hub (landing, module tiles, waffle, org switcher) + MSAL auth + zone routing                                                                                                                                            |
| Session context in zones      | Each zone calls `trpc.kernel.me` on mount — typed, cached, no globals                                                                                                                                                              |
| In-zone nav chrome            | `<GlobalNav />` from `packages/ui` with plain `<a>` tags — no runtime dep on shell                                                                                                                                                 |
| tRPC assembly                 | `apps/api` assembles AppRouter explicitly in `apps/api/src/trpc/app.router.ts` — each module exports its router, imported and merged directly. No auto-discovery.                                                                  |
| Module boundary enforcement   | NestJS `exports: [QueryFacade]` (runtime) + eslint-plugin-boundaries (compile-time)                                                                                                                                                |
| Module internal structure     | domain / application (commands, queries, facades, event-handlers) / infrastructure / interface                                                                                                                                     |
| Cross-module communication    | QueryFacade (reads) + domain events (state changes)                                                                                                                                                                                |
| Cross-module events location  | `packages/event-contracts` — Published Language, zero NestJS deps                                                                                                                                                                  |
| Internal events location      | `modules/x/domain/events/` — never exported outside the module                                                                                                                                                                     |
| Cross-module FK               | Soft references only — no FK constraints across module schemas                                                                                                                                                                     |
| Within-module FK              | Hard FK constraints — safe, never crosses boundary                                                                                                                                                                                 |
| All IDs                       | UUID v7 — `$defaultFn(() => uuidv7())`                                                                                                                                                                                             |
| Design system                 | shadcn/ui base in `packages/ui`, overridable per brand direction                                                                                                                                                                   |
| Microservice extraction       | Transport swap only (EventBus → BullMQ). Domain/handler code unchanged.                                                                                                                                                            |
| Admin zone                    | `web-admin` at `admin.seta-international.com` — self-service portal for tenant admins; platform_admin role unlocks all-tenant view                                                                                                 |
| AdminQueryFacade              | Cross-module read interface for AI config resolution and module entitlement checks                                                                                                                                                 |
| Event handler idempotency key | `outbox_event.id` — universal dedup key checked against `core.processed_events(event_id, handler_name)` before every cross-module handler                                                                                          |
| Frontend zone routing         | Subdomain-per-zone on `*.seta-international.com`. Cookie: `Domain=.seta-international.com; HttpOnly; Secure; SameSite=Lax`                                                                                                         |
| Drizzle migration strategy    | Hybrid: single `drizzle.config.ts` in `packages/db`; migrations organized by schema in `drizzle/migrations/{schema}/`; `_metadata.json` defines dependency graph; NestJS `MigrationRunner` applies in topological order at startup |

---

## Next

Layer 3 — Data Platform: analytics pipeline, read models, reporting infrastructure, path to KPI dashboards and agent memory.
