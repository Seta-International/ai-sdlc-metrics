# Future — Agent Instructions

**Future** is an agent-native enterprise OS by SETA, replacing EMS / Timesheet / Hiring / Resource Insight with a unified platform. SETA is customer zero (300+ people). Target: Vietnamese SMEs + global.

Full docs: `docs/` — architecture, engineering rules, roadmaps, legacy specs.

---

## Stack

| Layer         | Technology                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend      | Next.js Multi-Zones (11 zones + shell)                                                                                                               |
| Backend       | NestJS modular monolith (Turborepo)                                                                                                                  |
| API           | tRPC (end-to-end type-safe)                                                                                                                          |
| Database      | PostgreSQL 16 — Drizzle ORM, schema-per-module, RLS                                                                                                  |
| Jobs          | pg-boss                                                                                                                                              |
| Events        | `outbox_event` + polling relay                                                                                                                       |
| Analytics     | Glue ETL → S3 Parquet → Iceberg → Athena → Cube.js                                                                                                   |
| AI            | Vercel AI SDK + OpenAI (`gpt-5.4-nano` classify, `gpt-5.4` reason, `text-embedding-3-small`)                                                         |
| Observability | Langfuse (self-hosted ECS)                                                                                                                           |
| Infra         | AWS ECS Fargate Graviton ARM64, Terraform, ap-southeast-1                                                                                            |
| Auth          | Microsoft Entra ID or Google Workspace OIDC + magic link (local accounts). See `docs/superpowers/specs/2026-04-11-access-control-strategy-design.md` |

---

## Process Kernel (`core` schema)

Single source of truth for all modules, agents, and integrations.

| Table                        | Purpose                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `actor`                      | Canonical identity — `person \| organization \| system`                                                             |
| `user_identity`              | Login record — `sso_subject` for SSO (Entra/Google), `provider: 'local'` for magic link                             |
| `external_identity_map`      | Legacy ID bridges (EMS, biometric, Slack, Teams). Join key: `actor_id` — never external IDs                         |
| `department`                 | Kernel-owned org dimension. People writes; all modules reference                                                    |
| `role_grant`                 | Role assignments scoped to `global \| department \| project \| account`. `source: manual \| idp_sync \| delegation` |
| `role_permission`            | DB-configurable role-to-permission mapping. `is_locked` prevents admin self-lockout                                 |
| `delegation`                 | Time-bounded authority transfer. Auto-expires. Checked before `role_grant`                                          |
| `org_placement`              | Temporal org history. Current: `effective_until IS NULL`                                                            |
| `decision_case/step/outcome` | Shared approval envelope for all workflows                                                                          |
| `audit_event`                | Immutable INSERT-only log. Never deleted                                                                            |
| `outbox_event`               | Transactional delivery queue. Pruned after 7 days                                                                   |
| `exposure_contract`          | Deny-by-default agent access control. Every tool call requires one                                                  |

- All tables have `tenant_id`. RLS enforced via `set_config('app.tenant_id', id, false)` (always `false`).
- All IDs: UUID v7 — `$defaultFn(() => uuidv7())`.
- `KernelQueryFacade` is the only cross-module kernel import. `canDo(actorId, permission, context)` is the single permission check — all modules use it.

---

## Domain Modules

| Module        | Schema        | Owns                                                                             |
| ------------- | ------------- | -------------------------------------------------------------------------------- |
| `kernel`      | `core`        | Authority (role_grant, role_permission, delegation), decisions, events, exposure |
| `identity`    | `identity`    | Authentication (SSO, magic link), IdP config, directory sync, user provisioning  |
| `people`      | `people`      | Employment profiles, org placements, offboarding                                 |
| `time`        | `time`        | Attendance, leave, OT, timesheets                                                |
| `hiring`      | `hiring`      | Recruitment, pipeline, interviews, offers                                        |
| `performance` | `performance` | Review cycles, evaluations, feedback                                             |
| `projects`    | `projects`    | Staffing, assignments, delivery                                                  |
| `finance`     | `finance`     | Invoices, payroll, budget                                                        |
| `goals`       | `goals`       | OKRs, KPIs, objectives                                                           |
| `insights`    | `insights`    | Analytics proxy to Cube.js — no tables                                           |
| `agents`      | `agents`      | Agent configs, sessions, messages, tools                                         |
| `planner`     | `planner`     | Task tracking, AI reminders, KPI linkage                                         |
| `admin`       | `admin`       | Tenant settings, AI config, module toggles                                       |

### Module layout (Hexagonal + DDD)

```
modules/people/
  domain/           → entities, value-objects, ports — zero NestJS/Drizzle
  application/      → commands, queries, facades, event-handlers
  infrastructure/   → Drizzle repos, schema, listeners
  interface/trpc/   → AppRouter contribution
  people.module.ts  → exports: [PeopleQueryFacade] ONLY
```

Cross-module communication:

1. **QueryFacade** — sync reads only
2. **Domain events** in `packages/event-contracts` — async, plain TS, zero NestJS deps

No FK constraints across schema boundaries. No imports from another module's `domain/` or `infrastructure/`.

---

## Frontend (Next.js Multi-Zones)

- 11 independent zones + `web-shell`. Each has its own ECS service, ECR repo, CI pipeline.
- `web-shell` owns SSO (Entra or Google, based on tenant's primary IdP) + magic link flow. Outage does not affect users inside module zones.
- `web-admin` — tenant self-service (AI config, module toggles). `platform_admin` = SETA operator view.
- Zones are fully autonomous: session from httpOnly cookie, `<GlobalNav />` from `packages/ui`.
- Cross-zone navigation = hard `<a>` reload. No Next.js `<Link>` across zones.

---

## Agent Runtime

Lives in `modules/agents` inside the NestJS monolith.

- **Gateway** — SessionManager → TopicRouter → McpToolRegistry → guardrails.
- **Channels** — WebSocket, Teams, Slack, event triggers. One adapter class per channel.
- **Every tool call** checks `exposure_contract` + `canDo()` permission check, writes `audit_event`.
- **MCP tools** — `@rekog/mcp-nest`, HTTP+SSE at `/mcp/{module}`. Naming: `{module}_{action}`.
- **Sessions** stored in `agents.agent_session` (PostgreSQL, auditable).
- **Agent memory** — pgvector HNSW in `agents` schema.

---

## Data Platform

```
RDS → Read Replica → Cube.js (last 30 days)
RDS → Glue ETL (hourly) → S3 Bronze → S3 Gold (Iceberg) → Athena → Cube.js (historical)
                                                                        ↓
                                                          trpc.insights.* (never call Cube.js directly from zones)
```

---

## Event Flow

```
Command handler → DB write + outbox_event INSERT (same tx)
  → NestJS EventBus (in-process, sync)
  → Outbox relay every 5s (FOR UPDATE SKIP LOCKED)
  → pg-boss (emails, notifications, scheduled tasks)
```

---

## Hard Rules

### Infrastructure

- Terraform only. No manual AWS console changes.
- ARM64 (`linux/arm64`) only. No x86-only deps.
- Secrets in AWS Secrets Manager. Never in env files, DB, or hardcoded.
- Every table has `tenant_id`. No exceptions.
- Zones never query the DB directly — all data via `apps/api` tRPC.

### No Backward Compatibility

- No shims, no deprecated aliases. Update callers; never preserve old interfaces.

### Testing (TDD — No Exceptions)

- **Write the test first.** No test = feature not started. Test not passing = not done.
- **≥70% coverage** (lines, functions, branches). PRs below threshold are blocked.
- Command handlers: unit test happy path + every error path.
- Cross-module interactions: integration test against real DB.
- Critical user flows: E2E Playwright test.
- Tests co-located: `foo.handler.spec.ts` next to `foo.handler.ts`.

### TypeScript Imports

- **Never use `.js` extensions in relative imports.** Write `'./foo'`, not `'./foo.js'`.
- **Why:** `apps/api` uses `module: nodenext` but compiles to **CommonJS** (no `"type": "module"` in `package.json`). Extensions are only mandatory in ESM. This repo is NodeNext+CJS — extensions are optional. `.js` on a relative import is a bug; remove it.

### Package Management

- Never manually edit `package.json`, `bun.lock`, or any lockfile.
- Use CLI: `bun add <pkg>`, `bun add -d <pkg>`, `bun remove <pkg>`.
- New workspace: `turbo gen workspace`. Never create manually.
- NestJS components: `bunx nest generate module|controller|service|resource <name> --no-spec` from `apps/api`.

### Git

- Never push to `main`. All changes via PR. CI green + one approval to merge.
- Branch: `feat/{ticket}` or `fix/{ticket}` off `main`.
- No `git worktree`. No `--force`. No `git reset --hard` on shared branches.

### When in Doubt, Ask

- Ambiguous requirement → ask before implementing.
- Meaningful tradeoff → surface it, don't silently pick one.

---

## Key Design Decisions

| Decision                  | Rule                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| IDs                       | UUID v7 everywhere — not v4, not serial                                                          |
| ORM                       | Drizzle — not Prisma                                                                             |
| Cross-schema FK           | Soft references only — no `.references()` across modules                                         |
| `audit_event`             | INSERT-only — no UPDATE or DELETE                                                                |
| `outbox_event` vs pg-boss | Outbox = transactional events. pg-boss = background jobs                                         |
| Cross-zone nav            | `<a>` tags — no Next.js `<Link>` across zones                                                    |
| `event-contracts`         | Zero NestJS/Drizzle deps — plain TS only                                                         |
| `packages/ui`             | Purely presentational — no API calls, no auth                                                    |
| AI provider               | OpenAI directly — not Bedrock, not Anthropic                                                     |
| Slack tokens              | Secrets Manager only — `bot_token_ref` holds the ARN                                             |
| Analytics sync            | Hourly Glue ETL batch — no real-time CDC                                                         |
| RDS                       | Single-AZ + PITR — no Multi-AZ until enterprise SLA                                              |
| AI config                 | Resolved at runtime via `AdminQueryFacade.getResolvedAiConfig()` — never hardcode models or keys |

---

## Design System

Always read `DESIGN.md` before making any visual or UI decision.
All font choices, colors, spacing, radii, motion, and component rules are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that does not match `DESIGN.md`.

Key rules (full spec in `DESIGN.md`):

- Font: **Geist** (body/UI) + **Geist Mono** (data/code). Never Inter, Roboto, Arial, or system-ui as primary.
- Accent color: `#1D4ED8` (authority blue). Never purple, violet, or gradient accents.
- Sidebar background: `#0F1B2D` (deep navy). Always.
- Dark mode page bg: `#0A0F1E` (deep navy). Not gray.
- Spacing: 4px base grid, defined tokens only — no raw pixel values.
- Every new list/table/card view must include an empty state and skeleton loader.
- Error messages must be specific and actionable — never "Something went wrong."
