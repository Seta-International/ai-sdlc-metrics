# Foundation Backlog

**Source design:** `docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md` §6.1.
**State:** Completed in Sprints S1–S2 (2026-04-23 → 2026-05-06). All tickets `Status: Done`.
**Purpose:** Retroactive SDLC trace. Each Task documents what was built and where the artefact lives.
**Tickets:** 4 Epics, ~14 Tasks.

---

## [EPIC] FOUND-1 Monorepo & toolchain

ID: FOUND-1
Status: Done
Sprint: Sprint-1
Release: foundation
Priority: P0
Story Point: 13
Rank: 100
Jira Key:
Confluence Link:

### Summary

Turborepo + bun monorepo, eslint/tsconfig/lefthook/docker-compose.local, scripts. Foundation for all subsequent module work.

### Goal

By S1 close, a fresh `bun install` + `bun run db:up` + `bun run dev` produces a running local stack across all 11 web zones + the API.

### Scope

- Turborepo + bun workspaces
- Shared eslint, tsconfig, prettier configs in `packages/eslint-config`, `packages/tsconfig`
- lefthook pre-commit hooks (format-check, ddd-boundaries, design-tokens, ui-components)
- `docker-compose.local.yml` for Postgres + Redis + minio
- Repo-level scripts in `scripts/`

### Out of Scope

- Production CI/CD (DEPLOY-2)
- Production infra (DEPLOY-1)

### SRS Coverage

n/a — infrastructure, not user-visible behavior.

### Acceptance Criteria

- [x] `bun install` from clean clone completes without errors.
- [x] `turbo run build --filter=@future/*` builds all workspace packages.
- [x] `lefthook run pre-commit` passes on a no-op commit.
- [x] `bun run db:up` starts the local Postgres + Redis stack.

### Child Tickets

- FOUND-1.T1 Turborepo + bun workspace bootstrap (Task)
- FOUND-1.T2 Shared eslint / tsconfig / prettier configs (Task)
- FOUND-1.T3 lefthook pre-commit pipeline (Task)
- FOUND-1.T4 Docker Compose local stack (Task)

### Definition of Done

- All child Tasks `Status: Done`.
- A new engineer can clone the repo and run `bun install && bun run dev` on a fresh machine without manual intervention.

---

### [TASK] FOUND-1.T1 Turborepo + bun workspace bootstrap

ID: FOUND-1.T1
Status: Done
Epic: FOUND-1
Sprint: Sprint-1
Release: foundation
Priority: P0
Story Point: 5
Rank: 110
Jira Key:
Confluence Link:

#### Summary

Initialize Turborepo with bun as the package manager. Configure `turbo.json` pipelines for build, test, lint. Declare `apps/*` and `packages/*` workspaces.

#### Requirements

- Root `package.json` declares workspaces `apps/*` and `packages/*`.
- `turbo.json` defines pipelines: `build`, `dev`, `lint`, `typecheck`, `test`.
- `bunfig.toml` exists at repo root with sane defaults.
- `.npmrc` is absent (we use bun, not npm).

#### Acceptance Criteria

- [x] `bun install` completes without errors on a fresh clone.
- [x] `turbo run build --filter=@future/*` builds every workspace package.
- [x] `turbo run dev --filter=web-shell` starts the shell zone.
- [x] **E2E** — A developer running `bun install && cd apps/web-shell && bun run dev` sees the shell at `http://localhost:3000` within 90s of clean clone.

#### AI Execution Notes

**Built artefact:** `package.json`, `turbo.json`, `bun.lock`, `bunfig.toml`, `apps/`, `packages/`.

#### Testing Notes

- Manual: clone-and-build smoke test on a fresh machine.
- CI: `turbo run build --filter=@future/*` runs on every PR.

#### Dependencies

- Blocked by: none
- Blocks: FOUND-1.T2, FOUND-1.T3, FOUND-1.T4

#### Definition of Done

- Inherits project DoD.
- A new engineer can build the repo from a fresh clone in under 5 minutes.

---

### [TASK] FOUND-1.T2 Shared eslint / tsconfig / prettier configs

ID: FOUND-1.T2
Status: Done
Epic: FOUND-1
Sprint: Sprint-1
Release: foundation
Priority: P0
Story Point: 3
Rank: 120
Jira Key:
Confluence Link:

#### Summary

Extract shared lint, TypeScript compilation, and formatting rules into workspace packages so all `apps/*` and `packages/*` can extend a single source of truth without duplicating config.

#### Requirements

- `packages/eslint-config` exports `base.ts`, `nestjs.ts`, `nextjs.ts` configs.
- `packages/tsconfig` exports `base.json` and `nextjs.json` as reusable `extends` targets.
- Root `eslint.config.ts` extends `@future/eslint-config/base`.
- Root `tailwind.config.ts` provides shared Tailwind defaults for all zones.
- Prettier is configured at root with no per-package overrides.

#### Acceptance Criteria

- [x] All `apps/*` and `packages/*` extend `@future/tsconfig` or `@future/eslint-config` rather than maintaining local copies.
- [x] `turbo run lint` passes with zero errors on a clean clone.
- [x] `turbo run typecheck` passes with zero errors.
- [x] **E2E** — Running `bunx eslint apps/api/src/main.ts` from repo root produces no config-load error.

#### AI Execution Notes

**Built artefact:** `packages/eslint-config/` (exports `base.ts`, `nestjs.ts`, `nextjs.ts`), `packages/tsconfig/` (exports `base.json`, `nextjs.json`), `eslint.config.ts`, `tailwind.config.ts`.

#### Testing Notes

- Manual: `turbo run lint && turbo run typecheck` from repo root.
- CI: both commands run on every PR.

#### Dependencies

- Blocked by: FOUND-1.T1
- Blocks: FOUND-2.T1, FOUND-3.T1

#### Definition of Done

- Inherits project DoD.
- No per-package `tsconfig.json` duplicates the base rules.

---

### [TASK] FOUND-1.T3 lefthook pre-commit pipeline

ID: FOUND-1.T3
Status: Done
Epic: FOUND-1
Sprint: Sprint-1
Release: foundation
Priority: P0
Story Point: 2
Rank: 130
Jira Key:
Confluence Link:

#### Summary

Install and configure lefthook to run fast pre-commit checks that prevent common mistakes from reaching CI: formatting violations, DDD boundary imports, design-token deviations, and raw-HTML component anti-patterns.

#### Requirements

- `lefthook.yml` at repo root defines hooks: `format-check`, `ddd-boundaries`, `design-tokens`, `ui-components`.
- `bun run lefthook install` runs as a postinstall script.
- Each hook runs only on changed files (staged) for speed.
- Hooks must pass on an empty (no-op) commit.

#### Acceptance Criteria

- [x] `lefthook run pre-commit` exits 0 on a clean working tree.
- [x] Introducing a `prettier` violation causes the hook to fail with a clear message.
- [x] A direct `domain/` import across module boundaries causes the `ddd-boundaries` hook to fail.
- [x] **E2E** — A developer committing a file with `import './../../other-module/domain/entity'` sees the hook rejection before the commit is created.

#### AI Execution Notes

**Built artefact:** `lefthook.yml`.

#### Testing Notes

- Manual: staged-file test against known violations.
- Hook execution is idempotent — repeated runs produce the same result.

#### Dependencies

- Blocked by: FOUND-1.T1
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- All four hook categories are configured and documented in `lefthook.yml` comments.

---

### [TASK] FOUND-1.T4 Docker Compose local stack

ID: FOUND-1.T4
Status: Done
Epic: FOUND-1
Sprint: Sprint-1
Release: foundation
Priority: P0
Story Point: 3
Rank: 140
Jira Key:
Confluence Link:

#### Summary

Provide a zero-friction local development environment via Docker Compose: Postgres 16, Redis, and MinIO (S3-compatible storage), all pre-configured for the dev tenant seed.

#### Requirements

- `docker-compose.local.yml` defines services: `postgres`, `redis`, `minio`.
- `bun run db:up` starts all services; `bun run db:down` stops and optionally removes volumes.
- `docker/` directory contains any init scripts (e.g., Postgres init SQL for creating the `app` user and enabling extensions).
- Postgres port 5432, Redis port 6379, MinIO ports 9000/9001 exposed on localhost.
- Services use named volumes so data persists across restarts.

#### Acceptance Criteria

- [x] `bun run db:up` starts all three services without error on a fresh machine.
- [x] `bun run db:migrate` completes against the local Postgres.
- [x] The MinIO console is reachable at `http://localhost:9001`.
- [x] **E2E** — A developer following QUICKSTART.md reaches a running API (`/health` returns 200) using only `bun install && bun run db:up && bun run db:migrate && bun run dev`.

#### AI Execution Notes

**Built artefact:** `docker-compose.local.yml`, `docker/` (init scripts), `QUICKSTART.md`.

#### Testing Notes

- Manual: full QUICKSTART.md smoke test on a fresh machine.
- Verify data persists across `docker-compose restart` (named volumes).

#### Dependencies

- Blocked by: FOUND-1.T1
- Blocks: FOUND-2.T4

#### Definition of Done

- Inherits project DoD.
- QUICKSTART.md is accurate and requires no manual workarounds.

---

## [EPIC] FOUND-2 Backend & data layer

ID: FOUND-2
Status: Done
Sprint: Sprint-2
Release: foundation
Priority: P0
Story Point: 21
Rank: 200
Jira Key:
Confluence Link:

### Summary

NestJS modular monolith with hexagonal + DDD module template, tRPC AppRouter contribution pattern, Drizzle schema-per-module, RLS middleware, and request-bound `DB_TOKEN`. Foundation for all domain module work in S3–S5.

### Goal

By S2 close, any engineer can add a new domain module by copying the canonical template and wiring it with zero infrastructure changes.

### Scope

- NestJS API skeleton (`apps/api`) with `AppModule`
- Hexagonal + DDD module template: `domain/`, `application/`, `infrastructure/`, `interface/trpc/`
- tRPC router contribution per module, merged into a root `AppRouter`
- Drizzle ORM with `packages/db`, per-module schema files, single-file migration policy (`0000_initial.sql`)
- RLS middleware (`RlsMiddleware`) + request-bound `DB_TOKEN` (`RequestDbProxy`)
- `tenant_id` column on every table enforced via RLS policies

### Out of Scope

- Domain business logic for any specific module (covered by S3–S5 epics)
- Production database provisioning (DEPLOY-1)

### SRS Coverage

n/a — infrastructure, not user-visible behavior.

### Acceptance Criteria

- [x] `bun run dev` starts the API with all modules loaded.
- [x] Any tRPC route returns a valid response with RLS session active.
- [x] A query hitting a table for `tenant_id = 'other'` returns zero rows under RLS.
- [x] `bun run db:generate --name initial` regenerates `0000_initial.sql` cleanly.

### Child Tickets

- FOUND-2.T1 NestJS API skeleton + module bootstrap (Task)
- FOUND-2.T2 Hexagonal + DDD module template (Task)
- FOUND-2.T3 tRPC + AppRouter contribution per module (Task)
- FOUND-2.T4 Drizzle + schema-per-module + single-file migration policy (Task)
- FOUND-2.T5 RLS middleware + tenant_id contract + request-bound DB token (Task)

### Definition of Done

- All child Tasks `Status: Done`.
- A synthetic dual-tenant query returns zero cross-tenant rows.

---

### [TASK] FOUND-2.T1 NestJS API skeleton + module bootstrap

ID: FOUND-2.T1
Status: Done
Epic: FOUND-2
Sprint: Sprint-2
Release: foundation
Priority: P0
Story Point: 3
Rank: 210
Jira Key:
Confluence Link:

#### Summary

Bootstrap the NestJS application in `apps/api`. Wire `AppModule` with shared infrastructure providers (DB, RLS, tRPC, health, jobs) so subsequent domain modules can be registered without touching the bootstrap code.

#### Requirements

- `apps/api/src/main.ts` bootstraps NestJS with `AppModule`.
- `apps/api/src/app.module.ts` imports: `DbModule`, `RlsModule`, `TrpcModule`, `HealthModule`, `JobsModule`.
- All domain modules are registered via `AppModule.imports`.
- `GET /health` returns `{ status: 'ok' }`.
- `apps/api` uses `module: nodenext` + CommonJS output (no `.js` extensions in imports).

#### Acceptance Criteria

- [x] `bun run dev --filter=api` starts without error.
- [x] `curl http://localhost:3001/health` returns `{ "status": "ok" }`.
- [x] Adding a new NestJS module to `AppModule.imports` requires no other changes to bootstrap.
- [x] **E2E** — The API health endpoint is reachable from any running web zone via the Next.js proxy config.

#### AI Execution Notes

**Built artefact:** `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/common/` (health, jobs, trpc, rls, db sub-directories).

#### Testing Notes

- Unit: `AppModule` compiles without error.
- Manual: `bun run dev` + health check.

#### Dependencies

- Blocked by: FOUND-1.T2
- Blocks: FOUND-2.T2, FOUND-2.T3, FOUND-2.T4, FOUND-2.T5

#### Definition of Done

- Inherits project DoD.
- `GET /health` returns 200 in all environments.

---

### [TASK] FOUND-2.T2 Hexagonal + DDD module template

ID: FOUND-2.T2
Status: Done
Epic: FOUND-2
Sprint: Sprint-2
Release: foundation
Priority: P0
Story Point: 5
Rank: 220
Jira Key:
Confluence Link:

#### Summary

Establish the canonical hexagonal + DDD module layout used by every domain module. The `planner` module serves as the reference template. Each module has `domain/`, `application/`, `infrastructure/`, and `interface/trpc/` layers, and exports only its `*QueryFacade` from the module `exports` array.

#### Requirements

- `domain/` contains: `entities/`, `value-objects/`, `ports/`, `repositories/`, `events/`, `exceptions/`.
- `application/` contains: `commands/`, `queries/`, `facades/`, `event-handlers/`, `services/`.
- `infrastructure/` contains: `schema/`, `repositories/` (Drizzle implementations), `listeners/`.
- `interface/trpc/` contains the module's tRPC router contribution.
- Module `exports` array exposes only `*QueryFacade` (never raw repository tokens or domain entities).
- No imports from another module's `domain/` or `infrastructure/` paths.

#### Acceptance Criteria

- [x] The `planner` module compiles with the canonical layout in place.
- [x] `AppModule` imports `PlannerModule` and only `PlannerQueryFacade` is in `exports`.
- [x] A lefthook `ddd-boundaries` check rejects a cross-module `domain/` import.
- [x] **E2E** — Adding a new module by copying the `planner` layout and registering it in `AppModule` requires no changes outside the new module directory.

#### AI Execution Notes

**Built artefact:** `apps/api/src/modules/planner/` (canonical template with `domain/`, `application/`, `infrastructure/`, `interface/`, `planner.module.ts`).

#### Testing Notes

- Structural: lint check that no module imports from another module's `domain/` or `infrastructure/`.
- Unit: `PlannerModule` compiles and exports only `PlannerQueryFacade`.

#### Dependencies

- Blocked by: FOUND-2.T1
- Blocks: FOUND-2.T3, FOUND-2.T4

#### Definition of Done

- Inherits project DoD.
- `CLAUDE.md` module-layout section accurately describes the canonical template.

---

### [TASK] FOUND-2.T3 tRPC + AppRouter contribution per module

ID: FOUND-2.T3
Status: Done
Epic: FOUND-2
Sprint: Sprint-2
Release: foundation
Priority: P0
Story Point: 3
Rank: 230
Jira Key:
Confluence Link:

#### Summary

Wire tRPC end-to-end: each domain module contributes a router to a root `AppRouter` in `apps/api`; `packages/api-client` exports the typed client used by all web zones.

#### Requirements

- `apps/api/src/common/trpc/` bootstraps the tRPC server with `createTRPCRouter` and auth/permission middleware.
- Each domain module's `interface/trpc/` exports a sub-router merged into the root `AppRouter`.
- `packages/api-client/src/client.ts` creates and exports the typed tRPC client.
- `packages/api-client/src/index.ts` re-exports router type and client factory.
- Web zones import the client from `@future/api-client`, not directly from `apps/api`.

#### Acceptance Criteria

- [x] A tRPC query from `web-planner` resolves via the typed `AppRouter` without a manual type cast.
- [x] Adding a new sub-router to a domain module's `interface/trpc/` requires no changes outside that module.
- [x] `@future/api-client` builds without errors after any domain module adds a new procedure.
- [x] **E2E** — Opening `web-planner` in a browser produces a successful tRPC response visible in the Network tab.

#### AI Execution Notes

**Built artefact:** `apps/api/src/common/trpc/` (auth-middleware, permission-middleware, router bootstrap), `apps/api/src/modules/planner/interface/trpc/` (planner.router.ts, task.router.ts, bucket.router.ts, plan.router.ts, evidence.router.ts, attachment.router.ts, checklist.router.ts, comment.router.ts, label.router.ts, ms-sync.router.ts, personal.router.ts), `packages/api-client/src/client.ts`, `packages/api-client/src/index.ts`.

#### Testing Notes

- Unit: planner router service returns typed results.
- Integration: `planner.router.integration.spec.ts` against real DB.
- E2E: Playwright request intercept in `apps/e2e`.

#### Dependencies

- Blocked by: FOUND-2.T1, FOUND-2.T2
- Blocks: FOUND-3.T1

#### Definition of Done

- Inherits project DoD.
- `packages/api-client` is the only tRPC client import in web zones.

---

### [TASK] FOUND-2.T4 Drizzle + schema-per-module + single-file migration policy

ID: FOUND-2.T4
Status: Done
Epic: FOUND-2
Sprint: Sprint-2
Release: foundation
Priority: P0
Story Point: 5
Rank: 240
Jira Key:
Confluence Link:

#### Summary

Configure Drizzle ORM with a schema-per-module layout. Each domain module owns its Drizzle schema in `infrastructure/schema/`. All migrations are squashed into a single `packages/db/drizzle/migrations/0000_initial.sql`; no numbered migration files are ever added.

#### Requirements

- `packages/db` exports the Drizzle client factory, migration runner, and `append-rls.ts` utility.
- Each module's schema file lives in `apps/api/src/modules/<module>/infrastructure/schema/`.
- `packages/db/drizzle/migrations/0000_initial.sql` is the only migration file.
- `packages/db/drizzle.config.ts` points at all module schema files.
- `bun run db:generate --name initial` regenerates `0000_initial.sql` cleanly.
- `bun run db:migrate` applies the single migration idempotently.

#### Acceptance Criteria

- [x] `bun run db:generate --name initial` produces exactly one `.sql` file and no numbered files.
- [x] `bun run db:migrate` on a fresh database applies all tables without error.
- [x] Every module schema file is imported by `drizzle.config.ts`; adding a new table to any module schema is picked up on next `db:generate`.
- [x] **E2E** — After `bun run db:down -v && bun run db:up && bun run db:migrate`, all tables exist and the API starts without schema errors.

#### AI Execution Notes

**Built artefact:** `packages/db/` (src/index.ts, src/append-rls.ts, src/migrate.ts, drizzle.config.ts, drizzle/migrations/0000_initial.sql), `apps/api/src/modules/*/infrastructure/schema/` (per-module Drizzle schema files).

#### Testing Notes

- Integration: `packages/db/src/test-helpers/` for test DB setup.
- Fresh-migration integration test: `apps/api/src/common/fresh-migrations.integration.spec.ts`.

#### Dependencies

- Blocked by: FOUND-1.T4, FOUND-2.T1
- Blocks: FOUND-2.T5

#### Definition of Done

- Inherits project DoD.
- Single-file migration policy is documented in `CLAUDE.md` and enforced by a CI step.

---

### [TASK] FOUND-2.T5 RLS middleware + tenant_id contract + request-bound DB token

ID: FOUND-2.T5
Status: Done
Epic: FOUND-2
Sprint: Sprint-2
Release: foundation
Priority: P0
Story Point: 8
Rank: 250
Jira Key:
Confluence Link:

#### Summary

Implement Row-Level Security (RLS): every request checks out a single `pg.PoolClient`, sets the `app.tenant_id` session variable, and all Drizzle queries in that request run through a `DB_TOKEN` proxy bound to that client. No `Promise.all` for DB queries; no cross-tenant data leakage.

#### Requirements

- `RlsMiddleware` (NestJS middleware) checks out a client from the pool, sets `SET LOCAL app.tenant_id = '...'`, and stores it on the request.
- `RequestDbProxy` implements the Drizzle client interface and delegates to the request-bound client.
- `DB_TOKEN` injection token is registered per-request via `REQUEST` scope providers.
- Every Drizzle schema table has a `tenant_id` column; RLS policies enforce `app.tenant_id` equality.
- `append-rls.ts` in `packages/db` appends RLS policy SQL to the generated migration.

#### Acceptance Criteria

- [x] A query for `tenant_id = 'other'` returns zero rows when the session is set for `'my-tenant'`.
- [x] Concurrent requests for different tenants never share the same client.
- [x] A handler injecting `DB_TOKEN` gets the request-scoped Drizzle instance, not a pool-level instance.
- [x] All Drizzle schema tables have a `tenant_id uuid not null` column per schema inspection.
- [x] **E2E** — A synthetic dual-tenant probe (`apps/api/src/common/tenant-context.integration.spec.ts`) asserts zero cross-tenant row leakage.

#### AI Execution Notes

**Built artefact:** `apps/api/src/common/rls/rls.middleware.ts`, `apps/api/src/common/db/db.module.ts`, `apps/api/src/common/db/request-db.proxy.ts`, `apps/api/src/common/db/request-db-context.service.ts`, `packages/db/src/append-rls.ts`. Tenant context integration spec: `apps/api/src/common/tenant-context.integration.spec.ts`.

#### Testing Notes

- Unit: `rls.middleware.spec.ts`, `request-db.proxy.spec.ts`.
- Integration: `tenant-context.integration.spec.ts` dual-tenant probe.
- Every future integration spec that touches DB must assert no cross-tenant leak.

#### Dependencies

- Blocked by: FOUND-2.T4
- Blocks: FOUND-3.T1, FOUND-4.T1

#### Definition of Done

- Inherits project DoD.
- Dual-tenant probe is green and runs on every PR.
- Every Drizzle table has `tenant_id` — enforced by `append-rls.ts` at migration generation time.

---

## [EPIC] FOUND-3 Frontend skeleton & design system

ID: FOUND-3
Status: Done
Sprint: Sprint-2
Release: foundation
Priority: P0
Story Point: 13
Rank: 300
Jira Key:
Confluence Link:

### Summary

Next.js multi-zone scaffold (11 feature zones + `web-shell`), `packages/app-layout` sidebar contract, `packages/ui` design system, `DESIGN.md`, and all cross-cutting frontend packages. Foundation for all zone-level UI work in S3–S5.

### Goal

By S2 close, every zone renders a page with `<AppLayout>` sidebar and tRPC data, using only `@future/ui` components, with no hydration mismatches.

### Scope

- 11 Next.js feature zones + `web-shell` under `apps/`
- `packages/app-layout`: `<AppLayout>`, sidebar `NavGroup` contract, `PermissionContext`
- `packages/ui`: shared component library (Button, Input, Skeleton, Alert, etc.)
- `DESIGN.md`: design tokens, typography, spacing, radii, motion rules
- Cross-cutting packages: `packages/{charts,activity-log,documents,core}`

### Out of Scope

- Feature UI within any zone (covered by S3–S5 epics)
- Zone-specific CI/CD pipelines (DEPLOY-2)

### SRS Coverage

n/a — infrastructure, not user-visible behavior.

### Acceptance Criteria

- [x] All 12 zones (`web-shell` + 11 feature zones) build without error.
- [x] `<AppLayout>` renders in every zone with the sidebar and no hydration warning.
- [x] `packages/ui` exports all primitive components; no raw `<button>` or `<input>` in zone UI code.
- [x] `DESIGN.md` documents all design tokens, typography scale, and component rules.

### Child Tickets

- FOUND-3.T1 Next.js multi-zones scaffold (11 zones + shell) (Task)
- FOUND-3.T2 packages/app-layout + sidebar contract (Task)
- FOUND-3.T3 packages/ui design system + DESIGN.md + cross-cutting FE packages (Task)

### Definition of Done

- All child Tasks `Status: Done`.
- No zone imports directly from another zone.
- All cross-zone navigation uses plain `<a>` hard reloads.

---

### [TASK] FOUND-3.T1 Next.js multi-zones scaffold (11 zones + shell)

ID: FOUND-3.T1
Status: Done
Epic: FOUND-3
Sprint: Sprint-2
Release: foundation
Priority: P0
Story Point: 5
Rank: 310
Jira Key:
Confluence Link:

#### Summary

Scaffold all 12 Next.js zone applications (`web-shell` + 11 feature zones). Each zone is an independent Next.js app with its own ECS service. Cross-zone navigation uses plain `<a>` hard reloads. Each zone reads session from an httpOnly cookie via `@future/auth`.

#### Requirements

- `apps/web-{shell,admin,finance,goals,hiring,insights,people,performance,planner,projects,time}` each contain a minimal Next.js `app/` with `layout.tsx` and placeholder `page.tsx`.
- Each zone's `next.config.ts` configures the zone's base path and rewrites for the API proxy.
- Zones are fully autonomous: no shared Next.js context across zone boundaries.
- `apps/web-shell` owns SSO and magic-link flows at `auth/callback/microsoft`, `auth/callback/google`, `auth/magic/[token]`, and `api/auth/me`.
- Each zone's `src/proxy.ts` proxies tRPC calls to `apps/api`.

#### Acceptance Criteria

- [x] `turbo run build --filter=web-*` builds all 12 zones without error.
- [x] Each zone renders a page at its root route without hydration warnings.
- [x] `apps/web-shell` serves the login page and SSO callback routes.
- [x] **E2E** — Navigating from `web-shell` to `web-planner` via a hard `<a>` link preserves the session cookie and renders the planner page.

#### AI Execution Notes

**Built artefact:** `apps/web-shell/` (src/app/layout.tsx, src/app/page.tsx, src/app/auth/login/page.tsx, src/app/auth/callback/microsoft/route.ts, src/app/auth/callback/google/route.ts, src/app/auth/magic/[token]/route.ts, src/app/api/auth/me/route.ts, src/proxy.ts, next.config.ts), `apps/web-planner/`, `apps/web-people/`, `apps/web-admin/`, `apps/web-finance/`, `apps/web-goals/`, `apps/web-hiring/`, `apps/web-insights/`, `apps/web-performance/`, `apps/web-projects/`, `apps/web-time/`.

#### Testing Notes

- Manual: build smoke test for all 12 zones.
- E2E: Playwright cross-zone navigation in `apps/e2e`.

#### Dependencies

- Blocked by: FOUND-1.T2, FOUND-2.T3, FOUND-2.T5
- Blocks: FOUND-3.T2, FOUND-3.T3, FOUND-4.T1

#### Definition of Done

- Inherits project DoD.
- No zone imports from another zone's directory.
- Cross-zone `<a>` navigation pattern is documented in `CLAUDE.md`.

---

### [TASK] FOUND-3.T2 packages/app-layout + sidebar contract

ID: FOUND-3.T2
Status: Done
Epic: FOUND-3
Sprint: Sprint-2
Release: foundation
Priority: P0
Story Point: 3
Rank: 320
Jira Key:
Confluence Link:

#### Summary

Build `packages/app-layout` providing `<AppLayout>`, the sidebar `NavGroup` contract, `PermissionContext`, and `useCanAccess`. The sidebar is rendered once; zones never build a local sidebar. A `NavGroup` has exactly one of `items` (static) or `render` (dynamic React component) — never both.

#### Requirements

- `packages/app-layout/src/app-layout.tsx` exports `<AppLayout>` wrapping children with `<GlobalNav>`.
- `packages/app-layout/src/types.ts` defines `NavGroup` as a discriminated union: `{ items: NavItem[] } | { render: React.ComponentType }`.
- `packages/app-layout/src/permission-provider.tsx` exports `PermissionContext` and `<PermissionProvider>`.
- `packages/app-layout/src/use-can-access.ts` exports `useCanAccess(permission)` consuming `PermissionContext`.
- `packages/app-layout/src/sidebar/` contains sidebar primitives used by `render` components.
- No `NavGroup` may have both `items` and `render` — enforced by TypeScript discriminated union.

#### Acceptance Criteria

- [x] `<AppLayout>` renders without error in every zone.
- [x] A `NavGroup` with both `items` and `render` causes a TypeScript compile error.
- [x] `useCanAccess` returns the correct boolean based on the `PermissionContext` value.
- [x] **E2E** — The sidebar renders in `web-planner` with the correct nav items for the authenticated user's permissions.

#### AI Execution Notes

**Built artefact:** `packages/app-layout/src/app-layout.tsx`, `packages/app-layout/src/types.ts`, `packages/app-layout/src/permission-provider.tsx`, `packages/app-layout/src/use-can-access.ts`, `packages/app-layout/src/sidebar/`, `packages/app-layout/src/session-user-menu.tsx`, `packages/app-layout/src/zone-routes.ts`, `packages/app-layout/src/index.ts`.

#### Testing Notes

- Unit: `app-layout.spec.tsx`, `permission-provider.spec.tsx`, `use-can-access.spec.tsx`.
- Type-check: TypeScript rejects dual-shape `NavGroup`.

#### Dependencies

- Blocked by: FOUND-3.T1
- Blocks: FOUND-3.T3

#### Definition of Done

- Inherits project DoD.
- `CLAUDE.md` sidebar/navigation rule is consistent with the `NavGroup` discriminated-union contract.

---

### [TASK] FOUND-3.T3 packages/ui design system + DESIGN.md + cross-cutting FE packages

ID: FOUND-3.T3
Status: Done
Epic: FOUND-3
Sprint: Sprint-2
Release: foundation
Priority: P0
Story Point: 5
Rank: 330
Jira Key:
Confluence Link:

#### Summary

Establish `packages/ui` as the shared component library for all zones: primitives (Button, Input, Textarea, Skeleton, Alert, Spinner, etc.), plus design tokens in `DESIGN.md`. Wire cross-cutting packages: `packages/{charts,activity-log,documents,core}`. No raw `<button>` or `<input>` in any zone UI.

#### Requirements

- `packages/ui` exports all design-system primitives used in CLAUDE.md §UI/UX Consistency table.
- `DESIGN.md` at repo root documents font choices, color tokens, spacing scale, radii, motion rules, and per-component rules.
- `packages/charts` exports chart primitives for analytics surfaces.
- `packages/activity-log` exports the activity-log component used by planner and agents.
- `packages/documents` exports document-upload and preview components.
- `packages/core` exports shared domain-agnostic utilities (types, constants, error shapes).
- `lefthook.yml` `ui-components` hook rejects raw `<button>`, `<input>`, `<textarea>` in zone source files.

#### Acceptance Criteria

- [x] `packages/ui` builds and all primitives import cleanly in any zone.
- [x] `DESIGN.md` covers all sections required by `CLAUDE.md §Design System`.
- [x] The `ui-components` lefthook hook fails on a file containing a raw `<button>`.
- [x] **E2E** — Every rendered page in every zone uses only `@future/ui` interactive components with no raw HTML buttons or inputs visible in the DOM.

#### AI Execution Notes

**Built artefact:** `packages/ui/src/` (components, hooks, icons.ts, lib/, styles/, tokens/, index.ts), `DESIGN.md`, `packages/charts/`, `packages/activity-log/`, `packages/documents/`, `packages/core/`.

#### Testing Notes

- Unit: component render tests in `packages/ui`.
- Lint: `ui-components` lefthook hook.
- Visual: storybook (if present) or manual review per `DESIGN.md`.

#### Dependencies

- Blocked by: FOUND-3.T2
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- `DESIGN.md` is the authoritative source for all visual decisions; deviations require explicit user approval.

---

## [EPIC] FOUND-4 Auth & session

ID: FOUND-4
Status: Done
Sprint: Sprint-2
Release: foundation
Priority: P0
Story Point: 8
Rank: 400
Jira Key:
Confluence Link:

### Summary

`packages/auth` provides token parsing, session hook, and the `/api/auth/me` route handler. `web-shell` implements SSO (Microsoft Entra + Google) and magic-link flows. Session travels as an httpOnly cookie; all zones read it via `useSession`.

### Goal

By S2 close, a user can sign in via Entra OIDC or Google OAuth or magic link in `web-shell` and every zone sees a live `Session` without additional auth integration work.

### Scope

- `packages/auth`: `parseToken`, `useSession`, `handleAuthMe`
- `web-shell` SSO callbacks (Microsoft `/auth/callback/microsoft`, Google `/auth/callback/google`) and magic-link (`/auth/magic/[token]`)
- Session cookie contract: httpOnly, SameSite=Lax, signed JWT
- IdP shape: Microsoft Entra (`auth/auth-config.ts`) and Google (`auth/auth-gateway-client.ts`)

### Out of Scope

- Directory sync / user provisioning (identity module, S3+)
- Delegation grants (FOUND-2.T5 schema; AGN-5 full implementation)

### SRS Coverage

n/a — infrastructure, not user-visible behavior.

### Acceptance Criteria

- [x] `useSession()` returns the authenticated user in every web zone.
- [x] Microsoft Entra OIDC callback creates a valid session cookie.
- [x] Google OAuth callback creates a valid session cookie.
- [x] Magic-link flow creates a valid session cookie.
- [x] `handleAuthMe` returns 401 on missing/expired cookie.

### Child Tickets

- FOUND-4.T1 packages/auth (parseToken, useSession, me-route) (Task)
- FOUND-4.T2 Session cookie contract + IdP shape (Entra/Google) (Task)

### Definition of Done

- All child Tasks `Status: Done`.
- A new zone reading session requires only `import { useSession } from '@future/auth'`.

---

### [TASK] FOUND-4.T1 packages/auth (parseToken, useSession, me-route)

ID: FOUND-4.T1
Status: Done
Epic: FOUND-4
Sprint: Sprint-2
Release: foundation
Priority: P0
Story Point: 5
Rank: 410
Jira Key:
Confluence Link:

#### Summary

Build `packages/auth` with three exports: `parseToken` (server-side JWT decode + claim extraction), `useSession` (client-side React hook reading the session from `/api/auth/me`), and `handleAuthMe` (Next.js route handler for `GET /api/auth/me`).

#### Requirements

- `packages/auth/src/parse-token.ts` exports `parseToken(jwt): FutureTokenClaims` with claim type `{ sub, email, tenantId, roles, exp }`.
- `packages/auth/src/use-session.ts` exports `useSession(): Session | null` using `useSyncExternalStore` with a safe server snapshot (`null`).
- `packages/auth/src/me-route.ts` exports `handleAuthMe` as a Next.js route handler that verifies the cookie and returns the session JSON or 401.
- `packages/auth/src/index.ts` re-exports all three.
- No `window.location`, `localStorage`, or `sessionStorage` in `useState` initializers or component bodies (SSR safety rule).

#### Acceptance Criteria

- [x] `parseToken` returns typed `FutureTokenClaims` for a valid JWT and throws for an expired or malformed token.
- [x] `useSession` returns `null` on the server render and the populated `Session` on the client after hydration.
- [x] `handleAuthMe` returns 401 for a missing cookie and the session JSON for a valid cookie.
- [x] `packages/auth` builds without error after `bun run --filter @future/auth build`.
- [x] **E2E** — `GET /api/auth/me` from `web-shell` returns `{ sub, email, tenantId, roles }` for an authenticated user.

#### AI Execution Notes

**Built artefact:** `packages/auth/src/parse-token.ts`, `packages/auth/src/use-session.ts`, `packages/auth/src/me-route.ts`, `packages/auth/src/index.ts`. Test: `packages/auth/src/parse-token.spec.ts`.

#### Testing Notes

- Unit: `parse-token.spec.ts` — valid JWT, expired JWT, malformed JWT.
- Unit: `useSession` SSR snapshot returns `null`.
- Integration: `handleAuthMe` with a real signed cookie.

#### Dependencies

- Blocked by: FOUND-2.T5, FOUND-3.T1
- Blocks: FOUND-4.T2

#### Definition of Done

- Inherits project DoD.
- `useSession` never reads `window.location`, `localStorage`, or `sessionStorage` at initializer time.

---

### [TASK] FOUND-4.T2 Session cookie contract + IdP shape (Entra/Google)

ID: FOUND-4.T2
Status: Done
Epic: FOUND-4
Sprint: Sprint-2
Release: foundation
Priority: P0
Story Point: 3
Rank: 420
Jira Key:
Confluence Link:

#### Summary

Define the session cookie contract (httpOnly, SameSite=Lax, signed JWT payload shape) and implement the Microsoft Entra OIDC and Google OAuth callback routes in `web-shell`. Magic-link token exchange is also covered. The IdP selection (Entra vs Google) is determined by the tenant's primary IdP config in `auth-config.ts`.

#### Requirements

- Session cookie is httpOnly, SameSite=Lax, signed with a secret from AWS Secrets Manager (local: env var).
- JWT payload matches `FutureTokenClaims` from `packages/auth`.
- `apps/web-shell/src/app/auth/callback/microsoft/route.ts` handles Entra OIDC code exchange.
- `apps/web-shell/src/app/auth/callback/google/route.ts` handles Google OAuth code exchange.
- `apps/web-shell/src/app/auth/magic/[token]/route.ts` validates magic-link token and sets cookie.
- `apps/web-shell/src/lib/auth-config.ts` determines which IdP flows are enabled per tenant.
- `apps/web-shell/src/lib/auth-gateway-client.ts` wraps API calls to the identity module for token validation.

#### Acceptance Criteria

- [x] Microsoft Entra OIDC callback creates a valid session cookie with correct `FutureTokenClaims`.
- [x] Google OAuth callback creates a valid session cookie with correct `FutureTokenClaims`.
- [x] Magic-link token exchange sets a valid session cookie and redirects to the tenant's home zone.
- [x] The session cookie is absent from `document.cookie` (httpOnly confirmed via browser DevTools).
- [x] `parseToken` successfully validates the cookie JWT and returns typed claims.
- [x] **E2E** — A user completing the Microsoft Entra sign-in flow is redirected to `web-planner` with an active session visible via `useSession()`.

#### AI Execution Notes

**Built artefact:** `apps/web-shell/src/app/auth/callback/microsoft/route.ts`, `apps/web-shell/src/app/auth/callback/google/route.ts`, `apps/web-shell/src/app/auth/magic/[token]/route.ts`, `apps/web-shell/src/app/auth/logout/route.ts`, `apps/web-shell/src/lib/auth-config.ts`, `apps/web-shell/src/lib/auth-gateway-client.ts`. Session contract enforced via `packages/auth/src/parse-token.ts`.

#### Testing Notes

- Unit: `auth-gateway-client` with mocked API responses.
- Integration: full Entra OIDC mock exchange in `apps/e2e`.
- Security: confirm cookie flags via `set-cookie` response header inspection.

#### Dependencies

- Blocked by: FOUND-4.T1
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Session cookie flags (httpOnly, SameSite=Lax, Secure in prod) are verified by integration test.
- Both IdP flows (Entra and Google) are tested end-to-end in `apps/e2e`.
