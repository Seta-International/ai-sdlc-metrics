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
| Analytics     | Glue ETL → S3 Parquet → Iceberg → Athena                                                     |
| AI            | Vercel AI SDK + OpenAI (`gpt-5.4-nano` classify, `gpt-5.4` reason, `text-embedding-3-small`) |
| Observability | _deferred_ — see roadmap                                                                     |
| Infra         | AWS ECS Fargate Graviton ARM64, Terraform, ap-southeast-1                                    |

## Domain Modules

| Module        | Schema        | Owns                                                                                                                                                                                   |
| ------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kernel`      | `core`        | Authority (role_grant, role_permission, delegation), decisions, events, exposure                                                                                                       |
| `identity`    | `identity`    | Authentication (SSO, magic link), IdP config, directory sync, user provisioning                                                                                                        |
| `people`      | `people`      | Employment profiles, org placements, offboarding                                                                                                                                       |
| `time`        | `time`        | Attendance, leave, OT, timesheets                                                                                                                                                      |
| `hiring`      | `hiring`      | Recruitment, pipeline, interviews, offers                                                                                                                                              |
| `performance` | `performance` | Review cycles, evaluations, feedback                                                                                                                                                   |
| `projects`    | `projects`    | Staffing, assignments, delivery                                                                                                                                                        |
| `finance`     | `finance`     | Invoices, payroll, budget                                                                                                                                                              |
| `goals`       | `goals`       | OKRs, KPIs, objectives                                                                                                                                                                 |
| `insights`    | `insights`    | Analytics proxy to Athena — no tables                                                                                                                                                  |
| `agents`      | `agents`      | Agent configs, sessions, messages, tools                                                                                                                                               |
| `planner`     | `planner`     | Task tracking, evidence capture. (Bidirectional sync with MS 365 Planner lives in this module; AI reminders + KPI linkage are layered by goals/agents modules in a later sub-project.) |
| `admin`       | `admin`       | Tenant settings, AI config, module toggles                                                                                                                                             |

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

### Database Migrations (Development Phase)

- **One file only: `0000_initial.sql`.** Never add numbered migrations — squash all schema changes into the initial file.
- To apply a change: update the Drizzle schema → delete all `.sql` files + `meta/` snapshots → `bun run db:generate --name initial` → `bun run db:down -v && bun run db:up && bun run db:migrate`.
- Lifted at stable Beta when real tenant data exists.

### Infrastructure

- Terraform only. No manual AWS console changes.
- ARM64 (`linux/arm64`) only. No x86-only deps.
- Secrets in AWS Secrets Manager. Never in env files, DB, or hardcoded.
- Every table has `tenant_id`. No exceptions.
- Zones never query the DB directly — all data via `apps/api` tRPC.

### No Backward Compatibility

- No shims, no deprecated aliases. Update callers; never preserve old interfaces.

### SSR / Hydration Safety

- **Never read `window.location`, `localStorage`, or `sessionStorage` in `useState` initializers or component bodies.** These APIs are undefined on the server and cause hydration mismatches.
- URL state → `useSearchParams()` + `usePathname()` from `next/navigation`. Pass them as arguments; never access `window.location` directly.
- Client-only storage (localStorage) → `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` where `getServerSnapshot` returns the safe default.
- Mutations that write to localStorage → dispatch a custom `Event` after writing so `useSyncExternalStore` subscribers re-render in the same tab.

### Navigation / Sidebar

- The sidebar is owned by `@future/app-layout`, rendered once via `<AppLayout>`. Never build a zone-local sidebar.
- A `NavGroup` has **exactly one** of `items` (static) or `render` (dynamic React component using hooks / tRPC). Never both, no fallback logic, no dual-shape shims.
- **Personal Hubs** — every zone's sidebar config may contribute a dynamic `render` group for Personal Hubs (My Day / My Tasks / My Plans). Render components must use React Query, respect `PermissionContext`, and render only `@future/ui` sidebar primitives.

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
- To audit dependency updates, run `bun run deps:outdated` from the repo root. It scans `apps/*` and `packages/*` directly.
- To update those folders, use `bun run deps:update`, `bun run deps:update:interactive`, or `bun run deps:update:latest` from the repo root.
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

### Database Queries in Handlers

- **Never use `Promise.all` for DB queries inside command/query handlers.** The request-bound DB (`DB_TOKEN`) uses a single `pg.PoolClient` per request (checked out by `RlsMiddleware` for RLS session isolation). A single client cannot execute concurrent queries — `pg@8` queues them with a deprecation warning; `pg@9` will throw. Always `await` queries sequentially.
- Exception: `Promise.all` is fine for non-DB async work (external API calls, in-memory computation).

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

### UI/UX Consistency

**Rule: always use design system components. Never use raw HTML for interactive elements.**

| Instead of…                      | Use                                                             |
| -------------------------------- | --------------------------------------------------------------- |
| `<button>`                       | `<Button>` from `@future/ui`                                    |
| `<input>`                        | `<Input>` from `@future/ui`                                     |
| `<textarea>`                     | `<Textarea>` from `@future/ui`                                  |
| `×` `✕` `←` `→` `+` icons        | `<X>` `<ArrowLeft>` `<ArrowRight>` `<Plus>` from `lucide-react` |
| `<a href="...">` (same zone)     | `<Button variant="ghost" size="sm" asChild><Link href="/path">` |
| `animate-pulse` div              | `<Skeleton />` from `@future/ui`                                |
| `<div className="text-red-...">` | `<Alert variant="destructive"><AlertDescription>…`              |

- Layout/structural HTML (`div`, `span`, `p`, `h1`–`h6`, `ul`, `li`, `form`, `label`) is fine as-is.
- Data-driven counters like `+{n}` are text, not icons — leave them as-is.
- Cross-zone navigation (different Next.js zone) must use a plain `<a>` hard reload.
- Pending buttons: add `<Spinner className="size-4" />` inside the button alongside the label.
