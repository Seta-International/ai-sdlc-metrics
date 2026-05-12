# SCOPE — platform/directory  (@seta/directory)

## Purpose

Canonical "external identity ↔ canonical user" mapping. Owns the `directory` Postgres schema (one table: `external_identities`) and the JIT (just-in-time) mapper that upserts an `auth.users` row plus a `directory.external_identities` link the first time a known external subject (Entra OIDC, future Google OIDC, future Trello account) is seen. Bridges the gap between auth (`@seta/auth` owns `auth.users`) and identity-provider claims; lets future connector-level user mirrors (e.g. `connector_ms365_directory.directory_users`) reference canonical users without cross-schema FKs (setup.md §3 "No cross-schema foreign keys" `docs/setup.md:121-123`).

## Responsibilities

- **Owns:**
  - The `directory` Postgres schema and its sole P1 table `directory.external_identities` (id, tenantId, userId, providerId, externalSubject, rawProfile jsonb, syncedAt).
  - The `(provider_id, external_subject)` unique index that makes the JIT upsert idempotent across re-sign-ins (`platform/directory/migrations/0000_ambiguous_iron_patriot.sql`).
  - `JitMapper` interface + `createJitMapper(sql)` factory; given `IdTokenClaims`, upserts `auth.users` and the matching `directory.external_identities` row inside one transaction.
  - The canonical `CanonicalUser` shape returned by the mapper (id, tenantId, email, displayName?, status).
  - Drizzle schema authoring + `drizzle-kit generate` migrations for this schema (setup.md §3 "Schema-per-module (DDD)" `docs/setup.md:102-127`).
- **Does NOT own:**
  - The `auth` schema. `auth.users` belongs to `@seta/auth` (setup.md §3 schema table `docs/setup.md:110`). The mapper reaches into `auth.users` via raw SQL — by design, since cross-schema FKs are forbidden but cross-schema *writes through the owner's API* are also a code-smell. The mapper is the single permitted bridge; rationale documented at setup.md §3 last paragraph and inline in `platform/directory/src/jit-mapper.ts:36-46`.
  - OIDC token verification. `jose` lives in `modules/channels/teams` for Bot Framework and (P2) in `@seta/sso` for inbound OIDC (setup.md §7 `docs/setup.md:526-563`).
  - Per-connector user/group mirrors (`connector_ms365_directory.directory_users` is owned by `@seta/connector-ms365-directory`, setup.md §3 schema table `docs/setup.md:115`). Those reference `directory.external_identities` by external subject and `auth.users` by canonical id, both via plain UUID columns — no cross-schema FK.
  - Audit logging. Sign-in events go through `@seta/audit.recordAudit` upstream (e.g. in `modules/channels/teams` SSO handler), not from here. The package `dependsOn` `@seta/audit` because setup.md §13 (`docs/setup.md:1773-1774`) pre-allocated the dep, but no runtime call exists in Epic 1.
  - Session storage, RBAC, API keys — all `@seta/auth`.

## Current state (Epic 1)

Implemented and integration-tested:

- `platform/directory/src/schema.ts` — Drizzle: `directorySchema = pgSchema('directory')`, `externalIdentities` table with `uniqueIndex('ext_identity_unique')` on `(providerId, externalSubject)`. Exports `ExternalIdentity` (`$inferSelect`) and `NewExternalIdentity` (`$inferInsert`).
- `platform/directory/src/jit-mapper.ts` — `IdTokenClaims`, `CanonicalUser`, `JitMapper` types; `createJitMapper(sql: Sql)` returns an object with `upsertFromIdToken(claims)`. Implementation runs both upserts in `sql.begin(...)`; relies on `ON CONFLICT (external_provider, external_subject)` for `auth.users` and `ON CONFLICT (provider_id, external_subject)` for `directory.external_identities`.
- `platform/directory/src/jit-mapper.test.ts` — integration test against a real Postgres (env `DATABASE_URL`, default `postgres://seta:dev@localhost:5432/seta`); asserts first call inserts, second call with renamed claims idempotently updates the same `id`.
- `platform/directory/drizzle.config.ts` — `schemaFilter: ['directory']`, output `./migrations`, strict.
- `platform/directory/migrations/0000_ambiguous_iron_patriot.sql` — creates schema + table + unique index.
- `platform/directory/src/index.ts` — re-exports `CanonicalUser`, `IdTokenClaims`, `JitMapper`, `createJitMapper`, plus the whole schema module.

No RLS policy is declared on `directory.external_identities` in Epic 1 — the upsert path runs as the migrations/composition role (or `tenant_user` with `app.tenant_id` set, since every insert carries `tenant_id`). See Open Questions for the RLS decision.

## Public interface

- `directorySchema` — `pgSchema('directory')` Drizzle handle.
- `externalIdentities` — Drizzle table; columns: `id` (uuid pk, default `gen_random_uuid()`), `tenantId` (uuid), `userId` (uuid — references canonical `auth.users.id` by value only), `providerId` (text — e.g. `'entra'`, `'google'`), `externalSubject` (text — the IdP-assigned subject), `rawProfile` (jsonb, defaults to `{}`), `syncedAt` (timestamptz, default `now()`).
- `type ExternalIdentity` (`$inferSelect`) and `type NewExternalIdentity` (`$inferInsert`).
- `type IdTokenClaims` — `{ tenantId, providerId, externalSubject, email, displayName?, rawProfile? }`. The minimal shape any inbound-OIDC handler must produce after verifying the token.
- `type CanonicalUser` — `{ id, tenantId, email, displayName?, status }` from `auth.users`.
- `interface JitMapper`:
  - `upsertFromIdToken(claims: IdTokenClaims): Promise<CanonicalUser>`
- `function createJitMapper(sql: Sql): JitMapper` — `Sql` is `postgres.Sql` from `postgres@3.4.9`. Caller passes a tenant-scoped client (see Patterns).

## Imports

- **Allowed internal:** `@seta/audit` (workspace dep pre-allocated by setup.md §13 `docs/setup.md:1773-1774`; not load-bearing in Epic 1 — wire when sign-in audit lands), `@seta/db` (workspace dep — but Epic 1 calls the `sql` injected by composition rather than importing the pool here, see Patterns).
- **Forbidden:**
  - `@seta/connector-*` — wrong direction; the connector mirror tables depend on this package, not vice-versa.
  - `modules/*`, `apps/*` — CLAUDE.md "platform/* depends on nothing in modules/ or apps/".
  - `@seta/auth` runtime — see Open Questions. Reaching into `auth.users` happens via raw SQL today; if `@seta/auth` ships a typed upsert API, we should call that instead and drop the cross-schema SQL.
- **External (pinned per setup.md §13, `docs/setup.md:1773-1774`):**
  - `drizzle-orm@0.45.2` (schema authoring)
  - `postgres@3.4.9` (driver for `Sql` type)
  - `zod@4.4.3`
  - `dotenv@17.4.2` (drizzle-kit config only)
  - Dev: `drizzle-kit@0.31.10`

## Patterns to follow

- **Schema-per-module ownership.** Setup.md §3 (`docs/setup.md:102-127`): each owner package holds its own Drizzle schema file + `drizzle.config.ts` with `schemaFilter` + per-package `migrations/`. Already implemented (`platform/directory/drizzle.config.ts:8`). The top-level migration runner in `@seta/db` applies owners in dependency order (`auth` → `tenant` → `directory` → `oauth` → `audit` → …).
- **No cross-schema FKs; ID-only references.** Setup.md §3 (`docs/setup.md:121-123`): `directory.external_identities.user_id` is a `uuid` with no FK constraint to `auth.users(id)`. The transactional upsert in `jit-mapper.ts:30-56` is the only enforcement.
- **JIT upsert in a single transaction.** `platform/directory/src/jit-mapper.ts:27-65` already does `sql.begin(...)`; both `auth.users` and `directory.external_identities` writes share one tx so RLS sees a consistent `app.tenant_id`. Re-using the existing tx pattern matches setup.md §3 `withTenant` semantics (`docs/setup.md:130-168`): `SET LOCAL` / `set_config(…, true)` is tx-scoped.
- **`(provider_id, external_subject)` is the natural key for idempotence.** CLAUDE.md "Idempotent external boundaries … Use natural keys … never auto-increment ints." Both `ON CONFLICT` clauses use this key.
- **`uuid v7` for new rows** at the application layer where applicable (setup.md §3 row 37 `docs/setup.md:37`). Note: `externalIdentities.id` currently uses `defaultRandom()` (uuid v4 via `gen_random_uuid()`); revisit if we need time-sortable scans on this table.
- **Tenant id read from `tenantContext.getTenantId()` upstream and reflected in `claims.tenantId`.** Setup.md "Tenant id is never a function parameter" (CLAUDE.md) is honored *upstream* — the OIDC handler reads ALS and populates `IdTokenClaims.tenantId`. From there the mapper consumes it via the typed object, not as a free-floating parameter.

## Patterns to avoid

- **Do not declare a foreign key from `directory.external_identities.user_id` → `auth.users.id`.** Setup.md §3 "No cross-schema FKs" (`docs/setup.md:121-123`).
- **Do not import `@seta/connector-ms365-directory` or any connector schema.** Wrong direction (CLAUDE.md "platform/* depends on nothing in modules/"); the connector imports *this* package.
- **Do not call `process.env.X`.** Setup.md §3 / CLAUDE.md "schema-driven `env`": env reads at `apps/api/src/env.ts`. The mapper accepts an injected `Sql` instance from composition; `dotenv` is loaded only in `drizzle.config.ts` for kit-time use.
- **Do not bypass the transaction in `upsertFromIdToken`.** Running the two upserts as separate auto-commits would risk a half-state on crash + reopen the cross-tenant leak window setup.md §3 (`docs/setup.md:130-168`) warns about (`SET LOCAL` only persists inside tx).
- **Do not use `drizzle-kit push` against shared databases.** CLAUDE.md "Footguns: `drizzle-kit push` is local-dev only." Migrations are forward-only and generated.
- **Do not log `rawProfile` contents in cleartext.** It may include emails, UPNs, group claims. Setup.md §8 pino redact (`docs/setup.md:616-680`) is the right scrubbing layer; this package writes the row, the logger never reads it.
- **No legacy / compat shims.** CLAUDE.md "No legacy, no backward compat."

## Test strategy

- **Unit:** schema-shape tests are low-value; co-located unit tests aren't needed for the Drizzle schema file. The mapper itself is intentionally thin — its value is the SQL contract, which is unit-untestable without a DB.
- **Integration (already implemented, `platform/directory/src/jit-mapper.test.ts`):** runs against a real Postgres (`DATABASE_URL` env, defaults to local docker-compose `postgres://seta:dev@localhost:5432/seta`). Asserts:
  - First sighting inserts `auth.users` + `directory.external_identities`.
  - Second sighting with renamed email/display name updates in place (`user2.id === user1.id`, `user2.email === 'alice+new@example.com'`).
- **Mocking policy:** never mock Postgres (CLAUDE.md "Never mock Postgres in integration tests"). The test seeds a tenant row, cleans prior runs by `(provider_id, external_subject)`, and closes the pool in `afterAll`.
- **Future:** add a multi-tenant collision test — same `externalSubject` claimed by two `tenantId`s should not collapse to one user (currently the unique index is on `(provider_id, external_subject)` *only*, ignoring `tenant_id`; that's a flag — see Open Questions).

## Open questions

- **Cross-tenant subject collision.** The unique index is `(provider_id, external_subject)` — meaning the same external subject across two tenants is *one row*. For Entra this is fine (subjects are globally unique GUIDs), but for providers that reuse subjects per directory, this would over-merge tenants. Phase-1 reports don't address this. Decision: keep as-is for Entra-only P1; revisit before adding Google OIDC.
- **RLS policy on `directory.external_identities`.** Setup.md §3 (`docs/setup.md:121-126`) lists `directory` as a tenant-data schema, and CLAUDE.md "Every tenant-data table has an RLS policy" implies a policy should exist. Epic 1 ships without one — the migration creates the table but no `ENABLE ROW LEVEL SECURITY` / `CREATE POLICY`. Action item: add an RLS policy in a follow-up migration, or document why it's intentionally absent (e.g. only the JIT mapper writes, running as `platform_admin`).
- **Reaching into `auth.users` via raw SQL vs. via a `@seta/auth` API.** Today `jit-mapper.ts:30-46` does the `INSERT … ON CONFLICT` directly on `auth.users`. This violates the "no package reads another's tables directly" rule (setup.md §3 `docs/setup.md:124`). The JIT path is the single exception — should `@seta/auth` expose `upsertUserFromExternalIdentity()` so this package can call it instead?
- **`@seta/audit` dep is unused in Epic 1.** Setup.md §13 (`docs/setup.md:1773-1774`) pre-allocates it for sign-in events ("user.created", "identity.linked"); add the calls when SSO ships or drop the dep.
- **Tenant id source on background-mirror sync.** When `@seta/connector-ms365-directory` syncs all users from MS Graph (not just the signed-in one), claims-style `IdTokenClaims` doesn't apply. The mirror writes its own `connector_ms365_directory.directory_users` and links back to canonical users via this package — but the linking API isn't defined yet. Spec the second entrypoint when the connector lands.
