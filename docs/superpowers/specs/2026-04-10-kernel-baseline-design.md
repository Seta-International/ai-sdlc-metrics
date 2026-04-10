# Kernel Baseline — Design Spec

**Date:** 2026-04-10
**Status:** Approved
**Author:** Canh Ta
**Project:** Seta Future

---

## Overview

This spec covers the minimal kernel baseline: the tables, domain layer, repositories, application layer, tenant context middleware, migration runner, and provisioning CLI needed to make a real user log in and resolve their identity and role.

Source of truth for all schema decisions: `docs/architecture/kernel.md`.

---

## Scope

**In scope (Plan 1):**

- 5 Drizzle schemas: `tenant`, `actor`, `user_identity`, `role_grant`, `department`
- RLS policies for all tables except `tenant`
- Domain layer: entities, value objects, exceptions, port interfaces
- Infrastructure: 5 Drizzle repositories
- Application: 3 command handlers, 4 query handlers, `KernelQueryFacade`
- `nestjs-cls` + `RlsMiddleware` tenant context wiring
- Migration runner enhancement (`packages/db`)
- Tenant provisioning CLI script
- Unit tests (3 files) + integration tests (3 files)

**Deferred to later plans:**

- `org_placement`, `delegation`, `decision_case/step/outcome`
- `audit_event`, `outbox_event`
- `visibility_scope`, `exposure_contract`
- tRPC kernel router
- Outbox relay worker

---

## Section 1: Schema (5 tables + RLS)

All tables live in the `core` PostgreSQL schema. Defined in `apps/api/src/modules/kernel/infrastructure/schema/`, one file per table.

### `tenant.schema.ts` (new)

```ts
coreSchema.table('tenant', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(), // used in URLs/config
  status: text('status', { enum: ['active', 'suspended', 'cancelled'] })
    .notNull()
    .default('active'),
  planTier: text('plan_tier', { enum: ['starter', 'professional', 'enterprise'] }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

No `tenant_id` column — this is the root. No RLS policy (tenant reads are cross-tenant by design, resolved by auth middleware).

### `actor.schema.ts` (complete existing stub)

Add to existing stub:

```ts
status:    text('status', { enum: ['invited', 'active', 'inactive', 'suspended', 'archived'] }).notNull().default('invited'),
updatedAt: timestamp('updated_at').defaultNow().notNull(),
```

RLS policy (raw SQL in migration):

```sql
ALTER TABLE core.actor ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant_isolation ON core.actor
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

### `user_identity.schema.ts` (complete existing stub)

Add to existing stub:

```ts
provider:    text('provider', { enum: ['microsoft', 'google', 'local'] }).notNull(),
status:      text('status', { enum: ['active', 'suspended', 'deprovisioned'] }).notNull().default('active'),
lastLoginAt: timestamp('last_login_at'),
```

RLS policy — same pattern as `actor`.

### `role_grant.schema.ts` (complete existing stub)

Rename column `role` → `role_key`. Full columns:

```ts
id:        uuid('id').$defaultFn(() => uuidv7()).primaryKey(),
tenantId:  uuid('tenant_id').notNull(),
actorId:   uuid('actor_id').notNull(),
roleKey:   text('role_key', { enum: [
             'hr_ops', 'line_manager', 'staffing_owner', 'account_manager',
             'finance_operator', 'executive', 'employee',
             'review_operator', 'recruiter', 'tenant_admin', 'platform_admin'
           ]}).notNull(),
scopeType: text('scope_type', { enum: ['global', 'department', 'project', 'account'] }).notNull(),
scopeId:   uuid('scope_id'),                 // null when scope_type = 'global'
grantedBy: uuid('granted_by').notNull(),     // actor_id who granted (soft ref)
validFrom: timestamp('valid_from').defaultNow().notNull(),
validUntil: timestamp('valid_until'),        // null = permanent until revoked
```

Index:

```sql
CREATE INDEX idx_role_grant_actor ON core.role_grant (tenant_id, actor_id);
```

RLS policy — same pattern.

### `department.schema.ts` (complete existing stub)

Add to existing stub:

```ts
costCenterCode: text('cost_center_code'),
isActive:       boolean('is_active').notNull().default(true),
updatedAt:      timestamp('updated_at').defaultNow().notNull(),
```

`parent_id` is a soft ref — no `.references()`. RLS policy — same pattern.

### Schema barrel

`infrastructure/schema/index.ts` re-exports all table definitions so repositories import from one place.

---

## Section 2: Domain Layer

Pure TypeScript — zero NestJS/Drizzle imports. Lives in `domain/`.

### Entities (`domain/entities/`)

Five plain TypeScript classes/interfaces: `Actor`, `Tenant`, `UserIdentity`, `RoleGrant`, `Department`.

`Actor` includes an `isActive(): boolean` helper (`status === 'active'`) — used by multiple command handlers.

### Value Objects (`domain/value-objects/`)

- `Email` — validates format, lowercases on construction
- `RoleKey` — typed enum of the 11 role keys
- `ScopeType` — typed enum (global/department/project/account)

### Port Interfaces (`domain/repositories/`)

Five interfaces, each declaring only the methods needed by handlers and the facade:

| Interface                 | Methods                                  |
| ------------------------- | ---------------------------------------- |
| `IActorRepository`        | `findById`, `insert`                     |
| `ITenantRepository`       | `findById`, `findBySlug`, `insert`       |
| `IUserIdentityRepository` | `findById`, `findBySsoSubject`, `insert` |
| `IRoleGrantRepository`    | `findByActorId`, `insert`                |
| `IDepartmentRepository`   | `findById`, `insert`                     |

All `find*` methods return the domain entity or `null` (never throw).

### Domain Exceptions (`domain/exceptions/`)

- `ActorNotFoundException`
- `ActorArchivedException`
- `TenantNotFoundException`
- `DuplicateSsoSubjectException`

All extend a base `DomainException` class with a `code` string and `message`.

---

## Section 3: Infrastructure Layer

Drizzle repository implementations in `infrastructure/repositories/`. Each implements its domain port interface, takes `Db` (from `packages/db`) via constructor injection.

**Query discipline:**

- Every query includes `tenant_id` in the `WHERE` clause — belt-and-suspenders on top of RLS.
- `findById` always returns `null` on miss, never throws.

**Key methods:**

- `DrizzleUserIdentityRepository.findBySsoSubject(ssoSubject, tenantId)` — used at SSO login to find an existing identity.
- `DrizzleRoleGrantRepository.findByActorId(actorId, tenantId)` — filters out expired grants at the repo layer (`valid_until IS NULL OR valid_until > now()`).

**Schema barrel:** all repositories import table definitions from `infrastructure/schema/index.ts`.

---

## Section 4: Application Layer

### Commands (`application/commands/`)

Three handlers:

**`CreateActorHandler`**

1. Validate tenant exists (`ITenantRepository.findById`)
2. Insert actor (status: `invited`)
3. Return actor id

**`CreateUserIdentityHandler`**

1. Validate actor exists and is not archived
2. Check no duplicate `sso_subject` for tenant (`IUserIdentityRepository.findBySsoSubject`)
3. Insert user_identity
4. Return user_identity id

**`GrantRoleHandler`**

1. Validate actor exists
2. Validate `scope_id` is provided when `scope_type !== 'global'`
3. Insert role_grant
4. Return role_grant id

No event emission in this slice — outbox is deferred.

### Queries (`application/queries/`)

Four handlers (all read-only):

- `GetActorQueryHandler` — returns `Actor | null`
- `GetTenantQueryHandler` — returns `Tenant | null`
- `GetRoleGrantsQueryHandler` — returns `RoleGrant[]` (active grants only)
- `GetUserIdentityBySsoSubjectQueryHandler` — returns `UserIdentity | null`

### `KernelQueryFacade` (`application/facades/kernel-query.facade.ts`)

Replaces current stub. Implements:

```ts
getActor(actorId: string, tenantId: string): Promise<Actor | null>
getTenant(tenantId: string): Promise<Tenant | null>
getRoleGrants(actorId: string, tenantId: string): Promise<RoleGrant[]>
hasRole(actorId: string, roleKey: string, tenantId: string): Promise<boolean>
getActiveRoleGrant(actorId: string, roleKey: string, tenantId: string): Promise<RoleGrant | null>
```

Delegates to query handlers via `QueryBus` (NestJS CQRS) — not direct repository injection. This keeps the facade decoupled from infrastructure. This is the **only** class exported by `KernelModule`.

---

## Section 5: NestJS-CLS Tenant Context + RLS

### `ClsModule` setup

`apps/api/src/common/cls/cls.module.ts` — configures `nestjs-cls` with middleware running at the start of every HTTP request. Reads `tenantId` from session context (placeholder: reads `x-tenant-id` header for local dev/testing). Stores in CLS store.

### `TenantContextService`

`common/cls/tenant-context.service.ts` — injectable wrapper around ClsService:

```ts
getTenantId(): string  // throws if not set
setTenantId(id: string): void
```

### `RlsMiddleware`

`common/rls/rls.middleware.ts` — runs after CLS is populated. Executes:

```ts
await db.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, false)`)
```

**Critical:** third arg is `false` (transaction-local). Never `true` (session-local would leak across pooled connections with RDS Proxy).

Applied globally via `AppModule.configure()`.

### Outbox relay workers (future)

When implemented, outbox relay and pg-boss workers are NOT request-scoped. They must call `set_config` manually per row processed. This is a documented rule, not enforced by middleware.

### RLS policies

One `USING` policy per table (actor, user_identity, role_grant, department) as raw SQL in a hand-crafted migration file that runs after the Drizzle-generated DDL. No RLS on `tenant`.

---

## Section 6: Migration Runner

### `packages/db/drizzle.config.ts`

```ts
export default defineConfig({
  schema: '../../apps/api/src/**/*.schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
})
```

### Migration generation

`bun db:generate` → `drizzle-kit generate` → SQL files in `packages/db/drizzle/migrations/`. Developer reviews SQL before committing.

RLS policies and the `audit_event` immutability trigger (deferred) are NOT generated by Drizzle Kit. They live in a hand-written migration file (`0001_rls_policies.sql`) that runs in sequence after the Drizzle DDL migration.

### `packages/db/src/migrate.ts` (enhance)

Reads `DATABASE_URL`, calls Drizzle `migrate()` pointing at the migrations folder.

### `apps/api/src/main.ts` (enhance)

```ts
await runMigrations() // fatal if fails — process exits non-zero
const app = await NestFactory.create(AppModule, new FastifyAdapter())
await app.listen(process.env.PORT ?? 3000)
```

---

## Section 7: Tenant Provisioning CLI

**File:** `apps/api/scripts/provision-tenant.ts`
**Runner:** `bun run tenant:provision` (added to root `package.json`)

### Usage

```bash
bun run tenant:provision \
  --name "SETA" \
  --slug "seta" \
  --plan enterprise \
  --admin-name "Canh Ta" \
  --admin-email "canh@seta-international.com"
```

### Steps

1. Check `slug` uniqueness — exit cleanly if tenant already exists (idempotent)
2. Insert `tenant` row
3. Insert system `actor` (`{slug}-platform-bot`, type: system, status: active)
4. Insert person `actor` (admin, type: person, status: invited)
5. Insert `user_identity` for person actor (email from `--admin-email`, provider: microsoft)
6. Insert `role_grant` for `platform_admin`, scope_type: global, granted_by: system actor

Standalone Bun script — no NestJS bootstrap required. Uses `packages/db` directly.

---

## Section 8: Tests

### Unit tests (co-located with handlers, `*.spec.ts`)

| File                                   | Cases                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `create-actor.handler.spec.ts`         | happy path; tenant not found; returns actor id                          |
| `create-user-identity.handler.spec.ts` | happy path; actor not found; actor archived; duplicate sso_subject      |
| `grant-role.handler.spec.ts`           | happy path; actor not found; missing scope_id when scope_type != global |

All dependencies mocked with Vitest. No database.

### Integration tests (`*.integration.spec.ts`, serial, real DB)

| File                                        | Cases                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `actor.repository.integration.spec.ts`      | Insert actor in tenant A; switch context to tenant B; assert zero rows (RLS isolation proof) |
| `role-grant.repository.integration.spec.ts` | RLS isolation; expired grants excluded from `findByActorId`                                  |
| `tenant-context.integration.spec.ts`        | `set_config` with `false` resets after transaction end; does not bleed into next transaction |

Each test file: `createTestSchema(db)` in `beforeAll`, `dropTestSchema(db)` in `afterAll`. Helpers from `packages/db/src/test-helpers/`.

### No E2E tests

Kernel is infrastructure, not a user-visible flow. E2E coverage comes from dependent modules (People, Time, etc.).

---

## File Map

| File                                                              | Action                                 |
| ----------------------------------------------------------------- | -------------------------------------- |
| `infrastructure/schema/tenant.schema.ts`                          | Create                                 |
| `infrastructure/schema/actor.schema.ts`                           | Complete                               |
| `infrastructure/schema/user_identity.schema.ts`                   | Complete                               |
| `infrastructure/schema/role_grant.schema.ts`                      | Complete                               |
| `infrastructure/schema/department.schema.ts`                      | Complete                               |
| `infrastructure/schema/index.ts`                                  | Create (barrel)                        |
| `domain/entities/actor.ts`                                        | Create                                 |
| `domain/entities/tenant.ts`                                       | Create                                 |
| `domain/entities/user-identity.ts`                                | Create                                 |
| `domain/entities/role-grant.ts`                                   | Create                                 |
| `domain/entities/department.ts`                                   | Create                                 |
| `domain/value-objects/email.ts`                                   | Create                                 |
| `domain/value-objects/role-key.ts`                                | Create                                 |
| `domain/value-objects/scope-type.ts`                              | Create                                 |
| `domain/repositories/actor.repository.port.ts`                    | Create                                 |
| `domain/repositories/tenant.repository.port.ts`                   | Create                                 |
| `domain/repositories/user-identity.repository.port.ts`            | Create                                 |
| `domain/repositories/role-grant.repository.port.ts`               | Create                                 |
| `domain/repositories/department.repository.port.ts`               | Create                                 |
| `domain/exceptions/domain.exception.ts`                           | Create                                 |
| `domain/exceptions/actor.exceptions.ts`                           | Create                                 |
| `domain/exceptions/tenant.exceptions.ts`                          | Create                                 |
| `domain/exceptions/user-identity.exceptions.ts`                   | Create                                 |
| `infrastructure/repositories/drizzle-actor.repository.ts`         | Create                                 |
| `infrastructure/repositories/drizzle-tenant.repository.ts`        | Create                                 |
| `infrastructure/repositories/drizzle-user-identity.repository.ts` | Create                                 |
| `infrastructure/repositories/drizzle-role-grant.repository.ts`    | Create                                 |
| `infrastructure/repositories/drizzle-department.repository.ts`    | Create                                 |
| `application/commands/create-actor.command.ts`                    | Create                                 |
| `application/commands/create-actor.handler.ts`                    | Create                                 |
| `application/commands/create-user-identity.command.ts`            | Create                                 |
| `application/commands/create-user-identity.handler.ts`            | Create                                 |
| `application/commands/grant-role.command.ts`                      | Create                                 |
| `application/commands/grant-role.handler.ts`                      | Create                                 |
| `application/queries/get-actor.query.ts`                          | Create                                 |
| `application/queries/get-actor.handler.ts`                        | Create                                 |
| `application/queries/get-tenant.query.ts`                         | Create                                 |
| `application/queries/get-tenant.handler.ts`                       | Create                                 |
| `application/queries/get-role-grants.query.ts`                    | Create                                 |
| `application/queries/get-role-grants.handler.ts`                  | Create                                 |
| `application/queries/get-user-identity-by-sso-subject.query.ts`   | Create                                 |
| `application/queries/get-user-identity-by-sso-subject.handler.ts` | Create                                 |
| `application/facades/kernel-query.facade.ts`                      | Replace stub                           |
| `kernel.module.ts`                                                | Update (register providers)            |
| `apps/api/src/common/cls/cls.module.ts`                           | Create                                 |
| `apps/api/src/common/cls/tenant-context.service.ts`               | Create                                 |
| `apps/api/src/common/rls/rls.middleware.ts`                       | Create                                 |
| `apps/api/src/app.module.ts`                                      | Update (wire ClsModule, RlsMiddleware) |
| `apps/api/src/main.ts`                                            | Update (runMigrations before listen)   |
| `packages/db/drizzle.config.ts`                                   | Create                                 |
| `packages/db/src/migrate.ts`                                      | Enhance                                |
| `packages/db/src/test-helpers/index.ts`                           | Create                                 |
| `packages/db/drizzle/migrations/0000_core_schema.sql`             | Generated                              |
| `packages/db/drizzle/migrations/0001_rls_policies.sql`            | Hand-written                           |
| `apps/api/scripts/provision-tenant.ts`                            | Create                                 |
| `package.json` (root)                                             | Add `tenant:provision` script          |
| Unit test files (3)                                               | Create                                 |
| Integration test files (3)                                        | Create                                 |
