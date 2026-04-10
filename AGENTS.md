## Project Overview

**Future** is an agent-native enterprise operating system being built by SETA. It replaces four fragmented internal apps (EMS, Timesheet, Hiring, Resource Insight) with a unified platform that has a canonical data layer and an embedded AI agent ecosystem. SETA is customer zero (300+ person org). The platform will be commercialized for Vietnamese SMEs and globally.

This repository is currently **documentation-only** — all specs are agreed and the build team is starting from scratch in Q2 2026. The monorepo codebase described in the specs does not yet exist.

---

## Repository Structure

```
docs/
  architecture/
    overview.md                          — visual companion + solution architecture diagram
    kernel.md                            — kernel design (source of truth for core schema)
    application.md                       — application architecture (frontend + backend)
    data-platform.md                     — analytics pipeline, lakehouse, agent memory
    agent-runtime.md                     — agent platform, MCP tools, channels, guardrails
    deployment.md                        — AWS infrastructure, ECS topology, CI/CD
  engineering/
    tech-stack.md                        — every technology choice with versions
    testing-strategy.md                  — test pyramid, patterns, CI matrix
    project-rules.md                     — non-negotiables, naming conventions, checklists
  product-vision.md                      — executive vision and market rationale
  roadmaps/
    2026-master-roadmap.md               — business milestones and outcome gates
    2026-execution-roadmap.md            — build team operating roadmap (workstreams, sequencing)
  legacy/                                — documentation of the four apps being replaced
    ems/ timesheet-app/ hiring-app/ resource-insight/
  superpowers/specs/                     — design specs
```

---

## Architecture: The Big Picture

### Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js Multi-Zones (11 independent zones + shell) |
| Backend | NestJS modular monolith (Turborepo monorepo) |
| API communication | tRPC (end-to-end type-safe) |
| Database | PostgreSQL 16 (Drizzle ORM, schema-per-module, RLS) |
| Background jobs | pg-boss |
| Event delivery | Custom `outbox_event` + polling relay |
| Analytics | AWS Glue ETL → S3 Bronze → S3 Gold (Iceberg) → Amazon Athena → Cube.js semantic layer |
| Agent AI | Vercel AI SDK + OpenAI API (`gpt-5.4-nano` for classification, `gpt-5.4` for reasoning, `text-embedding-3-small` for embeddings) |
| Agent observability | Langfuse (self-hosted on ECS) |
| Infrastructure | AWS ECS Fargate (Graviton ARM64), Terraform, ap-southeast-1 |
| Auth | Microsoft Entra OIDC (MSAL) |

### Process Kernel (`core` schema)

The kernel is the single source of truth that every module, agent, and integration builds on top of. It owns:

- **Actor** — canonical identity for people, organizations, and system actors (AI agents, bots, devices). Three types: `person | organization | system`.
- **user_identity** — login record + Microsoft SSO link (`sso_subject` = Entra OID)
- **external_identity_map** — bridges to legacy system IDs (EMS, Timesheet, biometric) and external systems (Slack, Teams). Canonical `actor_id` is always the join key — never external IDs.
- **department** — kernel-owned org dimension. People module writes it; all modules reference it.
- **role_grant** — what an actor can do. Scoped to global | department | project | account.
- **delegation** — time-bounded authority transfer (e.g. manager on leave). Auto-expires. Decision routing checks delegations first, then falls back to role_grant.
- **org_placement** — full temporal history of where a person sits. Query `effective_until IS NULL` for current; point-in-time with date range.
- **decision_case / decision_step / decision_outcome** — shared approval envelope for all workflows (leave requests, contract approvals, KPI scores, etc.). Modules own the state machine; kernel owns the decision record and authority trace.
- **audit_event** — immutable, INSERT-only event log. Never deleted. The system's permanent memory.
- **outbox_event** — transactional delivery queue written in the same DB transaction as business ops. Pruned after 7 days.
- **visibility_scope / exposure_contract** — deny-by-default access control. Every agent action must have a valid `exposure_contract`.

**Multi-tenancy:** all tables carry `tenant_id`. PostgreSQL RLS enforces isolation at the DB layer via `set_config` + per-request tenant context (nestjs-cls). Shared database, schema-per-module architecture.

**All IDs:** UUID v7 — `$defaultFn(() => uuidv7())` in Drizzle. Time-ordered, enables cursor-based pagination.

**`KernelQueryFacade`** is the only cross-module import allowed from the kernel. No module imports kernel repositories or entities directly.

### Domain Modules

| Module | Schema | Responsibility |
|---|---|---|
| `kernel` | `core` | Identity, authority, decisions, events, exposure |
| `people` | `people` | Employment profiles, org placements, offboarding |
| `time` | `time` | Attendance, leave, OT, timesheets |
| `hiring` | `hiring` | Recruitment, candidate pipeline, interviews, offers |
| `performance` | `performance` | Review cycles, evaluations, feedback |
| `projects` | `projects` | Project staffing, assignments, delivery tracking |
| `finance` | `finance` | Invoices, payroll, budget |
| `goals` | `goals` | OKRs, KPIs, objectives, scoring |
| `insights` | `insights` | Analytics proxy to Cube.js — no persistent tables |
| `agents` | `agents` | Agent configs, sessions, messages, tool registry |
| `planner` | `planner` | Org-wide task tracking, AI reminders, meeting action item extraction, KPI linkage |
| `admin` | `admin` | Tenant settings, AI provider config, module entitlements |

### Module Internal Structure (Hexagonal + DDD)

Every module follows this layout:
```
modules/people/
  domain/           → pure TypeScript entities, value-objects, ports (interfaces) — zero NestJS/Drizzle imports
  application/      → commands, queries, facades (only export visible to other modules), event-handlers
  infrastructure/   → Drizzle repositories (adapters), schema, listeners
  interface/trpc/   → contributes to AppRouter
  people.module.ts  → exports: [PeopleQueryFacade] ONLY
```

**Boundary rules:** `eslint-plugin-boundaries` at compile time + NestJS DI at runtime. No module may import from another module's `domain/` or `infrastructure/`. Cross-module communication is:
1. **QueryFacade** — synchronous reads (e.g. `PeopleQueryFacade`)
2. **Domain events** in `packages/event-contracts` — async state change propagation (plain TS classes, zero NestJS deps)

**Cross-module FK:** soft references only (no `.references()` across schemas). Within a module: hard FK constraints are fine.

### Frontend: Next.js Multi-Zones

11 independent Next.js apps + shell. Each zone has its own ECS service, ECR repo, and GitHub Actions pipeline. A finance deploy never touches people/time/etc.

- `web-shell` — owns Microsoft SSO (MSAL) and is the navigation hub. Thin by design.
- `web-admin` — self-service admin portal for tenant admins (org settings, AI config, module toggles). `platform_admin` role unlocks all-tenant view for SETA operators.
- Each zone is fully autonomous: reads session from httpOnly cookie, renders its own `<GlobalNav />` (from `packages/ui` with plain `<a>` tags — no runtime dep on shell).
- Cross-zone navigation is a hard reload — accepted trade-off for deployment isolation.
- `web-shell` outage does not affect users inside any module zone.

### tRPC Assembly

`apps/api` assembles the full `AppRouter`. `packages/api-client` re-exports only the inferred type — zero runtime code shipped to the frontend. Each zone creates its own typed client calling `/api/trpc` directly via ALB.

### Agent Runtime

The agent platform lives inside the NestJS monolith (`modules/agents`). Architecture:
- **Agent Gateway** (OpenClaw/GoClaw pattern) — single control plane: SessionManager → TopicRouter → McpToolRegistry → guardrail enforcement.
- **Channels** — WebSocket (web chat), Microsoft Teams, Slack, event triggers. Channel-agnostic: adding a new channel = one new adapter class.
- **Topics/Actions/Guardrails** — Agentforce-style tenant-configurable agent builder (no-code via `web-agents` zone).
- **Kernel governance on every action** — every tool call checks `exposure_contract` + `role_grant` and writes an `audit_event`.
- **MCP tool registry** — per-module MCP servers using `@rekog/mcp-nest`, HTTP+SSE at `/mcp/{module}`. Tool naming: `{module}_{action}`.
- **Session storage** — PostgreSQL `agents.agent_session` (auditable, not Redis).
- **Langfuse** — self-hosted on its own ECS service and isolated RDS instance for LLM trace observability.

### Data Platform

```
RDS Primary → RDS Read Replica → Cube.js (operational queries, last 30 days)
RDS Primary → AWS Glue ETL (hourly) → S3 Bronze (Parquet) → S3 Gold (Iceberg) → Athena → Cube.js (historical)
                                                                                             ↓
                                                                                apps/api trpc.insights.* (zones never call Cube.js directly)
```

Agent memory: pgvector HNSW in the `agents` schema for semantic search over policy documents and past decisions.

### Monorepo Event Flow

```
Command handler: DB write + outbox_event INSERT (same transaction)
  → In-process NestJS EventBus: synchronous delivery to all handlers
  → Outbox relay (every 5s, FOR UPDATE SKIP LOCKED): crash recovery re-publish
  → pg-boss: background jobs (emails, notifications, scheduled tasks) — separate from outbox
```

Microservice extraction path: swap `EventBus.publish()` → BullMQ producer. Domain/handler code is unchanged.

---

## Hard Rules (No Exceptions)

### Infrastructure
- All infrastructure changes go through Terraform. No manual AWS console changes.
- ECS tasks run on Graviton ARM64 (`linux/arm64`). Do not add x86-only dependencies.
- Secrets live in AWS Secrets Manager. Never in env files, never in the database, never hardcoded.
- RLS `set_config` uses transaction-local scope: `set_config('app.tenant_id', tenantId, false)`. The third arg is always `false`.
- Every table has `tenant_id`. No exceptions.
- Frontend zones never query the database directly. All data goes through `apps/api` tRPC.

### No Backward Compatibility
- No compatibility shims, no legacy code paths, no deprecated API aliases.
- When a caller breaks, update the caller. Do not preserve the old interface.

### Package Management
- Never manually edit `package.json`, `bun.lock`, or any lockfile.
- Use the CLI: `bun add <pkg>`, `bun add -d <pkg>`, `bun add <pkg>@<version>`, `bun remove <pkg>`.

### When in Doubt, Ask
- If a requirement is ambiguous, ask before implementing. Do not guess and build the wrong thing.
- If a decision has meaningful tradeoffs, surface them and ask. Do not silently pick one.
- One clarifying question upfront costs nothing. A wrong implementation costs hours.

---

## Key Design Decisions (Do Not Contradict)

- **UUID v7 everywhere** — not UUID v4, not auto-increment.
- **Drizzle, not Prisma** — native RLS support, smaller bundle.
- **No FK constraints across module schema boundaries** — soft references only.
- **audit_event is INSERT-only** — no UPDATE or DELETE at the DB layer.
- **outbox_event ≠ pg-boss** — outbox = transactional domain event delivery. pg-boss = background jobs.
- **Zones use `<a>` tags for cross-zone navigation** — no Next.js `<Link>` across zones.
- **`packages/event-contracts` has zero NestJS/Drizzle dependencies** — plain TypeScript classes only.
- **`packages/ui` is purely presentational** — no API calls, no auth.
- **OpenAI API directly** — not AWS Bedrock, not Anthropic.
- **Slack bot tokens stored in AWS Secrets Manager only** — never in the database. `agents.slack_installation.bot_token_ref` holds the secret ARN.
- **No real-time CDC** — hourly Glue ETL batch is sufficient and intentional.
- **No Multi-AZ RDS** — single-AZ with point-in-time recovery until an enterprise SLA requires it.
- **`web-admin` zone** — self-service admin portal at `/admin`. Tenant admins configure AI provider, model selection, BYO API key, and module toggles. `platform_admin` role gates SETA operator view.
- **AI config resolved at runtime** — `AdminQueryFacade.getResolvedAiConfig()` returns tenant override or platform default. Never hardcode model names or API keys.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
