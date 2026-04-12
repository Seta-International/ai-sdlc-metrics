# Future — Agent as a Service

## Stack

| Layer         | Technology                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------- |
| Frontend      | Next.js Multi-Zones (11 zones + shell)                                                       |
| Backend       | NestJS modular monolith (Turborepo)                                                          |
| API           | tRPC (end-to-end type-safe)                                                                  |
| Database      | PostgreSQL 16 — Drizzle ORM, schema-per-module, RLS                                          |
| Jobs          | pg-boss                                                                                      |
| Events        | `outbox_event` + polling relay                                                               |
| Analytics     | Glue ETL → S3 Parquet → Iceberg → Athena → Cube.js                                           |
| AI            | Vercel AI SDK + OpenAI (`gpt-5.4-nano` classify, `gpt-5.4` reason, `text-embedding-3-small`) |
| Observability | Langfuse (self-hosted ECS)                                                                   |
| Infra         | AWS ECS Fargate Graviton ARM64, Terraform, ap-southeast-1                                    |

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

## Frontend (Next.js Multi-Zones)

- 11 independent zones + `web-shell`. Each has its own ECS service, ECR repo, CI pipeline.
- `web-shell` owns SSO (Entra or Google, based on tenant's primary IdP) + magic link flow. Outage does not affect users inside module zones.
- `web-admin` — tenant self-service (AI config, module toggles). `platform_admin` = SETA operator view.
- Zones are fully autonomous: session from httpOnly cookie, `<GlobalNav />` from `packages/ui`.
- Cross-zone navigation = hard `<a>` reload. No Next.js `<Link>` across zones.

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
- Tests co-located: `foo.handler.spec.ts` next to `foo.handler.ts`. **Never use `__tests__/` directories.** Jest convention — banned in this repo.

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
- No `--force`. No `git reset --hard` on shared branches.

### DDD Module Boundaries

- **Never import from another module's `domain/` or `infrastructure/` path.** The only permitted cross-module imports are the module's exported facades.
- **Each module exports facades only.** The `exports` array contains `*QueryFacade` and `*AuditFacade` classes — never raw repository tokens or domain entities.
- **Cross-module reads go through `QueryFacade`.** Cross-module writes go through a dedicated write facade (e.g. `KernelAuditFacade`). No module ever injects a repository token owned by another module.
- **Ports belong in `domain/ports/`.** Repository interfaces belong in `domain/repositories/` (no `.port` suffix). Never mix the two directories.
- **No silent stubs in production paths.** `useValue: {}` or any `Stub*` class wired into a module is a temporary placeholder only — it must be replaced before the feature ships. Stubs that silently swallow calls are bugs waiting to happen.

### When in Doubt, Ask

- Ambiguous requirement → ask before implementing.
- Meaningful tradeoff → surface it, don't silently pick one.

## Workspace Package Builds

Workspace packages (`@future/db`, `@future/event-contracts`, `@future/storage`, etc.) export from `./dist/` and must be built before tests run. If you see `Failed to resolve entry for package "@future/..."`, run:

```bash
bun run --filter @future/<package-name> build
```

In a fresh worktree or after `bun install`, always pre-build all workspace packages before running `test:unit`:

```bash
bun run --filter "@future/*" build
```

## Design System

Always read `DESIGN.md` before making any visual or UI decision.
All font choices, colors, spacing, radii, motion, and component rules are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that does not match `DESIGN.md`.
