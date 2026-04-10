# Future — Monorepo Scaffold Design

**Date:** 2026-04-10
**Status:** Approved
**Project:** Seta Future AaaS
**Scope:** Full monorepo skeleton — workspace config, all packages, all apps, CI stubs, Terraform stubs

---

## Goal

Scaffold the complete Future monorepo from this docs-only repo so the build team can write the first line of business logic immediately. No business logic is implemented in this scaffold — the output is a coherent, fully-wired skeleton that compiles, lints, and passes CI.

---

## Approach

All-at-once scaffold (Approach B): every workspace, package, and app is created in one pass. The spec is fully agreed. A complete, coherent scaffold from day one is worth more than a partial one that accumulates "add later" debt under delivery pressure.

---

## Scope

| Layer             | What is scaffolded                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------- |
| Workspace root    | `package.json`, `turbo.json`, `.gitignore`, `README.md`, `.env.example`                      |
| 7 shared packages | `tsconfig`, `eslint-config`, `ui`, `auth`, `api-client`, `event-contracts`, `db`             |
| 14 apps           | `api` (12 module skeletons), `web-shell`, 11 domain zones, `e2e`                             |
| data-platform     | `cubejs`, `langfuse`, `glue`                                                                 |
| agents            | `langfuse` (ECS service) + stub directories: `mcp-tools/`, `prompts/`, `evals/`, `channels/` |
| CI                | `ci.yml` (fully wired) + 17 per-service deploy workflow stubs                                |
| Terraform         | `infra/bootstrap/` + 11 module stubs + 2 environment tfvars                                  |

**Not in scope:** no kernel schema implemented, no auth logic, no tRPC routes, no Terraform HCL resources. Those are workstream deliverables, not scaffold deliverables.

---

## Section 1: Workspace Root

Files at `/`:

### `package.json`

```json
{
  "name": "future",
  "private": true,
  "workspaces": ["apps/*", "agents/*", "data-platform/*", "packages/*"],
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "test:e2e": "turbo test:e2e",
    "db:generate": "bun run --cwd packages/db generate",
    "db:migrate": "bun run --cwd packages/db migrate"
  },
  "devDependencies": {
    "turbo": "^2.9.4",
    "typescript": "^6.0.2"
  }
}
```

### `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint": {},
    "test": { "dependsOn": ["^build"] },
    "test:e2e": { "dependsOn": ["^build"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

### `.gitignore`

Covers: `node_modules/`, `.next/`, `dist/`, `.turbo/`, `*.env.local`, `.env`, `bun.lockb` is committed (not ignored).

### `.env.example`

Documents every required env var with safe placeholder values — no actual secrets. Includes `DATABASE_URL`, `TEST_DATABASE_URL`, `PORT`, `NEXTAUTH_URL`, `NEXT_PUBLIC_API_URL`.

### `README.md`

Day-one dev commands — see Section 6.

---

## Section 2: Shared Packages

### Package constraints (hard rules from architecture)

- `packages/ui` — no API calls, no auth, purely presentational
- `packages/api-client` — zero runtime server code, type + factory only
- `packages/event-contracts` — zero NestJS deps, zero Drizzle deps, plain TypeScript classes only
- `packages/auth` — no React dep, MSAL helpers and session parsing only
- No business logic in any package — domain logic belongs in `apps/api/src/modules/`

---

### `packages/tsconfig/`

**`base.json`** — extended by all packages and `apps/api`:

```json
{
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ES2025",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true
  }
}
```

**`nextjs.json`** — extended by all web zones:

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "plugins": [{ "name": "next" }]
  }
}
```

Note: `apps/api` uses `moduleResolution: "nodenext"` in its own `tsconfig.json` — not `bundler`. The NestJS API is a Node.js process, not a bundler target.

---

### `packages/eslint-config/`

Exports two flat configs:

- `base` — applied to all packages and `apps/api`
- `nextjs` — applied to all web zones

Includes `eslint-plugin-boundaries` with the module boundary rules from `docs/engineering/testing-strategy.md`:

```js
{
  'boundaries/element-types': ['error', {
    default: 'disallow',
    rules: [
      { from: 'infrastructure', allow: ['domain'] },
      { from: 'application',    allow: ['domain'] },
      { from: 'interface',      allow: ['application'] },
    ],
  }],
}
```

---

### `packages/ui/`

```
src/
  index.ts                    → re-exports all components
  components/
    global-nav.tsx            → stub <GlobalNav /> — uses <a> tags only, no Next.js <Link>
```

Peer deps: `react`, `react-dom`, `tailwindcss`.
No Storybook in the scaffold — add when the first real component is built.

---

### `packages/auth/`

```
src/
  index.ts                    → exports useSession, parseToken, getMsalInstance
  use-session.ts              → stub hook (TODO: MSAL implementation)
  parse-token.ts              → stub (TODO: decode Entra OIDC token)
```

No React dep in `package.json` — pure MSAL helpers only.

---

### `packages/api-client/`

```
src/
  index.ts                    → export type { AppRouter } from 'apps/api'; export { createTRPCClient }
  client.ts                   → createTRPCClient factory stub using @trpc/client httpBatchLink
```

Zero runtime server code. `import type { AppRouter }` only — never `import { appRouter }`.

---

### `packages/event-contracts/`

Zero deps. All 8 event namespace directories pre-created with the canonical event classes from `docs/architecture/application.md`:

```
src/
  people/
    person-hired.event.ts           → PersonHiredEvent { tenantId, actorId, employmentId, effectiveDate }
    person-offboarded.event.ts      → PersonOffboardedEvent { tenantId, actorId, effectiveDate }
    org-placement-changed.event.ts  → OrgPlacementChangedEvent { tenantId, actorId, newManagerId, newDepartmentId }
  time/
    leave-approved.event.ts         → LeaveApprovedEvent { tenantId, actorId, leaveRequestId, from, to }
    leave-rejected.event.ts         → LeaveRejectedEvent { tenantId, actorId, leaveRequestId, reason }
  hiring/
    candidate-hired.event.ts        → CandidateHiredEvent { tenantId, actorId, candidateId, startDate }
  projects/
    assignment-changed.event.ts     → AssignmentChangedEvent { tenantId, actorId, projectId, role, effectiveDate }
  performance/
    review-cycle-completed.event.ts → ReviewCycleCompletedEvent { tenantId, cycleId, completedAt }
  goals/
    kpi-score-submitted.event.ts    → KpiScoreSubmittedEvent { tenantId, actorId, kpiId, score, period }
  finance/
    invoice-approved.event.ts       → InvoiceApprovedEvent { tenantId, invoiceId, approvedBy, amount }
  kernel/
    decision-case-resolved.event.ts → DecisionCaseResolvedEvent { tenantId, caseId, finalAction, decidedBy }
  index.ts                          → re-exports all events
```

Each event class has a static `eventName` property and a constructor with typed arguments. No `TODO` here — these are short and fully specced.

---

### `packages/db/`

```
src/
  index.ts                    → exports db instance factory (Drizzle + pg driver)
  migrate.ts                  → MigrationRunner stub (TODO: topological migration apply)
  test-helpers/
    index.ts                  → seedActor, createTestSchema, dropTestSchema stubs
drizzle/
  migrations/                 → empty, populated by drizzle-kit generate
drizzle.config.ts             → points to packages/db as schema source
```

Key deps: `drizzle-orm ^0.45`, `drizzle-kit`, `pg`, `uuidv7`.

`drizzle.config.ts` sets dialect `postgresql`, schema path `./src/**/*.schema.ts`, migrations output `./drizzle/migrations/`.

---

## Section 3: Apps

### Dev ports (collision-free local dev)

| App               | Port |
| ----------------- | ---- |
| `api`             | 4000 |
| `web-shell`       | 3000 |
| `web-people`      | 3001 |
| `web-time`        | 3002 |
| `web-hiring`      | 3003 |
| `web-performance` | 3004 |
| `web-projects`    | 3005 |
| `web-finance`     | 3006 |
| `web-goals`       | 3007 |
| `web-insights`    | 3008 |
| `web-agents`      | 3009 |
| `web-admin`       | 3010 |
| `web-planner`     | 3011 |
| `cubejs`          | 4001 |

---

### `apps/api` — NestJS modular monolith

```
src/
  main.ts                         → bootstrap NestJS, listen on PORT (default 4000)
  app.module.ts                   → imports all 11 domain modules
  common/
    cls/
      cls.module.ts               → nestjs-cls setup stub (TODO: tenant context injection)
    health/
      health.controller.ts        → GET /health → { status: 'ok' }
    trpc/
      app.router.ts               → assembles all module routers into AppRouter
      trpc.module.ts
  modules/
    kernel/   people/   time/   hiring/   performance/
    projects/ finance/  goals/  insights/ agents/   admin/
tsconfig.json                     → extends packages/tsconfig/base.json, moduleResolution: nodenext
package.json                      → NestJS ^11, Drizzle ^0.45, tRPC ^11, pg-boss, nestjs-cls, uuidv7
Dockerfile                        → multi-stage, linux/arm64, Bun runtime
.env.example                      → DATABASE_URL, PORT
vitest.config.ts                  → unit + integration projects as per testing-strategy.md
```

**Every module follows this exact hexagonal layout:**

```
modules/people/
  domain/
    entities/.gitkeep
    value-objects/.gitkeep
    repositories/.gitkeep         → port interfaces (IPeopleRepository)
  application/
    commands/.gitkeep
    queries/.gitkeep
    facades/
      people-query.facade.ts      → stub class exported by people.module.ts
    event-handlers/.gitkeep
  infrastructure/
    repositories/.gitkeep
    schema/
      people.schema.ts            → pgSchema('people') stub
    listeners/.gitkeep
  interface/
    trpc/
      people.router.ts            → stub router
  people.module.ts                → @Module({ exports: [PeopleQueryFacade] })
```

All 12 modules get this layout. The `kernel` module additionally gets pre-stubbed schema files for:
`actor`, `user_identity`, `external_identity_map`, `department`, `role_grant`, `delegation`, `org_placement`, `decision_case`, `decision_step`, `decision_outcome`, `audit_event`, `outbox_event`, `visibility_scope`, `exposure_contract`, `processed_events` — column shapes specced in `docs/architecture/kernel.md`.

---

### `apps/web-shell`

```
src/app/
  layout.tsx                      → root layout, MSAL provider wrapper stub
  page.tsx                        → placeholder home (module tiles grid)
  api/
    auth/
      callback/route.ts           → MSAL callback stub
      me/route.ts                 → session read stub → { actorId, tenantId, roles }
next.config.ts                    → { output: 'standalone' }   (no basePath)
tsconfig.json                     → extends packages/tsconfig/nextjs.json
package.json                      → Next.js ^16, packages/ui, packages/auth
Dockerfile                        → multi-stage, linux/arm64, standalone output
```

---

### `apps/web-{people,time,hiring,performance,projects,finance,goals,insights,agents,planner,admin}`

Every domain zone is identical in structure. All 11 follow this pattern:

```
src/app/
  layout.tsx                      → imports <GlobalNav /> from packages/ui
  page.tsx                        → placeholder ("People — coming soon")
  globals.css                     → @import "tailwindcss";
next.config.ts                    → { output: 'standalone' }   (no basePath — subdomain routing)
tsconfig.json                     → extends packages/tsconfig/nextjs.json
package.json                      → Next.js ^16, packages/ui, packages/auth, packages/api-client
Dockerfile                        → multi-stage, linux/arm64, standalone output
```

Subdomain routing (from deployment architecture):

- `web-people` → `people.seta-international.com`
- `web-time` → `time.seta-international.com`
- `web-admin` → `admin.seta-international.com`
- etc.

No `basePath` in `next.config.ts`. Each zone runs at the root of its subdomain.

---

### `data-platform/cubejs` — Cube.js semantic layer

```
model/
  cubes/
    LeaveRequest.js             → dataSource: 'operational' (RDS read replica)
    LeaveRequestHistory.js      → dataSource: 'historical' (Athena)
    Employment.js
    HiringFunnel.js
    KpiScore.js
    Invoice.js
    TaskCompletion.js           → Planner data
cube.js                         → two data sources: operational (RDS replica) + historical (Athena)
                                  queryTransformer: tenant_id filter injected on every query
package.json                    → @cubejs-backend/server, @cubejs-backend/postgres-driver, @cubejs-backend/athena-driver
Dockerfile                      → multi-stage, linux/arm64
.env.example                    → CUBEJS_DB_HOST, CUBEJS_DB_NAME, CUBEJS_ATHENA_*, CUBEJS_REDIS_URL, CUBEJS_API_SECRET
```

This is not a stub — the cube config and data source wiring have real content from the spec. Cube definitions are stubs (empty measures/dimensions) that the data engineer fills in per module.

---

### `data-platform/glue` — AWS Glue ETL Python scripts

```
jobs/
  etl_bronze.py                 → watermark-based extract from RDS → S3 Bronze (Parquet)
                                  reads all module schemas: people, time, hiring, performance,
                                  projects, finance, goals, planner, kernel.audit_event
  etl_gold.py                   → Iceberg MERGE from Bronze → S3 Gold via Glue Data Catalog
                                  merge key: (tenant_id, id) — universal across all tables
requirements.txt                → awsglue (provided by Glue runtime), boto3, pyarrow
deploy.sh                       → uploads scripts to S3, updates Glue job definition (TODO: wire to CI)
README.md                       → "See docs/architecture/data-platform.md for full pipeline spec"
```

Not a container — Python scripts deployed directly to AWS Glue. No ECR repo. The `deploy.sh` stub is filled in when infra is ready.

---

---

## Section 3b: Agents Top-Level Folder

```
agents/
  langfuse/
    Dockerfile                    → FROM langfuse/langfuse:latest (no custom code)
    .env.example                  → NEXTAUTH_SECRET, DATABASE_URL (Langfuse RDS), NEXTAUTH_URL, LANGFUSE_*
  mcp-tools/
    README.md                     → "MCP tool definitions live here. Each module gets its own subfolder."
    people/.gitkeep
    time/.gitkeep
    hiring/.gitkeep
    performance/.gitkeep
    projects/.gitkeep
    finance/.gitkeep
    goals/.gitkeep
    planner/.gitkeep
    admin/.gitkeep
  prompts/
    README.md                     → "Versioned system prompts and topic configs."
    topics/.gitkeep               → topic routing configs (YAML/JSON)
    guardrails/.gitkeep           → guardrail rule definitions
  evals/
    README.md                     → "LLM eval harness. See docs/architecture/agent-runtime.md."
    fixtures/.gitkeep             → test prompt → expected tool call pairs
    run-evals.sh                  → stub (TODO: wire to CI on model version change)
  channels/
    README.md                     → "Channel adapters: Teams, Slack, WebSocket."
    teams/.gitkeep
    slack/.gitkeep
    websocket/.gitkeep
```

**What lives in `agents/` vs `apps/api/src/modules/agents/`:**

- `apps/api/src/modules/agents/` — the NestJS runtime: SessionManager, TopicRouter, McpToolRegistry, guardrail enforcement, session/message storage. This is server code.
- `agents/` top-level — everything that is NOT NestJS code: MCP tool contracts (callable definitions + schemas), versioned prompts, eval test fixtures, channel adapter skeletons. These are configuration and behavioral artifacts versioned alongside the code that executes them.

When the agent platform grows to warrant extraction (post-MVP), `apps/api/src/modules/agents/` moves to `agents/runtime/` as its own NestJS service. The top-level folder is already waiting for it.

No `package.json` at the `agents/` root — sub-directories that need one (e.g., `evals/`) get their own.

---

### `apps/e2e` — Playwright

```
playwright.config.ts              → baseURL from env, chromium project only
fixtures/
  tenant.ts                       → seedTestTenant / teardownTestTenant stubs
tests/
  auth.spec.ts
  leave-approval.spec.ts
  payroll.spec.ts
  agent-conversation.spec.ts
  onboarding.spec.ts
package.json                      → @playwright/test ^1.59 only
tsconfig.json
```

E2E runs against staging only. Never production.

---

## Section 4: CI/CD Stubs

```
.github/
  workflows/
    ci.yml                        → fully wired (see below)
    deploy-api.yml                → stub (path filter: apps/api/**)
    deploy-web-shell.yml          → stub (path filter: apps/web-shell/**)
    deploy-web-people.yml         → stub (path filter: apps/web-people/**)
    deploy-web-time.yml           → stub (path filter: apps/web-time/**)
    deploy-web-hiring.yml         → stub (path filter: apps/web-hiring/**)
    deploy-web-performance.yml    → stub (path filter: apps/web-performance/**)
    deploy-web-projects.yml       → stub (path filter: apps/web-projects/**)
    deploy-web-finance.yml        → stub (path filter: apps/web-finance/**)
    deploy-web-goals.yml          → stub (path filter: apps/web-goals/**)
    deploy-web-insights.yml       → stub (path filter: apps/web-insights/**)
    deploy-web-agents.yml         → stub (path filter: apps/web-agents/**)
    deploy-web-planner.yml        → stub (path filter: apps/web-planner/**)
    deploy-web-admin.yml          → stub (path filter: apps/web-admin/**)
    deploy-cubejs.yml             → stub (path filter: data-platform/cubejs/**)
    deploy-langfuse.yml           → stub (path filter: agents/langfuse/**)
    deploy-glue.yml               → stub (path filter: data-platform/glue/** — uploads Python scripts to S3 + updates Glue job)
```

### `ci.yml` — fully wired

Triggers on every PR. Steps exactly as per `docs/engineering/testing-strategy.md`:

```yaml
steps:
  - bun install
  - bun turbo lint --filter='[HEAD^1]'
  - bun turbo typecheck --filter='[HEAD^1]'
  - bun vitest run --project unit
  - bun vitest run --project integration
```

All 4 steps are required to merge. PR is blocked if any fail.

### Deploy workflow stubs

Each `deploy-{zone}.yml` contains:

- Trigger: `push` to `main` with path filter for the relevant `apps/{zone}/**`
- Steps: `TODO: bun turbo build --filter={zone}`, `TODO: docker build --platform linux/arm64`, `TODO: ECR push`, `TODO: ECS rolling update`
- Comment block linking to `docs/architecture/deployment.md` for the full pipeline spec

---

## Section 5: Terraform Stubs

```
infra/
  bootstrap/
    main.tf                       → TODO: S3 state bucket + DynamoDB lock table
    README.md                     → "Run once before any other Terraform ops. See deployment.md."
  modules/
    vpc/main.tf                   → TODO: VPC, subnets (public + private, 2 AZs), NAT gateway, security groups
    alb/main.tf                   → TODO: ALB, listeners, host-based routing rules, ACM wildcard cert
    ecs-cluster/main.tf           → TODO: ECS cluster, Fargate + Spot capacity providers
    ecs-service/main.tf           → TODO: parameterized module (name, image, cpu, memory, spot_weight)
    rds/main.tf                   → TODO: RDS PostgreSQL 16 (db.t4g.medium), RDS Proxy, read replica
    rds-langfuse/main.tf          → TODO: isolated RDS (db.t4g.micro) for Langfuse trace storage
    redis/main.tf                 → TODO: ElastiCache (cache.t4g.small) — Cube.js cache only
    ecr/main.tf                   → TODO: 15 ECR repos (api, web-shell, 11 zones, cubejs, langfuse)
    secrets/main.tf               → TODO: Secrets Manager entries for DB creds, OPENAI_API_KEY, Slack/Teams tokens
    glue/main.tf                  → TODO: Glue ETL jobs, Data Catalog (future_bronze, future_gold), crawlers
    eventbridge/main.tf           → TODO: staging scale-to-zero rules (9am-8pm SGT weekdays)
  environments/
    staging.tfvars                → instance sizes, min/max tasks, schedule rules
    production.tfvars             → instance sizes, min/max tasks (no schedule rules)
  main.tf                         → calls all modules
  variables.tf
  backend.tf                      → remote state: S3 + DynamoDB (created by bootstrap)
```

Each `.tf` file is a stub: filename, a comment block describing what the module provisions (referencing `docs/architecture/deployment.md`), and `TODO` markers. No actual HCL resource blocks.

---

## Section 6: Dev Workflow (README.md)

```bash
# Install all dependencies
bun install

# Run the API and one zone (most common dev pattern)
bun turbo dev --filter=api --filter=web-people

# Run all zones (resource-heavy)
bun turbo dev

# Type-check everything
bun turbo typecheck

# Generate a DB migration after schema changes
bun db:generate

# Apply pending migrations
bun db:migrate

# Run unit tests
bun vitest run --project unit

# Run integration tests (requires TEST_DATABASE_URL in .env.local)
bun vitest run --project integration

# Run E2E tests (requires staging env)
bun playwright test

# Build a single zone (e.g. for docker build verification)
bun turbo build --filter=web-people
```

---

## Decisions Made in This Design

| Decision                         | Choice                                    | Reason                                                                                                                                                                                                                             |
| -------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scaffold approach                | All-at-once                               | Spec is fully agreed; no iterative discovery needed                                                                                                                                                                                |
| Zone count                       | All 18 apps                               | "Multi-Zones from day one" + full data platform from day one                                                                                                                                                                       |
| Next.js basePath                 | Not set                                   | Subdomain routing — each zone at root of its own subdomain                                                                                                                                                                         |
| `moduleResolution` for API       | `nodenext`                                | NestJS is a Node.js process, not a bundler target                                                                                                                                                                                  |
| `moduleResolution` for web zones | `bundler`                                 | Next.js 16 + Turbopack default                                                                                                                                                                                                     |
| CI                               | ci.yml fully wired, deploy stubs          | Team gets a working CI gate immediately                                                                                                                                                                                            |
| Terraform                        | All stubs                                 | Infra is a separate workstream; correct file structure is enough                                                                                                                                                                   |
| Storybook                        | Not in scaffold                           | Add when first real component is built                                                                                                                                                                                             |
| event-contracts events           | Fully stubbed (not empty)                 | Short, fully specced — no reason to leave as placeholders                                                                                                                                                                          |
| kernel schema stubs              | Pre-stubbed column shapes                 | Kernel is the first workstream deliverable; schema is fully specced                                                                                                                                                                |
| `data-platform/cubejs`           | Real config, stub cube definitions        | Data platform is operational from day one — not added later                                                                                                                                                                        |
| `agents/langfuse`                | Dockerfile only (upstream image)          | Self-hosted; no custom code; ECR push for air-gap compliance                                                                                                                                                                       |
| `data-platform/glue`             | Python scripts, not a container           | Glue is a managed runtime; no Docker/ECR needed                                                                                                                                                                                    |
| `apps/web-planner`               | Same pattern as all zones                 | Planner is a Q3 module per the proposal                                                                                                                                                                                            |
| Top-level folder split           | `apps/` + `agents/` + `data-platform/`    | `apps/` = ECS web/API services only. `agents/` = LLM platform (langfuse + tool contracts + prompts + evals). `data-platform/` = analytics infra (cubejs, glue). Deployment ownership and team ownership match the folder boundary. |
| Langfuse location                | `agents/langfuse/` (not `data-platform/`) | Langfuse observes agent calls, not the OLAP pipeline. Owned by the AI team. If agent team is idle, Langfuse is idle.                                                                                                               |

---

## Risks and Assumptions

| Item                     | Detail                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript 6             | `moduleResolution: "classic"` is removed. All tsconfigs must use `bundler` or `nodenext`. Verify no transitive dep requires `classic`.                 |
| Next.js 16               | `params` and `searchParams` must be awaited. Scaffold uses async page/layout signatures from day one.                                                  |
| Bun lockfile             | `bun.lockb` is binary. Commit it. Do not use `npm install` or `yarn install` — they generate a different lockfile format.                              |
| eslint-plugin-boundaries | Must be configured before first module code is written. Boundary violations caught at compile time, not review time.                                   |
| RLS `set_config`         | Third arg is always `false` (transaction-local). Integration test scaffold must set this before every query.                                           |
| Graviton ARM64           | All Dockerfiles must use `--platform linux/arm64`. Local Mac (Apple Silicon) builds match. Intel Mac developers need `--platform` override or Rosetta. |
