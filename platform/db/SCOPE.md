# SCOPE — platform/db  (@seta/db)

## Purpose
Connection pool + cross-cutting utilities for Postgres. Owns the postgres-js client factory,
the `withTenant` request wrapper (the only correct way to set `app.tenant_id` for RLS), the
`tenantUser`/`platformAdmin` role exports, and the top-level migration runner that applies
owner-package migrations in dependency order. Owns no application tables — schema-per-module
(DDD) lives in each owner package per setup.md §3 "Schema-per-module".

## Responsibilities
- **Owns:**
  - `createPool(url, opts?)` — postgres-js client factory with seta-OS defaults
    (`max:20`, `prepare:false` for pgvector, `idle_timeout:30`, app-name tag).
  - `withTenant(sql, tenantId, fn)` — the **only** entrypoint for tenant-scoped queries.
    Wraps `sql.begin` + `SELECT set_config('app.tenant_id', $1, true)`; RLS depends on it.
  - `OWNER_ORDER` + `runMigrations({url, roleName?, repoRoot?, owners?})` — applies every
    owner package's `migrations/` directory in dependency order (`auth → tenant →
    directory → oauth → audit → connector_ms365_directory → connector_ms365_planner →
    agent`). Skips owners with no `meta/_journal.json`.
  - `tenantUser` / `platformAdmin` drizzle `pgRole` exports — used by owner packages when
    declaring RLS policies (`as: "permissive", to: tenantUser, …`).
- **Does NOT own:**
  - **Application tables / schemas.** Every owner package (`@seta/auth`, `@seta/tenant`,
    `@seta/directory`, `@seta/oauth`, `@seta/audit`, each `@seta/connector-*`,
    `@seta/agent`) declares its own Drizzle schema file, `drizzle.config.ts`, and
    `migrations/` directory. setup.md §3 "Schema-per-module (DDD)" is explicit:
    `@seta/db` owns no application tables.
  - **Cross-schema foreign keys.** CLAUDE.md / setup.md §3: cross-context references are by
    ID only; `tenant_id` is the universal correlation key.
  - **Migration **generation**.** `drizzle-kit generate` runs in each owner package and
    writes that package's `migrations/*.sql` — `@seta/db` only applies them at boot.
  - **RLS policy bodies.** Owners declare `pgPolicy(…)` against the `tenantUser` export
    in their own schema files; `@seta/db` does not centralize the policy SQL.
  - **`AsyncLocalStorage` tenant propagation.** That lives in `@seta/tenant` (per setup.md
    §3 "Multi-tenancy: app-layer + RLS" and §11 "Repo layout"); `@seta/db` accepts the
    tenant id as a `withTenant` parameter and does no ALS reads.

## Current state (Epic 1)
Implemented and minimal — exactly the four concerns above.
- `src/client.ts` — `createPool` (postgres-js with pool defaults) and `withTenant` (tx +
  bind-param-safe `set_config('app.tenant_id', $1, true)`). Cast at the `sql.begin` return
  boundary because postgres-js's `UnwrapPromiseArray<T>` does not reduce generically.
- `src/migrate.ts` — `OWNER_ORDER` constant (8 owners in dependency order), `runMigrations`
  using `drizzle-orm/postgres-js/migrator`. `SET ROLE "<role>"` runs via `sql.unsafe`
  because `SET ROLE` rejects bind params (the role name is operator-controlled, with `"`
  escaped). Owners with no `meta/_journal.json` are skipped — drizzle 0.45.2 throws a plain
  `Error` rather than a typed one for missing journals, so the check is up-front.
- `src/roles.ts` — `tenantUser = pgRole("tenant_user")`; `platformAdmin =
  pgRole("platform_admin")`. The comment in `roles.ts:6-12` notes that drizzle 0.45.2's
  `pgRole` has no `bypassRls` option; `BYPASSRLS` is set at role creation in
  `infra/postgres/init.sql` (matches setup.md §3 callout at line 68-73).
- `src/with-tenant.test.ts` — integration test against `DATABASE_URL`; uses `max:1` so the
  post-tx probe lands on the same backend (proves `set_config(..., true)` is tx-scoped, not
  just that a fresh connection has no GUC).
- `src/migrate.test.ts` — unit test pinning `OWNER_ORDER` to the §4.1 spec order.

Build via `tsup src/index.ts --format esm --dts --sourcemap`. ESM only.

## Public interface
From `src/index.ts`:
- `type DbSql` — alias for postgres-js `Sql`. The exported root-client type.
- `function createPool(url: string, opts?): DbSql` — postgres-js client factory.
- `function withTenant<T>(sql: DbSql, tenantId: string, fn: (tx: TransactionSql) =>
  Promise<T>): Promise<T>` — THE only entrypoint for tenant-scoped queries. Calls
  `sql.begin` and `SELECT set_config('app.tenant_id', ${tenantId}, true)` before `fn(tx)`.
- `type Owner` — union of the 8 P1 owner package names.
- `const OWNER_ORDER: readonly Owner[]` — `["auth","tenant","directory","oauth","audit",
  "connector_ms365_directory","connector_ms365_planner","agent"]`.
- `type RunMigrationsOpts = { url; roleName?; repoRoot?; owners? }`.
- `async function runMigrations(opts: RunMigrationsOpts): Promise<void>` — applies each
  owner's `migrations/` in order; skips owners with no `meta/_journal.json`.
- `const tenantUser` / `const platformAdmin` — drizzle `pgRole` handles for use in owner
  packages' `pgPolicy(…)` declarations.

## Imports
- **Allowed internal:** none. `@seta/db` is a leaf platform primitive.
- **Forbidden:**
  - `@seta/tenant` — would invert the dependency: setup.md §3 keeps ALS in `@seta/tenant`
    and the DB seam in `@seta/db`; tenant id flows as a parameter to `withTenant`, never
    pulled from ALS here. (`07-request-context.md` § "Deliberately avoid" — DB layer must
    not read ALS.)
  - Any `modules/*` package — CLAUDE.md "Boundaries" forbids `platform/*` from importing
    `modules/*`.
- **External (pinned per setup.md §13 "Shared infra"):**
  - `drizzle-orm@0.45.2` (matches setup.md §3 pin)
  - `postgres@3.4.9` (matches setup.md §3 pin)
  - `zod@4.4.3` (single workspace zod; carried even though not yet used in `src/**`)
  - dev: `drizzle-kit@0.31.10`, `tsup@8.5.1`, `typescript@6.0.3`, `vitest@4.1.5`,
    `@types/node@^24.12.3`, `@seta/tsconfig: workspace:*`.

## Patterns to follow
- **`set_config('app.tenant_id', $1, true)` not `SET LOCAL`.** Bind-param safe; same
  tx-scoped semantics. Cited in `src/client.ts:32-36` and setup.md §3:150-158.
- **`prepare:false`.** pgvector ops choke on prepared statements; matches setup.md
  §3:145.
- **Skip-on-missing-journal in `runMigrations`.** `src/migrate.ts:56-58` checks
  `existsSync(meta/_journal.json)` before calling `drizzleMigrate` — drizzle 0.45.2 throws
  on missing journals, and Epic 1 ships some owners without migrations yet (e.g. `agent`).
- **`SET ROLE "<name>"` via `sql.unsafe` with `"`-escape.** `src/migrate.ts:46-50` — bind
  params not allowed in `SET ROLE`; role name is operator-controlled. setup.md §3:172
  ("the bypass role is reserved for migrations and ops scripts") justifies the separate
  role path.
- **`tenant_id` is never a function param at the request layer.** `withTenant` accepts it
  because it is the seam where ALS converts to a SQL GUC. Callers in routes read from
  `tenantContext.getTenantId()` and pass it in (`07-request-context.md` § "Delta").
- **Cast at the `sql.begin` boundary.** `src/client.ts:36` — postgres-js's conditional
  return type does not reduce for generic `T`; cast at the seam (one line) rather than
  contaminate downstream types.

## Patterns to avoid
- **Plain `SET app.tenant_id = …` on a pooled connection.** setup.md §3:132 — without
  `LOCAL`, the GUC persists across connection release and leaks across tenants on the
  next request to grab that connection. **Silent cross-tenant data exposure.** The
  `with-tenant.test.ts` "outside === ''" assertion exists to fail any regression here.
- **Querying with the root `sql` client for tenant data.** setup.md §3:168 — `app.tenant_id`
  is unset, RLS rejects the query. Deny-by-default is the contract; do not "fix" failures
  by bypassing `withTenant`.
- **Centralizing schemas in `@seta/db`.** setup.md §3 "Schema-per-module" — schemas live
  with their owner packages. `@seta/db` provides primitives only.
- **Cross-schema foreign keys.** CLAUDE.md "Schema-driven" + setup.md §3:123 — references
  by ID; `tenant_id` is the correlation key.
- **`drizzle-kit push` against shared DBs.** CLAUDE.md "Footguns" — local-dev only.
- **Reading ALS in this package.** `07-request-context.md` § "DI/RequestContext
  conflation" — `@seta/db` is the request seam, not the request store.

## Test strategy
- **Unit** (`src/migrate.test.ts`): pins `OWNER_ORDER` against the spec. Pure constant
  check; no DB.
- **Integration** (`src/with-tenant.test.ts`): connects to `DATABASE_URL` (defaults
  `postgres://seta:dev@localhost:5432/seta`); asserts (a) `app.tenant_id` is visible inside
  the tx, and (b) **the GUC is empty after the tx on the same backend** (`max:1` pins
  backend identity — otherwise the "outside" probe could pass merely because it landed on
  a fresh connection). This is the load-bearing test for the RLS contract.
- CLAUDE.md "Conventions" forbids mocking Postgres in integration tests; this test must
  run against a real local instance (`pnpm db:up`).
- Per setup.md vitest project conventions, unit and integration tests run via root
  `pnpm test:unit` / `pnpm test:integration` projects; this leaf only sets
  `test.name: "@seta/db"` (`vitest.config.ts:3-5`).

## Open questions
- **Migration runner role switch.** `runMigrations` accepts `roleName?` and issues `SET
  ROLE`. Epic 1 expects this is called with `platform_admin` (BYPASSRLS) for migrations.
  We have no test asserting the role is set, and no guard preventing accidental use of
  `tenant_user` here. Should this throw if `roleName` is omitted in production?
- **`auth` owner ordering.** `OWNER_ORDER` lists `auth` first, but setup.md §3:125 lists
  the same order — confirm that `auth.users` has no FK into `tenant.tenants` so this
  ordering is sound. (Currently fine because there are no cross-schema FKs, per the
  policy.)
- **pool sizing & Redis trigger.** `createPool` defaults to `max:20` per setup.md §3:170.
  Once we hit the multi-instance scaling trigger (setup.md §3:51-55), pool sizing has to
  account for shared external state — but Redis adoption is the bigger story; pool size
  isn't the trigger.
- **Drizzle 1.0 `pgTable.withRLS()` migration.** setup.md §3 "Version note": shorthand
  lives in 1.0-beta only. When we move pin, the role exports here may grow `bypassRls`
  support and the `infra/postgres/init.sql` workaround retires.
- **`@seta/db` carrying `zod@4.4.3`** in deps even though no current `src/**` file imports
  it — likely staged for a future env/option schema. Either consume it (add a Zod-validated
  `createPool` opts schema) or remove until needed (CLAUDE.md "no legacy, no backward
  compat" leans toward removing).
