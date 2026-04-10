# Future — Tech Stack Reference

**Date:** 2026-04-09
**Status:** Agreed
**Project:** Seta Future AaaS

---

## Purpose

This document captures every technology choice in the Future stack, with the version to pin, the reason it was chosen, and the one thing you must not do with it. Written for the build team starting Q2 2026.

---

## Runtime and Monorepo

| Tool | Version | Why |
|------|---------|-----|
| **Bun** | `^1.3` (current: 1.3.11) | Runtime + package manager. 30-100x faster than npm for install. Native TS execution. Drop-in for Node.js in NestJS containers. |
| **Turborepo** | `^2.9` (current: 2.9.4) | Monorepo task orchestration. Remote caching means lint + typecheck on cache hit is ~30 seconds across 15+ packages. |
| **TypeScript** | `^6.x` (current: 6.0.2) | Strict mode on. `"strict": true` in every tsconfig. No `any`. moduleResolution must be `bundler` or `nodenext` — `classic` was removed in v6. |

**Monorepo layout:**

```
apps/
  api/               → NestJS backend
  web-shell/         → Next.js navigation + auth hub
  web-people/        → Next.js People zone
  web-time/
  web-hiring/
  web-performance/
  web-projects/
  web-finance/
  web-goals/
  web-insights/
  web-agents/
  web-planner/       → Next.js Planner zone
  web-admin/         → Next.js admin zone (tenant_admin + platform_admin portal)
  e2e/               → Playwright E2E (runs against staging only)
agents/
  langfuse/          → Langfuse self-hosted LLM observability (ECS service, own ECR repo)
  mcp-tools/         → Per-module MCP tool contracts (people, time, hiring, etc.)
  prompts/           → Versioned system prompts, topic configs, guardrail rules
  evals/             → LLM eval harness (test prompts → expected tool calls)
  channels/          → Teams, Slack, WebSocket channel adapters
data-platform/
  cubejs/            → Cube.js semantic layer (ECS service, own ECR repo)
  glue/              → AWS Glue ETL Python scripts (hourly batch, not a container)
packages/
  api-client/        → tRPC type export only — zero runtime code for frontend
  event-contracts/   → domain event classes — zero NestJS/Drizzle deps
  ui/                → shared React components — purely presentational, no API calls
  auth/              → MSAL helpers, useSession hook, token parsing — no React dep
  db/                → Drizzle schema definitions + migration runner
  eslint-config/
  tsconfig/
infra/               → Terraform IaC
```

**TypeScript v6 tsconfig baseline** (all packages extend `packages/tsconfig/base.json`):

```json
{
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ES2025",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true
  }
}
```

`moduleResolution: "classic"` is removed in TypeScript 6. Use `"bundler"` for Next.js zones and `"nodenext"` for the NestJS API.

**Do not:** put business logic in `packages/`. Packages are shared infrastructure. Domain logic belongs in `apps/api/src/modules/{module}/`.

---

## Backend

### NestJS

| Item | Choice |
|------|--------|
| Version | `^11.x` (current: 11.1.18) |
| Module system | Standard NestJS DI container |
| API protocol | tRPC (`trpc-nestjs-adapter` or `@trpc/server` with NestJS adapter) |
| Background jobs | `pg-boss` via `nest-pg-boss` or custom `PgBossModule` |
| Validation | `class-validator` + `class-transformer` (input DTOs only — not domain objects) |
| Config | `@nestjs/config` + Zod schema validation at startup |

**Application structure inside `apps/api/src/`:**

```
modules/
  kernel/            → core schema — kernel owns nothing it doesn't need to
  people/
  time/
  hiring/
  performance/
  projects/
  finance/
  goals/
  insights/          → proxy to Cube.js only, no persistent tables
  agents/
  planner/
  admin/
common/
  cls/               → nestjs-cls setup for per-request tenant context
  trpc/              → AppRouter assembly
  health/            → /health endpoint for ECS health checks
```

**Every module follows this internal layout:**

```
modules/people/
  domain/            → pure TypeScript: entities, value-objects, ports (interfaces)
                       ZERO NestJS imports, ZERO Drizzle imports
  application/
    commands/        → command handlers (writes)
    queries/         → query handlers (reads)
    facades/         → PeopleQueryFacade — the only public export
    event-handlers/  → handlers for domain events from other modules
  infrastructure/
    repositories/    → Drizzle adapters implementing domain ports
    schema/          → Drizzle table definitions for this module's schema
    listeners/       → outbox event listeners
  interface/
    trpc/            → contributes to AppRouter
  people.module.ts   → exports: [PeopleQueryFacade] ONLY
```

**What not to do:** never import `PeopleRepository` or any `infrastructure/` class from outside the `people` module. The `eslint-plugin-boundaries` rule enforces this at compile time.

### Drizzle ORM

| Item | Choice |
|------|--------|
| Version | `^0.45` (current: 0.45.2) |
| Driver | `drizzle-orm/node-postgres` with `pg` driver |
| Schema style | `pgSchema()` — one schema per module (e.g., `pgSchema('people')`) |
| Migrations | `drizzle-kit` — migrations live in `packages/db/migrations/` |
| ID generation | `$defaultFn(() => uuidv7())` — UUID v7 on every table, every time |

**No cross-schema FK constraints.** `people.employment_contract` can store `actor_id` (a UUID referencing `core.actor`) but without `.references()`. Cross-module integrity is enforced at the application layer via `KernelQueryFacade`.

**RLS pattern** (every table):

```ts
export const employmentContract = peopleSchema.table('employment_contract', {
  id: uuid('id').$defaultFn(() => uuidv7()).primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  // ... other columns
})
```

The `tenantId` column is on every table. RLS policy is set at the DB level. `set_config('app.tenant_id', tenantId, false)` is called per-request via `nestjs-cls` middleware.

### tRPC

| Item | Choice |
|------|--------|
| Version | `^11.x` (current: 11.16.0) |
| Assembly | `apps/api/src/common/trpc/app-router.ts` — merges all module routers |
| Frontend client | `packages/api-client` re-exports the `AppRouter` type only — `import type { AppRouter }` |
| Auth | tRPC middleware checks session cookie, injects `tenantId` + `actorId` into context |

Each zone creates its own typed client:

```ts
// apps/web-finance/src/lib/trpc.ts
import type { AppRouter } from '@future/api-client'
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [httpBatchLink({ url: '/api/trpc' })]
})
```

**Do not** import any runtime server code from `packages/api-client`. Type-only imports only.

### PostgreSQL and Connection Management

| Item | Choice |
|------|--------|
| Version | PostgreSQL 16 |
| Connection pooling | RDS Proxy (production) → Drizzle pool (`max: 10` per task) |
| Tenant context | `nestjs-cls` injects `set_config('app.tenant_id', tenantId, false)` before every query |
| Outbox relay | 1 dedicated connection per API task (not from the request pool) |
| pg-boss | 1 dedicated connection per API task (not from the request pool) |

Connection budget: `api_tasks × (pool_size + 2)`. Keep below 100 for `db.t4g.medium`.

---

## Frontend

### Next.js

| Item | Choice |
|------|--------|
| Version | `^16.x` (current: 16.2.2) |
| Router | App Router (RSC — React Server Components default) |
| Output | `standalone` — smaller Docker images, self-contained |
| CSS | Tailwind CSS `^4.x` (current: 4.2.2) + `packages/ui` shared component library |
| Auth | `web-shell` only. All other zones read session from httpOnly cookie. |
| Cross-zone nav | `<a>` tags — not `<Link>`. Hard reload between zones is intentional. |
| Bundler | Turbopack (now the default in Next.js 16) |

**Breaking changes from Next.js 15 → 16 (relevant to this project):**

1. **Async Request APIs** — `params` and `searchParams` must now be awaited in layouts, pages, and route handlers. Synchronous access was removed.
   ```ts
   // ✓ Next.js 16 — async params
   export default async function PeoplePage({ params }: { params: Promise<{ id: string }> }) {
     const { id } = await params
     ...
   }
   ```
2. **Caching is opt-in** — dynamic code runs at request time by default. Use the `"use cache"` directive explicitly where you want caching. This aligns well with our design (per-tenant data should not be cached at the page level).
3. **Middleware renamed to Proxy** — if using Next.js middleware for edge routing, the API surface changed.
4. **Turbopack is the default bundler** — `next dev` uses Turbopack. This is a good thing (faster builds). No config changes needed.

A Next.js codemod handles the async params migration automatically:
```bash
npx @next/codemod@latest async-requests
```

**Every zone has its own `<GlobalNav />`** rendered from `packages/ui`. It does not depend on `web-shell` at runtime. If `web-shell` goes down, users already in any module zone can keep working.

**Tailwind v4 setup (CSS-first, no `tailwind.config.js` needed):**

```css
/* apps/web-people/src/app/globals.css */
@import "tailwindcss";

/* Custom theme tokens go here via @theme, not in a JS config file */
@theme {
  --color-brand: #0f4c75;
}
```

No `@tailwind base/components/utilities` directives. No `tailwind.config.js` unless you have a legacy config to migrate. Auto-scans the project by default.

**Breaking defaults from v3:** `border-*` and `ring` colors changed to `currentColor` (was gray/blue). Ring width changed to `1px` (was `3px`). Update any components that relied on these defaults.

### UI Component Library (`packages/ui`)

- Pure presentational components: no API calls, no auth checks, no NestJS imports.
- Exports: React components + Tailwind class utilities.
- Storybook lives here for component development in isolation.

---

## AI and Agent Platform

| Item | Choice |
|------|--------|
| AI SDK | Vercel AI SDK `^6.x` (current: 6.0.154) — package name: `ai` |
| OpenAI provider | `@ai-sdk/openai ^3.x` (current: 3.0.52) |
| LLM provider | OpenAI API (direct) — not AWS Bedrock, not Anthropic |
| Classification model | `gpt-5.4-nano` — topic routing, intent classification |
| Reasoning model | `gpt-5.4` — multi-step agent reasoning, tool use |
| Embedding model | `text-embedding-3-small` — 1536 dims, pgvector HNSW |
| Observability | Langfuse (self-hosted on ECS, isolated RDS) |
| Session storage | PostgreSQL `agents.agent_session` — not Redis |
| Memory | pgvector HNSW in `agents` schema — `vector(1536)` |
| Tool protocol | MCP (Model Context Protocol) via `@rekog/mcp-nest` |
| Azure fallback | `@ai-sdk/azure` — provider factory swap only, no business logic changes |

**AI SDK v6 + OpenAI notes:**

- Install: `bun add ai @ai-sdk/openai`
- **Parallel tool calls:** OpenAI executes multiple tool calls concurrently by default (`parallelToolCalls: true`). All MCP tool handlers MUST be safe for concurrent execution — stateless or with proper row-level locking. This is a hard rule.
- **Strict JSON schema:** OpenAI enforces strict JSON schema by default. Use `.nullable()` instead of `.optional()` or `.nullish()` in Zod schemas for structured output.
- **System messages:** For `gpt-5.4` family, system messages are auto-converted to developer messages. Test prompts carefully.
- **Responses API:** `openai(modelId)` uses the Responses API by default. Use `openai.chat(modelId)` to force Chat Completions API if needed.
- v7 is in beta (`ai@beta`). Do not use in production.
- AI config (model selection, API key) is resolved at runtime via `AdminQueryFacade.getResolvedAiConfig()` — tenant BYO key takes precedence over platform default.

**MCP tool naming convention:** `{module}_{action}` — e.g., `people_get_employment_profile`, `time_submit_leave_request`.

**Every MCP tool call must:**
1. Check `exposure_contract` (deny-by-default access control)
2. Check `role_grant` (actor permissions)
3. Write an `audit_event` after execution

---

## Data Platform

```
RDS Primary
  → (hourly batch) → AWS Glue ETL → S3 Bronze (Parquet) → S3 Gold (Iceberg) → Athena
  → (sync replica)  → RDS Read Replica → Cube.js (operational, last 30 days)

Cube.js semantic layer → apps/api trpc.insights.* router → frontend zones
                         (zones never call Cube.js directly)
```

| Item | Choice |
|------|--------|
| ETL | AWS Glue (Python shell job, hourly, ~$2/month) |
| Storage format | Apache Parquet (Bronze) + Apache Iceberg (Gold) |
| Query engine | Amazon Athena (ad-hoc, serverless) |
| Semantic layer | Cube.js `^1.6` (current: 1.6.x) — defines metrics, dimensions, measures |
| Cache | ElastiCache Redis (Cube.js query cache only) |

**No real-time CDC.** Hourly batch is sufficient and intentional. Operational reads (last 30 days) go through the read replica. Historical cross-module analytics go through Athena.

---

## Infrastructure

| Item | Choice |
|------|--------|
| Cloud | AWS ap-southeast-1 (Singapore) |
| Compute | ECS Fargate Graviton ARM64 |
| IaC | Terraform `~>1.7` |
| CI/CD | GitHub Actions + OIDC (no static AWS credentials) |
| Container registry | ECR (one repo per service — 14 repos) |
| DNS + TLS | Route 53 + ACM |
| Secrets | AWS Secrets Manager — `OPENAI_API_KEY` (platform default); per-tenant BYO keys at `future/{env}/tenant/{tenantId}/openai-api-key` |
| Logs | CloudWatch Logs |
| Slack/Teams tokens | Secrets Manager only — never in the database |

---

## Package Manager and Scripts

Run everything with Bun:

```bash
bun install                    # install dependencies
bun turbo build                # build all apps
bun turbo test                 # run all tests
bun turbo lint                 # lint all packages
bun turbo typecheck            # tsc --noEmit across all packages
bun run db:migrate             # run pending migrations (packages/db)
bun run db:generate            # generate new migration from schema changes
```

Per-app dev server:

```bash
cd apps/api && bun run dev     # NestJS with --watch
cd apps/web-people && bun run dev  # Next.js dev server on :3001 (each zone has own port)
```

---

## Version Pinning Policy

- **Patch versions:** update freely (dependabot auto-merge).
- **Minor versions:** update weekly, run full test suite.
- **Major versions:** treat as a migration project — evaluate, test in staging, schedule.
- **PostgreSQL:** stay on 16.x until AWS RDS supports 17.x in ap-southeast-1 and it has 6+ months of stability.
- **Anthropic models:** `claude-haiku-4-5-20251001` is pinned by ID. When upgrading models, run eval suite first (see testing strategy).
