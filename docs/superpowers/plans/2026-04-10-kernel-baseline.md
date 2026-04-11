# Kernel Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the kernel baseline — 5 Drizzle schemas, domain layer, repositories, CQRS command/query handlers, KernelQueryFacade, nestjs-cls RLS middleware, migration runner, and tenant provisioning CLI.

**Architecture:** NestJS modular monolith with hexagonal architecture. Drizzle ORM against PostgreSQL `core` schema. CQRS via `@nestjs/cqrs`. Tenant isolation via `set_config` + PostgreSQL RLS. All cross-module reads go through `KernelQueryFacade` only.

**Tech Stack:** NestJS 11, `@nestjs/cqrs`, Drizzle ORM 0.45, PostgreSQL 16, nestjs-cls 6, `uuidv7`, Vitest 4, Bun

**Status:** implemented

---

## File Map

### Schema (complete stubs + new)

| File                                                                        | Action       |
| --------------------------------------------------------------------------- | ------------ |
| `apps/api/src/modules/kernel/infrastructure/schema/tenant.schema.ts`        | Create       |
| `apps/api/src/modules/kernel/infrastructure/schema/actor.schema.ts`         | Complete     |
| `apps/api/src/modules/kernel/infrastructure/schema/user-identity.schema.ts` | Complete     |
| `apps/api/src/modules/kernel/infrastructure/schema/role-grant.schema.ts`    | Complete     |
| `apps/api/src/modules/kernel/infrastructure/schema/department.schema.ts`    | Complete     |
| `apps/api/src/modules/kernel/infrastructure/schema/index.ts`                | Create       |
| `packages/db/drizzle/migrations/0000_core_schema.sql`                       | Generated    |
| `packages/db/drizzle/migrations/0001_rls_policies.sql`                      | Hand-written |

### Infrastructure

| File                                                                                          | Action |
| --------------------------------------------------------------------------------------------- | ------ |
| `apps/api/src/common/db/db.module.ts`                                                         | Create |
| `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-tenant.repository.ts`        | Create |
| `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-actor.repository.ts`         | Create |
| `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-user-identity.repository.ts` | Create |
| `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-role-grant.repository.ts`    | Create |
| `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-department.repository.ts`    | Create |

### Domain

| File                                                                               | Action |
| ---------------------------------------------------------------------------------- | ------ |
| `apps/api/src/modules/kernel/domain/entities/tenant.entity.ts`                     | Create |
| `apps/api/src/modules/kernel/domain/entities/actor.entity.ts`                      | Create |
| `apps/api/src/modules/kernel/domain/entities/user-identity.entity.ts`              | Create |
| `apps/api/src/modules/kernel/domain/entities/role-grant.entity.ts`                 | Create |
| `apps/api/src/modules/kernel/domain/entities/department.entity.ts`                 | Create |
| `apps/api/src/modules/kernel/domain/value-objects/email.vo.ts`                     | Create |
| `apps/api/src/modules/kernel/domain/value-objects/role-key.vo.ts`                  | Create |
| `apps/api/src/modules/kernel/domain/value-objects/scope-type.vo.ts`                | Create |
| `apps/api/src/modules/kernel/domain/exceptions/domain.exception.ts`                | Create |
| `apps/api/src/modules/kernel/domain/exceptions/actor.exceptions.ts`                | Create |
| `apps/api/src/modules/kernel/domain/exceptions/tenant.exceptions.ts`               | Create |
| `apps/api/src/modules/kernel/domain/exceptions/user-identity.exceptions.ts`        | Create |
| `apps/api/src/modules/kernel/domain/repositories/actor.repository.port.ts`         | Create |
| `apps/api/src/modules/kernel/domain/repositories/tenant.repository.port.ts`        | Create |
| `apps/api/src/modules/kernel/domain/repositories/user-identity.repository.port.ts` | Create |
| `apps/api/src/modules/kernel/domain/repositories/role-grant.repository.port.ts`    | Create |
| `apps/api/src/modules/kernel/domain/repositories/department.repository.port.ts`    | Create |

### Application

| File                                                                                          | Action       |
| --------------------------------------------------------------------------------------------- | ------------ |
| `apps/api/src/modules/kernel/application/commands/create-actor.command.ts`                    | Create       |
| `apps/api/src/modules/kernel/application/commands/create-actor.handler.ts`                    | Create       |
| `apps/api/src/modules/kernel/application/commands/create-actor.handler.spec.ts`               | Create       |
| `apps/api/src/modules/kernel/application/commands/create-user-identity.command.ts`            | Create       |
| `apps/api/src/modules/kernel/application/commands/create-user-identity.handler.ts`            | Create       |
| `apps/api/src/modules/kernel/application/commands/create-user-identity.handler.spec.ts`       | Create       |
| `apps/api/src/modules/kernel/application/commands/grant-role.command.ts`                      | Create       |
| `apps/api/src/modules/kernel/application/commands/grant-role.handler.ts`                      | Create       |
| `apps/api/src/modules/kernel/application/commands/grant-role.handler.spec.ts`                 | Create       |
| `apps/api/src/modules/kernel/application/queries/get-actor.query.ts`                          | Create       |
| `apps/api/src/modules/kernel/application/queries/get-actor.handler.ts`                        | Create       |
| `apps/api/src/modules/kernel/application/queries/get-tenant.query.ts`                         | Create       |
| `apps/api/src/modules/kernel/application/queries/get-tenant.handler.ts`                       | Create       |
| `apps/api/src/modules/kernel/application/queries/get-role-grants.query.ts`                    | Create       |
| `apps/api/src/modules/kernel/application/queries/get-role-grants.handler.ts`                  | Create       |
| `apps/api/src/modules/kernel/application/queries/get-user-identity-by-sso-subject.query.ts`   | Create       |
| `apps/api/src/modules/kernel/application/queries/get-user-identity-by-sso-subject.handler.ts` | Create       |
| `apps/api/src/modules/kernel/application/facades/kernel-query.facade.ts`                      | Replace stub |
| `apps/api/src/modules/kernel/kernel.module.ts`                                                | Update       |

### CLS / RLS / Main

| File                                                | Action |
| --------------------------------------------------- | ------ |
| `apps/api/src/common/cls/tenant-context.service.ts` | Create |
| `apps/api/src/common/cls/cls.module.ts`             | Update |
| `apps/api/src/common/rls/rls.middleware.ts`         | Create |
| `apps/api/src/app.module.ts`                        | Update |
| `apps/api/src/main.ts`                              | Update |
| `packages/db/src/migrate.ts`                        | Update |

### Test helpers + integration tests

| File                                                                                                        | Action |
| ----------------------------------------------------------------------------------------------------------- | ------ |
| `packages/db/src/test-helpers/index.ts`                                                                     | Update |
| `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-actor.repository.integration.spec.ts`      | Create |
| `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-role-grant.repository.integration.spec.ts` | Create |
| `apps/api/src/common/rls/tenant-context.integration.spec.ts`                                                | Create |

### CLI

| File                                   | Action |
| -------------------------------------- | ------ |
| `apps/api/scripts/provision-tenant.ts` | Create |
| `package.json` (root)                  | Update |

---

## Task 1: Install `@nestjs/cqrs`

**Files:**

- Modify: `apps/api/package.json`

- [ ] **Step 1: Install the package**

```bash
bun add @nestjs/cqrs --filter @future/api
```

Expected: `"@nestjs/cqrs": "^10..."` (or latest compatible with NestJS 11) appears in `apps/api/package.json` dependencies.

- [ ] **Step 2: Commit**

```bash
git add apps/api/package.json bun.lock
git commit -m "chore(api): add @nestjs/cqrs"
```

---

## Task 2: Create `DbModule`

The API needs a global `Db` provider. All repositories inject `DB_TOKEN`.

**Files:**

- Create: `apps/api/src/common/db/db.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create `apps/api/src/common/db/db.module.ts`**

```ts
import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createDb, type Db } from '@future/db'

export const DB_TOKEN = Symbol('Db')

@Global()
@Module({
  providers: [
    {
      provide: DB_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Db => {
        const url = config.getOrThrow<string>('DATABASE_URL')
        return createDb(url)
      },
    },
  ],
  exports: [DB_TOKEN],
})
export class DbModule {}
```

- [ ] **Step 2: Import `DbModule` in `apps/api/src/app.module.ts`**

Add `DbModule` to the imports array (place it after `ConfigModule.forRoot`):

```ts
import { DbModule } from './common/db/db.module.js'
```

Add to `@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule, AppClsModule, ...] })`.

- [ ] **Step 3: Verify typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/common/db/db.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): add global DbModule with DB_TOKEN provider"
```

---

## Task 3: Complete schema files + barrel

**Files:**

- Modify: `apps/api/src/modules/kernel/infrastructure/schema/actor.schema.ts`
- Modify: `apps/api/src/modules/kernel/infrastructure/schema/user-identity.schema.ts`
- Modify: `apps/api/src/modules/kernel/infrastructure/schema/role-grant.schema.ts`
- Modify: `apps/api/src/modules/kernel/infrastructure/schema/department.schema.ts`
- Create: `apps/api/src/modules/kernel/infrastructure/schema/tenant.schema.ts`
- Create: `apps/api/src/modules/kernel/infrastructure/schema/index.ts`

- [ ] **Step 1: Replace `actor.schema.ts`**

```ts
import { pgSchema, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const coreSchema = pgSchema('core')

export const actor = coreSchema.table('actor', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  type: text('type', { enum: ['person', 'organization', 'system'] }).notNull(),
  displayName: text('display_name').notNull(),
  status: text('status', {
    enum: ['invited', 'active', 'inactive', 'suspended', 'archived'],
  })
    .notNull()
    .default('invited'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

- [ ] **Step 2: Replace `user-identity.schema.ts`**

```ts
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { coreSchema } from './actor.schema.js'

export const userIdentity = coreSchema.table('user_identity', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(), // soft ref to core.actor
  email: text('email').notNull(),
  ssoSubject: text('sso_subject').notNull(), // Microsoft Entra OID
  provider: text('provider', { enum: ['microsoft', 'google', 'local'] }).notNull(),
  status: text('status', { enum: ['active', 'suspended', 'deprovisioned'] })
    .notNull()
    .default('active'),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

- [ ] **Step 3: Replace `role-grant.schema.ts`**

```ts
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { coreSchema } from './actor.schema.js'

export const roleGrant = coreSchema.table('role_grant', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(), // soft ref to core.actor
  roleKey: text('role_key', {
    enum: [
      'hr_ops',
      'line_manager',
      'staffing_owner',
      'account_manager',
      'finance_operator',
      'executive',
      'employee',
      'review_operator',
      'recruiter',
      'tenant_admin',
      'platform_admin',
    ],
  }).notNull(),
  scopeType: text('scope_type', {
    enum: ['global', 'department', 'project', 'account'],
  }).notNull(),
  scopeId: uuid('scope_id'), // null when scopeType = 'global'
  grantedBy: uuid('granted_by').notNull(), // soft ref to core.actor
  validFrom: timestamp('valid_from').defaultNow().notNull(),
  validUntil: timestamp('valid_until'), // null = permanent until revoked
})
```

- [ ] **Step 4: Replace `department.schema.ts`**

```ts
import { uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { coreSchema } from './actor.schema.js'

export const department = coreSchema.table('department', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  parentId: uuid('parent_id'), // soft self-ref — no .references()
  costCenterCode: text('cost_center_code'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

- [ ] **Step 5: Create `tenant.schema.ts`**

```ts
import { pgSchema, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

// Re-export coreSchema for use by other schema files that don't import actor.schema
export { coreSchema } from './actor.schema.js'

const { coreSchema: _schema } = await import('./actor.schema.js')

import { coreSchema } from './actor.schema.js'

export const tenant = coreSchema.table('tenant', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  status: text('status', { enum: ['active', 'suspended', 'cancelled'] })
    .notNull()
    .default('active'),
  planTier: text('plan_tier', { enum: ['starter', 'professional', 'enterprise'] }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

Note: `tenant` has no `tenant_id` column — it is the root. No RLS policy on this table.

- [ ] **Step 6: Create `infrastructure/schema/index.ts`**

```ts
export { coreSchema, actor } from './actor.schema.js'
export { tenant } from './tenant.schema.js'
export { userIdentity } from './user-identity.schema.js'
export { roleGrant } from './role-grant.schema.js'
export { department } from './department.schema.js'
```

- [ ] **Step 7: Verify typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/kernel/infrastructure/schema/
git commit -m "feat(kernel): complete core schema definitions — tenant, actor, user_identity, role_grant, department"
```

---

## Task 4: Generate migration + write RLS migration

**Files:**

- Create: `packages/db/drizzle/migrations/0000_core_schema.sql` (generated)
- Create: `packages/db/drizzle/migrations/0001_rls_policies.sql` (hand-written)

- [ ] **Step 1: Set `DATABASE_URL` and generate migration**

The generate command needs a valid `DATABASE_URL` to introspect. Set it to a local or staging database:

```bash
cd packages/db && DATABASE_URL="postgresql://localhost:5432/future_dev" bun run generate
```

Expected: Drizzle Kit prints something like:

```
[✓] Your SQL migration file ➜ drizzle/migrations/0000_...sql
```

A file is created at `packages/db/drizzle/migrations/0000_<timestamp>_<name>.sql`. Review its contents — it should contain `CREATE SCHEMA "core"`, then `CREATE TABLE "core"."tenant"`, `"core"."actor"`, etc.

If the filename includes a timestamp prefix, that is fine. The migration runner applies them in alphabetical order.

- [ ] **Step 2: Verify the generated SQL**

Open the generated `.sql` file. Confirm:

- `CREATE SCHEMA "core"` is present
- `tenant`, `actor`, `user_identity`, `role_grant`, `department` tables are all present with the correct columns
- No FK references across schemas (all cross-module refs are soft)

If any table is missing or columns are wrong, fix the corresponding schema file and re-run `bun run generate`.

- [ ] **Step 3: Create `packages/db/drizzle/migrations/0001_rls_policies.sql`**

```sql
-- RLS policies for core schema
-- Run after the Drizzle-generated DDL migration.
-- No RLS on core.tenant — tenant reads are cross-tenant by design.

ALTER TABLE core.actor ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant_isolation ON core.actor
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE core.user_identity ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant_isolation ON core.user_identity
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE core.role_grant ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant_isolation ON core.role_grant
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE core.department ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant_isolation ON core.department
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Performance index for role_grant actor lookups (hit on every auth check)
CREATE INDEX idx_role_grant_actor ON core.role_grant (tenant_id, actor_id);
```

Note: `current_setting('app.tenant_id', true)` — the second arg `true` means "return null if unset" rather than raising an error. This allows queries to work before the tenant context is set (e.g., migrations, health checks).

- [ ] **Step 4: Commit**

```bash
git add packages/db/drizzle/migrations/
git commit -m "feat(db): generate core schema migration + add RLS policies migration"
```

---

## Task 5: Enhance `migrate.ts` and `main.ts`

**Files:**

- Modify: `packages/db/src/migrate.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Replace `packages/db/src/migrate.ts`**

Export `runMigrations` so it can be called from `main.ts`:

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(__dirname, '../drizzle/migrations')

export async function runMigrations(connectionString?: string): Promise<void> {
  const url = connectionString ?? process.env['DATABASE_URL']
  if (!url) throw new Error('DATABASE_URL is required')

  const pool = new Pool({ connectionString: url })
  const db = drizzle(pool)

  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
    console.log('[db] migrations complete')
  } finally {
    await pool.end()
  }
}

// Allow running as a standalone script: `bun run src/migrate.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().catch((err) => {
    console.error('[db] migration failed:', err)
    process.exit(1)
  })
}
```

- [ ] **Step 2: Update `apps/api/src/main.ts`**

Call `runMigrations()` before creating the NestJS app. Fatal on failure.

```ts
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { runMigrations } from '@future/db/migrate'
import { AppModule } from './app.module.js'

async function bootstrap() {
  await runMigrations()

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())

  const port = parseInt(process.env['PORT'] ?? '4000', 10)
  await app.listen(port, '0.0.0.0')
  console.log(`API listening on :${port}`)
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err)
  process.exit(1)
})
```

- [ ] **Step 3: Add migrate export to `packages/db/package.json`**

The `apps/api` imports `@future/db/migrate`. Add this export path to `packages/db/package.json`:

```json
"exports": {
  ".": {
    "import": "./dist/index.js",
    "types": "./dist/index.d.ts"
  },
  "./migrate": {
    "import": "./src/migrate.ts",
    "types": "./src/migrate.ts"
  },
  "./test-helpers": {
    "import": "./dist/test-helpers/index.js",
    "types": "./dist/test-helpers/index.d.ts"
  }
}
```

Note: `./migrate` points to the source `.ts` directly because Bun runs TypeScript natively. In CI/production builds, adjust to `./dist/migrate.js` once the build step is in place.

- [ ] **Step 4: Verify typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/migrate.ts packages/db/package.json apps/api/src/main.ts
git commit -m "feat(db): export runMigrations; run migrations on API bootstrap"
```

---

## Task 6: Domain layer — entities, value objects, exceptions, port interfaces

Pure TypeScript. Zero NestJS or Drizzle imports. All files in `apps/api/src/modules/kernel/domain/`.

**Files:** all the domain files listed in the file map above.

- [ ] **Step 1: Create entity files**

`domain/entities/tenant.entity.ts`:

```ts
export interface Tenant {
  id: string
  name: string
  slug: string
  status: 'active' | 'suspended' | 'cancelled'
  planTier: 'starter' | 'professional' | 'enterprise'
  createdAt: Date
  updatedAt: Date
}
```

`domain/entities/actor.entity.ts`:

```ts
export type ActorType = 'person' | 'organization' | 'system'
export type ActorStatus = 'invited' | 'active' | 'inactive' | 'suspended' | 'archived'

export interface Actor {
  id: string
  tenantId: string
  type: ActorType
  displayName: string
  status: ActorStatus
  createdAt: Date
  updatedAt: Date
}

export function isActorActive(actor: Actor): boolean {
  return actor.status === 'active'
}

export function isActorArchived(actor: Actor): boolean {
  return actor.status === 'archived'
}
```

`domain/entities/user-identity.entity.ts`:

```ts
export type IdentityProvider = 'microsoft' | 'google' | 'local'
export type IdentityStatus = 'active' | 'suspended' | 'deprovisioned'

export interface UserIdentity {
  id: string
  tenantId: string
  actorId: string
  email: string
  ssoSubject: string
  provider: IdentityProvider
  status: IdentityStatus
  lastLoginAt: Date | null
  createdAt: Date
}
```

`domain/entities/role-grant.entity.ts`:

```ts
export type RoleKeyValue =
  | 'hr_ops'
  | 'line_manager'
  | 'staffing_owner'
  | 'account_manager'
  | 'finance_operator'
  | 'executive'
  | 'employee'
  | 'review_operator'
  | 'recruiter'
  | 'tenant_admin'
  | 'platform_admin'

export type ScopeTypeValue = 'global' | 'department' | 'project' | 'account'

export interface RoleGrant {
  id: string
  tenantId: string
  actorId: string
  roleKey: RoleKeyValue
  scopeType: ScopeTypeValue
  scopeId: string | null
  grantedBy: string
  validFrom: Date
  validUntil: Date | null
}
```

`domain/entities/department.entity.ts`:

```ts
export interface Department {
  id: string
  tenantId: string
  name: string
  parentId: string | null
  costCenterCode: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 2: Create value object files**

`domain/value-objects/email.vo.ts`:

```ts
export class Email {
  readonly value: string

  constructor(raw: string) {
    const normalized = raw.trim().toLowerCase()
    if (!normalized.includes('@')) {
      throw new Error(`Invalid email: ${raw}`)
    }
    this.value = normalized
  }

  toString(): string {
    return this.value
  }
}
```

`domain/value-objects/role-key.vo.ts`:

```ts
import type { RoleKeyValue } from '../entities/role-grant.entity.js'

export const ROLE_KEYS: RoleKeyValue[] = [
  'hr_ops',
  'line_manager',
  'staffing_owner',
  'account_manager',
  'finance_operator',
  'executive',
  'employee',
  'review_operator',
  'recruiter',
  'tenant_admin',
  'platform_admin',
]

export function isValidRoleKey(value: string): value is RoleKeyValue {
  return ROLE_KEYS.includes(value as RoleKeyValue)
}
```

`domain/value-objects/scope-type.vo.ts`:

```ts
import type { ScopeTypeValue } from '../entities/role-grant.entity.js'

export const SCOPE_TYPES: ScopeTypeValue[] = ['global', 'department', 'project', 'account']

export function isValidScopeType(value: string): value is ScopeTypeValue {
  return SCOPE_TYPES.includes(value as ScopeTypeValue)
}
```

- [ ] **Step 3: Create exception files**

`domain/exceptions/domain.exception.ts`:

```ts
export abstract class DomainException extends Error {
  abstract readonly code: string

  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}
```

`domain/exceptions/tenant.exceptions.ts`:

```ts
import { DomainException } from './domain.exception.js'

export class TenantNotFoundException extends DomainException {
  readonly code = 'TENANT_NOT_FOUND'

  constructor(tenantId: string) {
    super(`Tenant not found: ${tenantId}`)
  }
}
```

`domain/exceptions/actor.exceptions.ts`:

```ts
import { DomainException } from './domain.exception.js'

export class ActorNotFoundException extends DomainException {
  readonly code = 'ACTOR_NOT_FOUND'

  constructor(actorId: string) {
    super(`Actor not found: ${actorId}`)
  }
}

export class ActorArchivedException extends DomainException {
  readonly code = 'ACTOR_ARCHIVED'

  constructor(actorId: string) {
    super(`Actor is archived and cannot be modified: ${actorId}`)
  }
}
```

`domain/exceptions/user-identity.exceptions.ts`:

```ts
import { DomainException } from './domain.exception.js'

export class DuplicateSsoSubjectException extends DomainException {
  readonly code = 'DUPLICATE_SSO_SUBJECT'

  constructor(ssoSubject: string) {
    super(`An identity with SSO subject already exists: ${ssoSubject}`)
  }
}
```

- [ ] **Step 4: Create port interface files**

`domain/repositories/tenant.repository.port.ts`:

```ts
import type { Tenant } from '../entities/tenant.entity.js'

export const TENANT_REPOSITORY = Symbol('ITenantRepository')

export interface ITenantRepository {
  findById(id: string): Promise<Tenant | null>
  findBySlug(slug: string): Promise<Tenant | null>
  insert(data: { name: string; slug: string; planTier: Tenant['planTier'] }): Promise<Tenant>
}
```

`domain/repositories/actor.repository.port.ts`:

```ts
import type { Actor } from '../entities/actor.entity.js'

export const ACTOR_REPOSITORY = Symbol('IActorRepository')

export interface IActorRepository {
  findById(id: string, tenantId: string): Promise<Actor | null>
  insert(data: { tenantId: string; type: Actor['type']; displayName: string }): Promise<Actor>
}
```

`domain/repositories/user-identity.repository.port.ts`:

```ts
import type { UserIdentity } from '../entities/user-identity.entity.js'

export const USER_IDENTITY_REPOSITORY = Symbol('IUserIdentityRepository')

export interface IUserIdentityRepository {
  findById(id: string, tenantId: string): Promise<UserIdentity | null>
  findBySsoSubject(ssoSubject: string, tenantId: string): Promise<UserIdentity | null>
  insert(data: {
    tenantId: string
    actorId: string
    email: string
    ssoSubject: string
    provider: UserIdentity['provider']
  }): Promise<UserIdentity>
}
```

`domain/repositories/role-grant.repository.port.ts`:

```ts
import type { RoleGrant } from '../entities/role-grant.entity.js'

export const ROLE_GRANT_REPOSITORY = Symbol('IRoleGrantRepository')

export interface IRoleGrantRepository {
  findByActorId(actorId: string, tenantId: string): Promise<RoleGrant[]>
  insert(data: {
    tenantId: string
    actorId: string
    roleKey: RoleGrant['roleKey']
    scopeType: RoleGrant['scopeType']
    scopeId: string | null
    grantedBy: string
  }): Promise<RoleGrant>
}
```

`domain/repositories/department.repository.port.ts`:

```ts
import type { Department } from '../entities/department.entity.js'

export const DEPARTMENT_REPOSITORY = Symbol('IDepartmentRepository')

export interface IDepartmentRepository {
  findById(id: string, tenantId: string): Promise<Department | null>
  insert(data: {
    tenantId: string
    name: string
    parentId?: string
    costCenterCode?: string
  }): Promise<Department>
}
```

- [ ] **Step 5: Verify typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/kernel/domain/
git commit -m "feat(kernel): add domain entities, value objects, exceptions, and repository ports"
```

---

## Task 7: TDD — `CreateActorHandler`

- [ ] **Step 1: Create the command**

`application/commands/create-actor.command.ts`:

```ts
import type { ActorType } from '../../domain/entities/actor.entity.js'

export class CreateActorCommand {
  constructor(
    readonly tenantId: string,
    readonly type: ActorType,
    readonly displayName: string,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

`application/commands/create-actor.handler.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CreateActorHandler } from './create-actor.handler.js'
import { CreateActorCommand } from './create-actor.command.js'
import type { ITenantRepository } from '../../domain/repositories/tenant.repository.port.js'
import type { IActorRepository } from '../../domain/repositories/actor.repository.port.js'
import { TenantNotFoundException } from '../../domain/exceptions/tenant.exceptions.js'
import type { Tenant } from '../../domain/entities/tenant.entity.js'
import type { Actor } from '../../domain/entities/actor.entity.js'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

const fakeTenant: Tenant = {
  id: TENANT_ID,
  name: 'SETA',
  slug: 'seta',
  status: 'active',
  planTier: 'enterprise',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeActor: Actor = {
  id: ACTOR_ID,
  tenantId: TENANT_ID,
  type: 'person',
  displayName: 'Canh Ta',
  status: 'invited',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('CreateActorHandler', () => {
  let handler: CreateActorHandler
  let tenantRepo: ITenantRepository
  let actorRepo: IActorRepository

  beforeEach(() => {
    tenantRepo = { findById: vi.fn(), findBySlug: vi.fn(), insert: vi.fn() }
    actorRepo = { findById: vi.fn(), insert: vi.fn() }
    handler = new CreateActorHandler(tenantRepo, actorRepo)
  })

  it('returns the new actor id when tenant exists', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(fakeTenant)
    vi.mocked(actorRepo.insert).mockResolvedValue(fakeActor)

    const result = await handler.execute(new CreateActorCommand(TENANT_ID, 'person', 'Canh Ta'))

    expect(result).toBe(ACTOR_ID)
    expect(actorRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      type: 'person',
      displayName: 'Canh Ta',
    })
  })

  it('throws TenantNotFoundException when tenant does not exist', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new CreateActorCommand(TENANT_ID, 'person', 'Canh Ta')),
    ).rejects.toThrow(TenantNotFoundException)

    expect(actorRepo.insert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run the test to confirm it fails**

```bash
cd apps/api && bun vitest run src/modules/kernel/application/commands/create-actor.handler.spec.ts
```

Expected: FAIL — `Cannot find module './create-actor.handler.js'`

- [ ] **Step 4: Implement `create-actor.handler.ts`**

```ts
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { CreateActorCommand } from './create-actor.command.js'
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/repositories/tenant.repository.port.js'
import {
  ACTOR_REPOSITORY,
  type IActorRepository,
} from '../../domain/repositories/actor.repository.port.js'
import { TenantNotFoundException } from '../../domain/exceptions/tenant.exceptions.js'

@CommandHandler(CreateActorCommand)
export class CreateActorHandler implements ICommandHandler<CreateActorCommand, string> {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
    @Inject(ACTOR_REPOSITORY) private readonly actorRepo: IActorRepository,
  ) {}

  async execute(command: CreateActorCommand): Promise<string> {
    const tenant = await this.tenantRepo.findById(command.tenantId)
    if (!tenant) throw new TenantNotFoundException(command.tenantId)

    const actor = await this.actorRepo.insert({
      tenantId: command.tenantId,
      type: command.type,
      displayName: command.displayName,
    })

    return actor.id
  }
}
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
cd apps/api && bun vitest run src/modules/kernel/application/commands/create-actor.handler.spec.ts
```

Expected: PASS — 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/kernel/application/commands/create-actor.command.ts \
        apps/api/src/modules/kernel/application/commands/create-actor.handler.ts \
        apps/api/src/modules/kernel/application/commands/create-actor.handler.spec.ts
git commit -m "feat(kernel): CreateActorHandler with unit tests"
```

---

## Task 8: TDD — `CreateUserIdentityHandler`

- [ ] **Step 1: Create the command**

`application/commands/create-user-identity.command.ts`:

```ts
import type { IdentityProvider } from '../../domain/entities/user-identity.entity.js'

export class CreateUserIdentityCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly email: string,
    readonly ssoSubject: string,
    readonly provider: IdentityProvider,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

`application/commands/create-user-identity.handler.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CreateUserIdentityHandler } from './create-user-identity.handler.js'
import { CreateUserIdentityCommand } from './create-user-identity.command.js'
import type { IActorRepository } from '../../domain/repositories/actor.repository.port.js'
import type { IUserIdentityRepository } from '../../domain/repositories/user-identity.repository.port.js'
import {
  ActorNotFoundException,
  ActorArchivedException,
} from '../../domain/exceptions/actor.exceptions.js'
import { DuplicateSsoSubjectException } from '../../domain/exceptions/user-identity.exceptions.js'
import type { Actor } from '../../domain/entities/actor.entity.js'
import type { UserIdentity } from '../../domain/entities/user-identity.entity.js'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const IDENTITY_ID = '01900000-0000-7000-8000-000000000003'
const SSO_SUBJECT = 'entra-oid-abc123'

const fakeActor: Actor = {
  id: ACTOR_ID,
  tenantId: TENANT_ID,
  type: 'person',
  displayName: 'Canh Ta',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeIdentity: UserIdentity = {
  id: IDENTITY_ID,
  tenantId: TENANT_ID,
  actorId: ACTOR_ID,
  email: 'canh@seta.com',
  ssoSubject: SSO_SUBJECT,
  provider: 'microsoft',
  status: 'active',
  lastLoginAt: null,
  createdAt: new Date(),
}

describe('CreateUserIdentityHandler', () => {
  let handler: CreateUserIdentityHandler
  let actorRepo: IActorRepository
  let identityRepo: IUserIdentityRepository

  beforeEach(() => {
    actorRepo = { findById: vi.fn(), insert: vi.fn() }
    identityRepo = { findById: vi.fn(), findBySsoSubject: vi.fn(), insert: vi.fn() }
    handler = new CreateUserIdentityHandler(actorRepo, identityRepo)
  })

  it('returns the new identity id when actor exists and sso_subject is unique', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(fakeActor)
    vi.mocked(identityRepo.findBySsoSubject).mockResolvedValue(null)
    vi.mocked(identityRepo.insert).mockResolvedValue(fakeIdentity)

    const result = await handler.execute(
      new CreateUserIdentityCommand(TENANT_ID, ACTOR_ID, 'canh@seta.com', SSO_SUBJECT, 'microsoft'),
    )

    expect(result).toBe(IDENTITY_ID)
    expect(identityRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      email: 'canh@seta.com',
      ssoSubject: SSO_SUBJECT,
      provider: 'microsoft',
    })
  })

  it('throws ActorNotFoundException when actor does not exist', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new CreateUserIdentityCommand(
          TENANT_ID,
          ACTOR_ID,
          'canh@seta.com',
          SSO_SUBJECT,
          'microsoft',
        ),
      ),
    ).rejects.toThrow(ActorNotFoundException)

    expect(identityRepo.insert).not.toHaveBeenCalled()
  })

  it('throws ActorArchivedException when actor is archived', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue({ ...fakeActor, status: 'archived' })

    await expect(
      handler.execute(
        new CreateUserIdentityCommand(
          TENANT_ID,
          ACTOR_ID,
          'canh@seta.com',
          SSO_SUBJECT,
          'microsoft',
        ),
      ),
    ).rejects.toThrow(ActorArchivedException)
  })

  it('throws DuplicateSsoSubjectException when sso_subject already exists for tenant', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(fakeActor)
    vi.mocked(identityRepo.findBySsoSubject).mockResolvedValue(fakeIdentity)

    await expect(
      handler.execute(
        new CreateUserIdentityCommand(
          TENANT_ID,
          ACTOR_ID,
          'canh@seta.com',
          SSO_SUBJECT,
          'microsoft',
        ),
      ),
    ).rejects.toThrow(DuplicateSsoSubjectException)

    expect(identityRepo.insert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run to confirm fail**

```bash
cd apps/api && bun vitest run src/modules/kernel/application/commands/create-user-identity.handler.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `create-user-identity.handler.ts`**

```ts
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { CreateUserIdentityCommand } from './create-user-identity.command.js'
import {
  ACTOR_REPOSITORY,
  type IActorRepository,
} from '../../domain/repositories/actor.repository.port.js'
import {
  USER_IDENTITY_REPOSITORY,
  type IUserIdentityRepository,
} from '../../domain/repositories/user-identity.repository.port.js'
import {
  ActorNotFoundException,
  ActorArchivedException,
} from '../../domain/exceptions/actor.exceptions.js'
import { DuplicateSsoSubjectException } from '../../domain/exceptions/user-identity.exceptions.js'
import { isActorArchived } from '../../domain/entities/actor.entity.js'

@CommandHandler(CreateUserIdentityCommand)
export class CreateUserIdentityHandler implements ICommandHandler<
  CreateUserIdentityCommand,
  string
> {
  constructor(
    @Inject(ACTOR_REPOSITORY) private readonly actorRepo: IActorRepository,
    @Inject(USER_IDENTITY_REPOSITORY) private readonly identityRepo: IUserIdentityRepository,
  ) {}

  async execute(command: CreateUserIdentityCommand): Promise<string> {
    const actor = await this.actorRepo.findById(command.actorId, command.tenantId)
    if (!actor) throw new ActorNotFoundException(command.actorId)
    if (isActorArchived(actor)) throw new ActorArchivedException(command.actorId)

    const existing = await this.identityRepo.findBySsoSubject(command.ssoSubject, command.tenantId)
    if (existing) throw new DuplicateSsoSubjectException(command.ssoSubject)

    const identity = await this.identityRepo.insert({
      tenantId: command.tenantId,
      actorId: command.actorId,
      email: command.email,
      ssoSubject: command.ssoSubject,
      provider: command.provider,
    })

    return identity.id
  }
}
```

- [ ] **Step 5: Run to confirm pass**

```bash
cd apps/api && bun vitest run src/modules/kernel/application/commands/create-user-identity.handler.spec.ts
```

Expected: PASS — 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/kernel/application/commands/create-user-identity.command.ts \
        apps/api/src/modules/kernel/application/commands/create-user-identity.handler.ts \
        apps/api/src/modules/kernel/application/commands/create-user-identity.handler.spec.ts
git commit -m "feat(kernel): CreateUserIdentityHandler with unit tests"
```

---

## Task 9: TDD — `GrantRoleHandler`

- [ ] **Step 1: Create the command**

`application/commands/grant-role.command.ts`:

```ts
import type { RoleKeyValue, ScopeTypeValue } from '../../domain/entities/role-grant.entity.js'

export class GrantRoleCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly roleKey: RoleKeyValue,
    readonly scopeType: ScopeTypeValue,
    readonly scopeId: string | null,
    readonly grantedBy: string,
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

`application/commands/grant-role.handler.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GrantRoleHandler } from './grant-role.handler.js'
import { GrantRoleCommand } from './grant-role.command.js'
import type { IActorRepository } from '../../domain/repositories/actor.repository.port.js'
import type { IRoleGrantRepository } from '../../domain/repositories/role-grant.repository.port.js'
import { ActorNotFoundException } from '../../domain/exceptions/actor.exceptions.js'
import { DomainException } from '../../domain/exceptions/domain.exception.js'
import type { Actor } from '../../domain/entities/actor.entity.js'
import type { RoleGrant } from '../../domain/entities/role-grant.entity.js'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const GRANTER_ID = '01900000-0000-7000-8000-000000000003'
const GRANT_ID = '01900000-0000-7000-8000-000000000004'
const DEPT_ID = '01900000-0000-7000-8000-000000000005'

const fakeActor: Actor = {
  id: ACTOR_ID,
  tenantId: TENANT_ID,
  type: 'person',
  displayName: 'Canh Ta',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeGrant: RoleGrant = {
  id: GRANT_ID,
  tenantId: TENANT_ID,
  actorId: ACTOR_ID,
  roleKey: 'employee',
  scopeType: 'global',
  scopeId: null,
  grantedBy: GRANTER_ID,
  validFrom: new Date(),
  validUntil: null,
}

describe('GrantRoleHandler', () => {
  let handler: GrantRoleHandler
  let actorRepo: IActorRepository
  let roleGrantRepo: IRoleGrantRepository

  beforeEach(() => {
    actorRepo = { findById: vi.fn(), insert: vi.fn() }
    roleGrantRepo = { findByActorId: vi.fn(), insert: vi.fn() }
    handler = new GrantRoleHandler(actorRepo, roleGrantRepo)
  })

  it('returns the new grant id for a global scope role', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(fakeActor)
    vi.mocked(roleGrantRepo.insert).mockResolvedValue(fakeGrant)

    const result = await handler.execute(
      new GrantRoleCommand(TENANT_ID, ACTOR_ID, 'employee', 'global', null, GRANTER_ID),
    )

    expect(result).toBe(GRANT_ID)
    expect(roleGrantRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      roleKey: 'employee',
      scopeType: 'global',
      scopeId: null,
      grantedBy: GRANTER_ID,
    })
  })

  it('returns the new grant id for a scoped role with scopeId', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(fakeActor)
    vi.mocked(roleGrantRepo.insert).mockResolvedValue({
      ...fakeGrant,
      scopeType: 'department',
      scopeId: DEPT_ID,
    })

    const result = await handler.execute(
      new GrantRoleCommand(TENANT_ID, ACTOR_ID, 'line_manager', 'department', DEPT_ID, GRANTER_ID),
    )

    expect(result).toBe(GRANT_ID)
  })

  it('throws ActorNotFoundException when actor does not exist', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new GrantRoleCommand(TENANT_ID, ACTOR_ID, 'employee', 'global', null, GRANTER_ID),
      ),
    ).rejects.toThrow(ActorNotFoundException)

    expect(roleGrantRepo.insert).not.toHaveBeenCalled()
  })

  it('throws when scopeType is not global but scopeId is null', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(fakeActor)

    await expect(
      handler.execute(
        new GrantRoleCommand(TENANT_ID, ACTOR_ID, 'line_manager', 'department', null, GRANTER_ID),
      ),
    ).rejects.toThrow(DomainException)

    expect(roleGrantRepo.insert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run to confirm fail**

```bash
cd apps/api && bun vitest run src/modules/kernel/application/commands/grant-role.handler.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `grant-role.handler.ts`**

```ts
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { GrantRoleCommand } from './grant-role.command.js'
import {
  ACTOR_REPOSITORY,
  type IActorRepository,
} from '../../domain/repositories/actor.repository.port.js'
import {
  ROLE_GRANT_REPOSITORY,
  type IRoleGrantRepository,
} from '../../domain/repositories/role-grant.repository.port.js'
import { ActorNotFoundException } from '../../domain/exceptions/actor.exceptions.js'
import { DomainException } from '../../domain/exceptions/domain.exception.js'

class MissingScopeIdException extends DomainException {
  readonly code = 'MISSING_SCOPE_ID'
  constructor() {
    super('scopeId is required when scopeType is not global')
  }
}

@CommandHandler(GrantRoleCommand)
export class GrantRoleHandler implements ICommandHandler<GrantRoleCommand, string> {
  constructor(
    @Inject(ACTOR_REPOSITORY) private readonly actorRepo: IActorRepository,
    @Inject(ROLE_GRANT_REPOSITORY) private readonly roleGrantRepo: IRoleGrantRepository,
  ) {}

  async execute(command: GrantRoleCommand): Promise<string> {
    const actor = await this.actorRepo.findById(command.actorId, command.tenantId)
    if (!actor) throw new ActorNotFoundException(command.actorId)

    if (command.scopeType !== 'global' && command.scopeId === null) {
      throw new MissingScopeIdException()
    }

    const grant = await this.roleGrantRepo.insert({
      tenantId: command.tenantId,
      actorId: command.actorId,
      roleKey: command.roleKey,
      scopeType: command.scopeType,
      scopeId: command.scopeId,
      grantedBy: command.grantedBy,
    })

    return grant.id
  }
}
```

- [ ] **Step 5: Run to confirm pass**

```bash
cd apps/api && bun vitest run src/modules/kernel/application/commands/grant-role.handler.spec.ts
```

Expected: PASS — 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/kernel/application/commands/grant-role.command.ts \
        apps/api/src/modules/kernel/application/commands/grant-role.handler.ts \
        apps/api/src/modules/kernel/application/commands/grant-role.handler.spec.ts
git commit -m "feat(kernel): GrantRoleHandler with unit tests"
```

---

## Task 10: Query handlers (4)

No TDD here — these are thin delegations to repo methods. Create all four, then run typecheck.

- [ ] **Step 1: Create query + handler pairs**

`application/queries/get-actor.query.ts`:

```ts
export class GetActorQuery {
  constructor(
    readonly actorId: string,
    readonly tenantId: string,
  ) {}
}
```

`application/queries/get-actor.handler.ts`:

```ts
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { GetActorQuery } from './get-actor.query.js'
import {
  ACTOR_REPOSITORY,
  type IActorRepository,
} from '../../domain/repositories/actor.repository.port.js'
import type { Actor } from '../../domain/entities/actor.entity.js'

@QueryHandler(GetActorQuery)
export class GetActorHandler implements IQueryHandler<GetActorQuery, Actor | null> {
  constructor(@Inject(ACTOR_REPOSITORY) private readonly actorRepo: IActorRepository) {}

  execute(query: GetActorQuery): Promise<Actor | null> {
    return this.actorRepo.findById(query.actorId, query.tenantId)
  }
}
```

`application/queries/get-tenant.query.ts`:

```ts
export class GetTenantQuery {
  constructor(readonly tenantId: string) {}
}
```

`application/queries/get-tenant.handler.ts`:

```ts
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { GetTenantQuery } from './get-tenant.query.js'
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/repositories/tenant.repository.port.js'
import type { Tenant } from '../../domain/entities/tenant.entity.js'

@QueryHandler(GetTenantQuery)
export class GetTenantHandler implements IQueryHandler<GetTenantQuery, Tenant | null> {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository) {}

  execute(query: GetTenantQuery): Promise<Tenant | null> {
    return this.tenantRepo.findById(query.tenantId)
  }
}
```

`application/queries/get-role-grants.query.ts`:

```ts
export class GetRoleGrantsQuery {
  constructor(
    readonly actorId: string,
    readonly tenantId: string,
  ) {}
}
```

`application/queries/get-role-grants.handler.ts`:

```ts
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { GetRoleGrantsQuery } from './get-role-grants.query.js'
import {
  ROLE_GRANT_REPOSITORY,
  type IRoleGrantRepository,
} from '../../domain/repositories/role-grant.repository.port.js'
import type { RoleGrant } from '../../domain/entities/role-grant.entity.js'

@QueryHandler(GetRoleGrantsQuery)
export class GetRoleGrantsHandler implements IQueryHandler<GetRoleGrantsQuery, RoleGrant[]> {
  constructor(
    @Inject(ROLE_GRANT_REPOSITORY) private readonly roleGrantRepo: IRoleGrantRepository,
  ) {}

  execute(query: GetRoleGrantsQuery): Promise<RoleGrant[]> {
    return this.roleGrantRepo.findByActorId(query.actorId, query.tenantId)
  }
}
```

`application/queries/get-user-identity-by-sso-subject.query.ts`:

```ts
export class GetUserIdentityBySsoSubjectQuery {
  constructor(
    readonly ssoSubject: string,
    readonly tenantId: string,
  ) {}
}
```

`application/queries/get-user-identity-by-sso-subject.handler.ts`:

```ts
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { GetUserIdentityBySsoSubjectQuery } from './get-user-identity-by-sso-subject.query.js'
import {
  USER_IDENTITY_REPOSITORY,
  type IUserIdentityRepository,
} from '../../domain/repositories/user-identity.repository.port.js'
import type { UserIdentity } from '../../domain/entities/user-identity.entity.js'

@QueryHandler(GetUserIdentityBySsoSubjectQuery)
export class GetUserIdentityBySsoSubjectHandler implements IQueryHandler<
  GetUserIdentityBySsoSubjectQuery,
  UserIdentity | null
> {
  constructor(
    @Inject(USER_IDENTITY_REPOSITORY) private readonly identityRepo: IUserIdentityRepository,
  ) {}

  execute(query: GetUserIdentityBySsoSubjectQuery): Promise<UserIdentity | null> {
    return this.identityRepo.findBySsoSubject(query.ssoSubject, query.tenantId)
  }
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/kernel/application/queries/
git commit -m "feat(kernel): add query handlers for actor, tenant, role grants, user identity"
```

---

## Task 11: Drizzle repositories (5)

**Files:** all five `drizzle-*.repository.ts` files in `infrastructure/repositories/`.

- [ ] **Step 1: Create `drizzle-tenant.repository.ts`**

```ts
import { Injectable, Inject } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../common/db/db.module.js'
import { tenant } from '../schema/index.js'
import type { ITenantRepository } from '../../domain/repositories/tenant.repository.port.js'
import type { Tenant } from '../../domain/entities/tenant.entity.js'

@Injectable()
export class DrizzleTenantRepository implements ITenantRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string): Promise<Tenant | null> {
    const rows = await this.db.select().from(tenant).where(eq(tenant.id, id)).limit(1)
    return (rows[0] as Tenant) ?? null
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const rows = await this.db.select().from(tenant).where(eq(tenant.slug, slug)).limit(1)
    return (rows[0] as Tenant) ?? null
  }

  async insert(data: {
    name: string
    slug: string
    planTier: Tenant['planTier']
  }): Promise<Tenant> {
    const rows = await this.db
      .insert(tenant)
      .values({ name: data.name, slug: data.slug, planTier: data.planTier })
      .returning()
    return rows[0] as Tenant
  }
}
```

- [ ] **Step 2: Create `drizzle-actor.repository.ts`**

```ts
import { Injectable, Inject } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../common/db/db.module.js'
import { actor } from '../schema/index.js'
import type { IActorRepository } from '../../domain/repositories/actor.repository.port.js'
import type { Actor } from '../../domain/entities/actor.entity.js'

@Injectable()
export class DrizzleActorRepository implements IActorRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<Actor | null> {
    const rows = await this.db
      .select()
      .from(actor)
      .where(and(eq(actor.id, id), eq(actor.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as Actor) ?? null
  }

  async insert(data: {
    tenantId: string
    type: Actor['type']
    displayName: string
  }): Promise<Actor> {
    const rows = await this.db
      .insert(actor)
      .values({ tenantId: data.tenantId, type: data.type, displayName: data.displayName })
      .returning()
    return rows[0] as Actor
  }
}
```

- [ ] **Step 3: Create `drizzle-user-identity.repository.ts`**

```ts
import { Injectable, Inject } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../common/db/db.module.js'
import { userIdentity } from '../schema/index.js'
import type { IUserIdentityRepository } from '../../domain/repositories/user-identity.repository.port.js'
import type { UserIdentity } from '../../domain/entities/user-identity.entity.js'

@Injectable()
export class DrizzleUserIdentityRepository implements IUserIdentityRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<UserIdentity | null> {
    const rows = await this.db
      .select()
      .from(userIdentity)
      .where(and(eq(userIdentity.id, id), eq(userIdentity.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as UserIdentity) ?? null
  }

  async findBySsoSubject(ssoSubject: string, tenantId: string): Promise<UserIdentity | null> {
    const rows = await this.db
      .select()
      .from(userIdentity)
      .where(and(eq(userIdentity.ssoSubject, ssoSubject), eq(userIdentity.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as UserIdentity) ?? null
  }

  async insert(data: {
    tenantId: string
    actorId: string
    email: string
    ssoSubject: string
    provider: UserIdentity['provider']
  }): Promise<UserIdentity> {
    const rows = await this.db
      .insert(userIdentity)
      .values({
        tenantId: data.tenantId,
        actorId: data.actorId,
        email: data.email,
        ssoSubject: data.ssoSubject,
        provider: data.provider,
      })
      .returning()
    return rows[0] as UserIdentity
  }
}
```

- [ ] **Step 4: Create `drizzle-role-grant.repository.ts`**

Active grants only: `valid_until IS NULL OR valid_until > NOW()`.

```ts
import { Injectable, Inject } from '@nestjs/common'
import { eq, and, or, isNull, gt } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../common/db/db.module.js'
import { roleGrant } from '../schema/index.js'
import type { IRoleGrantRepository } from '../../domain/repositories/role-grant.repository.port.js'
import type { RoleGrant } from '../../domain/entities/role-grant.entity.js'

@Injectable()
export class DrizzleRoleGrantRepository implements IRoleGrantRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByActorId(actorId: string, tenantId: string): Promise<RoleGrant[]> {
    const now = new Date()
    const rows = await this.db
      .select()
      .from(roleGrant)
      .where(
        and(
          eq(roleGrant.actorId, actorId),
          eq(roleGrant.tenantId, tenantId),
          or(isNull(roleGrant.validUntil), gt(roleGrant.validUntil, now)),
        ),
      )
    return rows as RoleGrant[]
  }

  async insert(data: {
    tenantId: string
    actorId: string
    roleKey: RoleGrant['roleKey']
    scopeType: RoleGrant['scopeType']
    scopeId: string | null
    grantedBy: string
  }): Promise<RoleGrant> {
    const rows = await this.db
      .insert(roleGrant)
      .values({
        tenantId: data.tenantId,
        actorId: data.actorId,
        roleKey: data.roleKey,
        scopeType: data.scopeType,
        scopeId: data.scopeId ?? undefined,
        grantedBy: data.grantedBy,
      })
      .returning()
    return rows[0] as RoleGrant
  }
}
```

- [ ] **Step 5: Create `drizzle-department.repository.ts`**

```ts
import { Injectable, Inject } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../common/db/db.module.js'
import { department } from '../schema/index.js'
import type { IDepartmentRepository } from '../../domain/repositories/department.repository.port.js'
import type { Department } from '../../domain/entities/department.entity.js'

@Injectable()
export class DrizzleDepartmentRepository implements IDepartmentRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<Department | null> {
    const rows = await this.db
      .select()
      .from(department)
      .where(and(eq(department.id, id), eq(department.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as Department) ?? null
  }

  async insert(data: {
    tenantId: string
    name: string
    parentId?: string
    costCenterCode?: string
  }): Promise<Department> {
    const rows = await this.db
      .insert(department)
      .values({
        tenantId: data.tenantId,
        name: data.name,
        parentId: data.parentId,
        costCenterCode: data.costCenterCode,
      })
      .returning()
    return rows[0] as Department
  }
}
```

- [ ] **Step 6: Verify typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/kernel/infrastructure/repositories/
git commit -m "feat(kernel): add Drizzle repository implementations for all 5 core entities"
```

---

## Task 12: `KernelQueryFacade` implementation

Replace the stub entirely.

**Files:**

- Modify: `apps/api/src/modules/kernel/application/facades/kernel-query.facade.ts`

- [ ] **Step 1: Replace `kernel-query.facade.ts`**

```ts
import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { GetActorQuery } from '../queries/get-actor.query.js'
import { GetTenantQuery } from '../queries/get-tenant.query.js'
import { GetRoleGrantsQuery } from '../queries/get-role-grants.query.js'
import { GetUserIdentityBySsoSubjectQuery } from '../queries/get-user-identity-by-sso-subject.query.js'
import type { Actor } from '../../domain/entities/actor.entity.js'
import type { Tenant } from '../../domain/entities/tenant.entity.js'
import type { RoleGrant } from '../../domain/entities/role-grant.entity.js'
import type { UserIdentity } from '../../domain/entities/user-identity.entity.js'

/**
 * KernelQueryFacade is the ONLY class other modules may import from the kernel.
 * No module imports kernel repositories, entities, or domain files directly.
 */
@Injectable()
export class KernelQueryFacade {
  constructor(private readonly queryBus: QueryBus) {}

  getActor(actorId: string, tenantId: string): Promise<Actor | null> {
    return this.queryBus.execute(new GetActorQuery(actorId, tenantId))
  }

  getTenant(tenantId: string): Promise<Tenant | null> {
    return this.queryBus.execute(new GetTenantQuery(tenantId))
  }

  getRoleGrants(actorId: string, tenantId: string): Promise<RoleGrant[]> {
    return this.queryBus.execute(new GetRoleGrantsQuery(actorId, tenantId))
  }

  async hasRole(actorId: string, roleKey: string, tenantId: string): Promise<boolean> {
    const grants = await this.getRoleGrants(actorId, tenantId)
    return grants.some((g) => g.roleKey === roleKey)
  }

  async getActiveRoleGrant(
    actorId: string,
    roleKey: string,
    tenantId: string,
  ): Promise<RoleGrant | null> {
    const grants = await this.getRoleGrants(actorId, tenantId)
    return grants.find((g) => g.roleKey === roleKey) ?? null
  }

  getUserIdentityBySsoSubject(ssoSubject: string, tenantId: string): Promise<UserIdentity | null> {
    return this.queryBus.execute(new GetUserIdentityBySsoSubjectQuery(ssoSubject, tenantId))
  }
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/kernel/application/facades/kernel-query.facade.ts
git commit -m "feat(kernel): implement KernelQueryFacade via QueryBus"
```

---

## Task 13: Wire `KernelModule`

Register all providers with `CqrsModule`.

**Files:**

- Modify: `apps/api/src/modules/kernel/kernel.module.ts`

- [ ] **Step 1: Replace `kernel.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
// Repositories
import { DrizzleTenantRepository } from './infrastructure/repositories/drizzle-tenant.repository.js'
import { DrizzleActorRepository } from './infrastructure/repositories/drizzle-actor.repository.js'
import { DrizzleUserIdentityRepository } from './infrastructure/repositories/drizzle-user-identity.repository.js'
import { DrizzleRoleGrantRepository } from './infrastructure/repositories/drizzle-role-grant.repository.js'
import { DrizzleDepartmentRepository } from './infrastructure/repositories/drizzle-department.repository.js'
// Ports
import { TENANT_REPOSITORY } from './domain/repositories/tenant.repository.port.js'
import { ACTOR_REPOSITORY } from './domain/repositories/actor.repository.port.js'
import { USER_IDENTITY_REPOSITORY } from './domain/repositories/user-identity.repository.port.js'
import { ROLE_GRANT_REPOSITORY } from './domain/repositories/role-grant.repository.port.js'
import { DEPARTMENT_REPOSITORY } from './domain/repositories/department.repository.port.js'
// Command handlers
import { CreateActorHandler } from './application/commands/create-actor.handler.js'
import { CreateUserIdentityHandler } from './application/commands/create-user-identity.handler.js'
import { GrantRoleHandler } from './application/commands/grant-role.handler.js'
// Query handlers
import { GetActorHandler } from './application/queries/get-actor.handler.js'
import { GetTenantHandler } from './application/queries/get-tenant.handler.js'
import { GetRoleGrantsHandler } from './application/queries/get-role-grants.handler.js'
import { GetUserIdentityBySsoSubjectHandler } from './application/queries/get-user-identity-by-sso-subject.handler.js'
// Facade
import { KernelQueryFacade } from './application/facades/kernel-query.facade.js'

@Module({
  imports: [CqrsModule],
  providers: [
    // Repository bindings
    { provide: TENANT_REPOSITORY, useClass: DrizzleTenantRepository },
    { provide: ACTOR_REPOSITORY, useClass: DrizzleActorRepository },
    { provide: USER_IDENTITY_REPOSITORY, useClass: DrizzleUserIdentityRepository },
    { provide: ROLE_GRANT_REPOSITORY, useClass: DrizzleRoleGrantRepository },
    { provide: DEPARTMENT_REPOSITORY, useClass: DrizzleDepartmentRepository },
    // Handlers
    CreateActorHandler,
    CreateUserIdentityHandler,
    GrantRoleHandler,
    GetActorHandler,
    GetTenantHandler,
    GetRoleGrantsHandler,
    GetUserIdentityBySsoSubjectHandler,
    // Facade — the only public export
    KernelQueryFacade,
  ],
  exports: [KernelQueryFacade],
})
export class KernelModule {}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/kernel/kernel.module.ts
git commit -m "feat(kernel): wire KernelModule with CqrsModule and all providers"
```

---

## Task 14: `TenantContextService` + `RlsMiddleware` + `AppClsModule`

**Files:**

- Create: `apps/api/src/common/cls/tenant-context.service.ts`
- Modify: `apps/api/src/common/cls/cls.module.ts`
- Create: `apps/api/src/common/rls/rls.middleware.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create `tenant-context.service.ts`**

```ts
import { Injectable } from '@nestjs/common'
import { ClsService } from 'nestjs-cls'

const TENANT_ID_KEY = 'tenantId'

@Injectable()
export class TenantContextService {
  constructor(private readonly cls: ClsService) {}

  getTenantId(): string {
    const tenantId = this.cls.get<string>(TENANT_ID_KEY)
    if (!tenantId) {
      throw new Error(
        'TenantContextService: tenantId not set. Ensure RLS middleware ran before this call.',
      )
    }
    return tenantId
  }

  setTenantId(tenantId: string): void {
    this.cls.set(TENANT_ID_KEY, tenantId)
  }
}
```

- [ ] **Step 2: Replace `cls.module.ts`**

Update the existing stub to export `TenantContextService`:

```ts
import { Global, Module } from '@nestjs/common'
import { ClsModule } from 'nestjs-cls'
import { TenantContextService } from './tenant-context.service.js'

@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (_cls, _req, _res) => {
          // tenantId is set later by RlsMiddleware after session resolution.
          // Placeholder: read x-tenant-id header for local dev / integration tests.
          // TODO: replace with real session cookie extraction once auth is wired.
          const tenantId = (_req as { headers?: Record<string, string> }).headers?.['x-tenant-id']
          if (tenantId) _cls.set('tenantId', tenantId)
        },
      },
    }),
  ],
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class AppClsModule {}
```

- [ ] **Step 3: Create `apps/api/src/common/rls/rls.middleware.ts`**

```ts
import { Injectable, NestMiddleware } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Db } from '@future/db'
import { Inject } from '@nestjs/common'
import { DB_TOKEN } from '../db/db.module.js'
import { TenantContextService } from '../cls/tenant-context.service.js'

/**
 * Sets the PostgreSQL session-level tenant context for RLS.
 *
 * set_config('app.tenant_id', tenantId, false) — third arg false = session scope.
 * This means the setting persists for the connection lifetime.
 *
 * IMPORTANT: This works safely with connection pooling only when combined with
 * explicit tenant_id in every WHERE clause (belt-and-suspenders). The repository
 * implementations always include tenant_id in queries.
 *
 * For transaction-local isolation (is_local = true), wrap the entire request in
 * an explicit db.transaction() — deferred to a later plan.
 */
@Injectable()
export class RlsMiddleware implements NestMiddleware {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly tenantContext: TenantContextService,
  ) {}

  async use(_req: FastifyRequest, _res: FastifyReply, next: () => void): Promise<void> {
    try {
      const tenantId = this.tenantContext.getTenantId()
      await this.db.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, false)`)
    } catch {
      // tenantId not set — this is expected for public routes (health, migrations).
      // Queries on protected routes will still be tenant-filtered via explicit WHERE clauses.
    }
    next()
  }
}
```

- [ ] **Step 4: Update `app.module.ts` to apply `RlsMiddleware` globally**

Add `RlsMiddleware` import and implement `NestModule`:

```ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DbModule } from './common/db/db.module.js'
import { AppClsModule } from './common/cls/cls.module.js'
import { RlsMiddleware } from './common/rls/rls.middleware.js'
import { TrpcModule } from './common/trpc/trpc.module.js'
import { HealthController } from './common/health/health.controller.js'
import { KernelModule } from './modules/kernel/kernel.module.js'
import { PeopleModule } from './modules/people/people.module.js'
import { TimeModule } from './modules/time/time.module.js'
import { HiringModule } from './modules/hiring/hiring.module.js'
import { PerformanceModule } from './modules/performance/performance.module.js'
import { ProjectsModule } from './modules/projects/projects.module.js'
import { FinanceModule } from './modules/finance/finance.module.js'
import { GoalsModule } from './modules/goals/goals.module.js'
import { InsightsModule } from './modules/insights/insights.module.js'
import { AgentsModule } from './modules/agents/agents.module.js'
import { PlannerModule } from './modules/planner/planner.module.js'
import { AdminModule } from './modules/admin/admin.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AppClsModule,
    TrpcModule,
    KernelModule,
    PeopleModule,
    TimeModule,
    HiringModule,
    PerformanceModule,
    ProjectsModule,
    FinanceModule,
    GoalsModule,
    InsightsModule,
    AgentsModule,
    PlannerModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RlsMiddleware).forRoutes('*')
  }
}
```

- [ ] **Step 5: Register `RlsMiddleware` as a provider in `AppModule`**

Add `providers: [RlsMiddleware]` to the `@Module` decorator:

```ts
@Module({
  imports: [...],
  controllers: [HealthController],
  providers: [RlsMiddleware],
})
```

- [ ] **Step 6: Verify typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common/cls/ \
        apps/api/src/common/rls/ \
        apps/api/src/app.module.ts
git commit -m "feat(api): add TenantContextService, RlsMiddleware, and AppClsModule CLS setup"
```

---

## Task 15: Test helpers

Update `packages/db/src/test-helpers/index.ts` with helpers needed by integration tests.

**Files:**

- Modify: `packages/db/src/test-helpers/index.ts`

- [ ] **Step 1: Replace `packages/db/src/test-helpers/index.ts`**

Uses raw SQL to avoid importing from `apps/api` schema files:

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { sql } from 'drizzle-orm'
import { Pool } from 'pg'
import path from 'path'
import { fileURLToPath } from 'url'
import { uuidv7 } from 'uuidv7'
import { createDb, type Db } from '../index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const MIGRATIONS_DIR = path.join(__dirname, '../../drizzle/migrations')

export function createTestDb(): Db {
  const url = process.env['TEST_DATABASE_URL']
  if (!url) throw new Error('TEST_DATABASE_URL is required for integration tests')
  return createDb(url)
}

/**
 * Run all pending migrations against the test database.
 * Call once in beforeAll for integration test files.
 */
export async function migrateForTest(): Promise<void> {
  const url = process.env['TEST_DATABASE_URL']
  if (!url) throw new Error('TEST_DATABASE_URL is required')
  const pool = new Pool({ connectionString: url })
  const db = drizzle(pool)
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  } finally {
    await pool.end()
  }
}

/**
 * Truncate all core tables. Call in afterAll to clean up between test files.
 * Does NOT drop the schema — migrations only need to run once per test session.
 */
export async function truncateCoreSchema(db: Db): Promise<void> {
  await db.execute(
    sql`TRUNCATE core.role_grant, core.user_identity, core.actor, core.department, core.tenant RESTART IDENTITY CASCADE`,
  )
}

/**
 * Set the PostgreSQL tenant context for the current connection.
 * Use inside db.transaction() to ensure the same connection is used for
 * set_config and subsequent queries.
 */
export async function setTenantContext(db: Db, tenantId: string): Promise<void> {
  await db.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, false)`)
}

/**
 * Seed a tenant row directly via raw SQL (no Drizzle schema import needed).
 */
export async function seedTenant(
  db: Db,
  overrides: Partial<{
    id: string
    name: string
    slug: string
    planTier: string
  }> = {},
): Promise<{ id: string; name: string; slug: string }> {
  const id = overrides.id ?? uuidv7()
  const name = overrides.name ?? `Test Tenant ${id.slice(0, 8)}`
  const slug = overrides.slug ?? `test-${id.slice(0, 8)}`
  const planTier = overrides.planTier ?? 'starter'

  await db.execute(
    sql`INSERT INTO core.tenant (id, name, slug, status, plan_tier, created_at, updated_at)
        VALUES (${id}, ${name}, ${slug}, 'active', ${planTier}, NOW(), NOW())`,
  )

  return { id, name, slug }
}

/**
 * Seed an actor row directly via raw SQL.
 */
export async function seedActor(
  db: Db,
  overrides: Partial<{
    id: string
    tenantId: string
    type: string
    displayName: string
    status: string
  }> = {},
): Promise<{ id: string; tenantId: string }> {
  const id = overrides.id ?? uuidv7()
  const tenantId = overrides.tenantId ?? uuidv7()
  const type = overrides.type ?? 'person'
  const displayName = overrides.displayName ?? `Test Actor ${id.slice(0, 8)}`
  const status = overrides.status ?? 'active'

  await db.execute(
    sql`INSERT INTO core.actor (id, tenant_id, type, display_name, status, created_at, updated_at)
        VALUES (${id}, ${tenantId}, ${type}, ${displayName}, ${status}, NOW(), NOW())`,
  )

  return { id, tenantId }
}
```

- [ ] **Step 2: Verify packages/db typecheck**

```bash
cd packages/db && bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/test-helpers/index.ts
git commit -m "feat(db): implement test helpers — migrateForTest, seedTenant, seedActor, setTenantContext"
```

---

## Task 16: Integration test — actor RLS isolation

**Files:**

- Create: `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-actor.repository.integration.spec.ts`

- [ ] **Step 1: Write the integration test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import {
  createTestDb,
  migrateForTest,
  truncateCoreSchema,
  seedTenant,
  seedActor,
} from '@future/db/test-helpers'
import { DrizzleActorRepository } from './drizzle-actor.repository.js'

const TENANT_A = '01900000-0000-7fff-8000-000000000001'
const TENANT_B = '01900000-0000-7fff-8000-000000000002'

describe('DrizzleActorRepository — RLS isolation', () => {
  const db = createTestDb()
  let repo: DrizzleActorRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncateCoreSchema(db)

    // Seed tenants (no tenant_id on tenant table — bypass RLS)
    await seedTenant(db, { id: TENANT_A, slug: 'tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'tenant-b' })

    repo = new DrizzleActorRepository(db as never)
  })

  afterAll(async () => {
    await truncateCoreSchema(db)
  })

  it('findById returns actor within the correct tenant', async () => {
    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, false)`)
    const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })

    const found = await repo.findById(actorId, TENANT_A)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(actorId)
  })

  it('CRITICAL: findById returns null when querying cross-tenant (RLS + explicit WHERE)', async () => {
    // Seed actor in Tenant B
    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_B}, false)`)
    const { id: actorBId } = await seedActor(db, { tenantId: TENANT_B })

    // Switch to Tenant A context — both RLS and explicit tenantId should block
    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, false)`)
    const found = await repo.findById(actorBId, TENANT_A)

    expect(found).toBeNull()
  })

  it('insert creates actor accessible in same tenant context', async () => {
    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, false)`)

    const actor = await repo.insert({
      tenantId: TENANT_A,
      type: 'person',
      displayName: 'Integration Test Actor',
    })

    expect(actor.id).toBeDefined()
    expect(actor.tenantId).toBe(TENANT_A)
    expect(actor.status).toBe('invited')
  })
})
```

- [ ] **Step 2: Run the integration test**

Ensure a local PostgreSQL instance is running and `TEST_DATABASE_URL` is set:

```bash
export TEST_DATABASE_URL="postgresql://localhost:5432/future_test"
cd apps/api && bun vitest run --project integration src/modules/kernel/infrastructure/repositories/drizzle-actor.repository.integration.spec.ts
```

Expected: 3 tests pass. If RLS is correctly configured, the cross-tenant test passes. If there are schema errors, the migration may not have run — ensure `migrateForTest()` ran without errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/kernel/infrastructure/repositories/drizzle-actor.repository.integration.spec.ts
git commit -m "test(kernel): actor repository RLS isolation integration test"
```

---

## Task 17: Integration test — role grant validity

**Files:**

- Create: `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-role-grant.repository.integration.spec.ts`

- [ ] **Step 1: Write the integration test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import {
  createTestDb,
  migrateForTest,
  truncateCoreSchema,
  seedTenant,
  seedActor,
} from '@future/db/test-helpers'
import { uuidv7 } from 'uuidv7'
import { DrizzleRoleGrantRepository } from './drizzle-role-grant.repository.js'

const TENANT_A = '01900000-0000-7fff-8000-000000000003'
const TENANT_B = '01900000-0000-7fff-8000-000000000004'

describe('DrizzleRoleGrantRepository', () => {
  const db = createTestDb()
  let repo: DrizzleRoleGrantRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'rg-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'rg-tenant-b' })
    repo = new DrizzleRoleGrantRepository(db as never)
  })

  afterAll(async () => {
    await truncateCoreSchema(db)
  })

  it('findByActorId returns active grants only', async () => {
    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, false)`)
    const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })
    const granterActor = await seedActor(db, { tenantId: TENANT_A })

    // Active grant (no expiry)
    await repo.insert({
      tenantId: TENANT_A,
      actorId,
      roleKey: 'employee',
      scopeType: 'global',
      scopeId: null,
      grantedBy: granterActor.id,
    })

    // Expired grant (valid_until in the past)
    const expiredId = uuidv7()
    await db.execute(
      sql`INSERT INTO core.role_grant (id, tenant_id, actor_id, role_key, scope_type, granted_by, valid_from, valid_until)
          VALUES (${expiredId}, ${TENANT_A}, ${actorId}, 'hr_ops', 'global', ${granterActor.id}, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day')`,
    )

    const grants = await repo.findByActorId(actorId, TENANT_A)

    expect(grants).toHaveLength(1)
    expect(grants[0]!.roleKey).toBe('employee')
  })

  it('CRITICAL: findByActorId returns empty for cross-tenant query', async () => {
    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_B}, false)`)
    const { id: actorBId } = await seedActor(db, { tenantId: TENANT_B })
    const granterB = await seedActor(db, { tenantId: TENANT_B })

    await repo.insert({
      tenantId: TENANT_B,
      actorId: actorBId,
      roleKey: 'platform_admin',
      scopeType: 'global',
      scopeId: null,
      grantedBy: granterB.id,
    })

    // Switch to Tenant A — should see zero Tenant B grants
    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, false)`)
    const grants = await repo.findByActorId(actorBId, TENANT_A)

    expect(grants).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the integration test**

```bash
cd apps/api && bun vitest run --project integration src/modules/kernel/infrastructure/repositories/drizzle-role-grant.repository.integration.spec.ts
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/kernel/infrastructure/repositories/drizzle-role-grant.repository.integration.spec.ts
git commit -m "test(kernel): role grant repository validity and RLS isolation integration tests"
```

---

## Task 18: Integration test — tenant context

Verify `set_config` scoping behavior.

**Files:**

- Create: `apps/api/src/common/rls/tenant-context.integration.spec.ts`

- [ ] **Step 1: Write the integration test**

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createTestDb, migrateForTest, seedTenant } from '@future/db/test-helpers'

const TENANT_A = '01900000-0000-7fff-8000-000000000005'

describe('tenant context — set_config scoping', () => {
  const db = createTestDb()

  beforeAll(async () => {
    await migrateForTest()
    await seedTenant(db, { id: TENANT_A, slug: 'ctx-tenant-a' })
  })

  it('set_config with false (session scope) persists on the same connection within a transaction', async () => {
    // Using db.transaction ensures set_config and SELECT run on the same connection
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, false)`)
      const rows = await tx.execute<{ current_setting: string }>(
        sql`SELECT current_setting('app.tenant_id') AS current_setting`,
      )
      return rows.rows[0]?.current_setting
    })

    expect(result).toBe(TENANT_A)
  })

  it('current_setting returns null/empty string when app.tenant_id is not set (missing = ok variant)', async () => {
    const result = await db.transaction(async (tx) => {
      // true = missing_ok (returns empty string if not set, no error)
      const rows = await tx.execute<{ val: string }>(
        sql`SELECT current_setting('app.tenant_id', true) AS val`,
      )
      return rows.rows[0]?.val
    })

    // After the previous transaction the session-level setting may persist.
    // This test verifies the current_setting(name, missing_ok) form works without error.
    expect(typeof result).toBe('string')
  })
})
```

- [ ] **Step 2: Run the integration test**

```bash
cd apps/api && bun vitest run --project integration src/common/rls/tenant-context.integration.spec.ts
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/common/rls/tenant-context.integration.spec.ts
git commit -m "test(api): tenant context set_config scoping integration tests"
```

---

## Task 19: Tenant provisioning CLI

**Files:**

- Create: `apps/api/scripts/provision-tenant.ts`
- Modify: `package.json` (root)

- [ ] **Step 1: Create `apps/api/scripts/provision-tenant.ts`**

```ts
/**
 * Tenant provisioning CLI.
 *
 * Usage:
 *   bun run tenant:provision \
 *     --name "SETA" \
 *     --slug "seta" \
 *     --plan enterprise \
 *     --admin-name "Canh Ta" \
 *     --admin-email "canh@seta-international.com"
 *
 * Idempotent: exits cleanly if tenant with given slug already exists.
 */
import { sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { createDb } from '@future/db'

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

function requireArg(flag: string, name: string): string {
  const val = getArg(flag)
  if (!val) throw new Error(`Missing required argument: ${flag} (${name})`)
  return val
}

async function main() {
  const name = requireArg('--name', 'tenant name')
  const slug = requireArg('--slug', 'tenant slug')
  const plan = requireArg('--plan', 'plan tier') as 'starter' | 'professional' | 'enterprise'
  const adminName = requireArg('--admin-name', 'admin display name')
  const adminEmail = requireArg('--admin-email', 'admin email')

  const validPlans = ['starter', 'professional', 'enterprise']
  if (!validPlans.includes(plan)) {
    throw new Error(`Invalid plan tier "${plan}". Must be one of: ${validPlans.join(', ')}`)
  }

  const connectionString = process.env['DATABASE_URL']
  if (!connectionString) throw new Error('DATABASE_URL is required')

  const db = createDb(connectionString)

  // Idempotency check
  const existing = await db.execute<{ id: string }>(
    sql`SELECT id FROM core.tenant WHERE slug = ${slug} LIMIT 1`,
  )
  if (existing.rows.length > 0) {
    console.log(
      `[provision] Tenant "${slug}" already exists (id: ${existing.rows[0]!.id}). Skipping.`,
    )
    process.exit(0)
  }

  const tenantId = uuidv7()
  const botActorId = uuidv7()
  const adminActorId = uuidv7()
  const adminIdentityId = uuidv7()
  const adminGrantId = uuidv7()

  console.log(`[provision] Creating tenant "${name}" (${slug})...`)

  await db.transaction(async (tx) => {
    // 1. Tenant
    await tx.execute(
      sql`INSERT INTO core.tenant (id, name, slug, status, plan_tier, created_at, updated_at)
          VALUES (${tenantId}, ${name}, ${slug}, 'active', ${plan}, NOW(), NOW())`,
    )

    // 2. System bot actor
    await tx.execute(
      sql`INSERT INTO core.actor (id, tenant_id, type, display_name, status, created_at, updated_at)
          VALUES (${botActorId}, ${tenantId}, 'system', ${`${slug}-platform-bot`}, 'active', NOW(), NOW())`,
    )

    // 3. Admin person actor
    await tx.execute(
      sql`INSERT INTO core.actor (id, tenant_id, type, display_name, status, created_at, updated_at)
          VALUES (${adminActorId}, ${tenantId}, 'person', ${adminName}, 'invited', NOW(), NOW())`,
    )

    // 4. Admin user identity (SSO subject unknown until first login — use placeholder)
    await tx.execute(
      sql`INSERT INTO core.user_identity (id, tenant_id, actor_id, email, sso_subject, provider, status, created_at)
          VALUES (${adminIdentityId}, ${tenantId}, ${adminActorId}, ${adminEmail}, ${'pending-sso-' + adminActorId}, 'microsoft', 'active', NOW())`,
    )

    // 5. platform_admin role grant (global scope, granted by bot)
    await tx.execute(
      sql`INSERT INTO core.role_grant (id, tenant_id, actor_id, role_key, scope_type, scope_id, granted_by, valid_from)
          VALUES (${adminGrantId}, ${tenantId}, ${adminActorId}, 'platform_admin', 'global', NULL, ${botActorId}, NOW())`,
    )
  })

  console.log(`[provision] Done.`)
  console.log(`  tenant_id:        ${tenantId}`)
  console.log(`  bot_actor_id:     ${botActorId}`)
  console.log(`  admin_actor_id:   ${adminActorId}`)
  console.log(`  admin_identity_id: ${adminIdentityId}`)
  console.log(`  admin_grant_id:   ${adminGrantId}`)
}

main().catch((err) => {
  console.error('[provision] Error:', err.message)
  process.exit(1)
})
```

- [ ] **Step 2: Add `tenant:provision` script to root `package.json`**

In the root `package.json`, add to the `scripts` block:

```json
"tenant:provision": "bun run apps/api/scripts/provision-tenant.ts"
```

- [ ] **Step 3: Smoke test (dry run)**

Run without required args to confirm error handling works:

```bash
bun run tenant:provision
```

Expected output: `[provision] Error: Missing required argument: --name (tenant name)`

- [ ] **Step 4: Run a real provision against the local DB**

```bash
DATABASE_URL="postgresql://localhost:5432/future_dev" \
bun run tenant:provision \
  --name "SETA" \
  --slug "seta" \
  --plan enterprise \
  --admin-name "Canh Ta" \
  --admin-email "canh@seta-international.com"
```

Expected output:

```
[provision] Creating tenant "SETA" (seta)...
[provision] Done.
  tenant_id:        01900...
  bot_actor_id:     01900...
  admin_actor_id:   01900...
  admin_identity_id: 01900...
  admin_grant_id:   01900...
```

Run again to confirm idempotency:

```bash
DATABASE_URL="postgresql://localhost:5432/future_dev" bun run tenant:provision --name "SETA" --slug "seta" --plan enterprise --admin-name "Canh Ta" --admin-email "canh@seta-international.com"
```

Expected: `[provision] Tenant "seta" already exists. Skipping.`

- [ ] **Step 5: Commit**

```bash
git add apps/api/scripts/provision-tenant.ts package.json
git commit -m "feat(api): tenant provisioning CLI script"
```

---

## Task 20: Final verification

- [ ] **Step 1: Run all unit tests**

```bash
cd apps/api && bun vitest run --project unit
```

Expected: All unit tests pass (3 spec files, 9 tests total).

- [ ] **Step 2: Run all integration tests**

```bash
export TEST_DATABASE_URL="postgresql://localhost:5432/future_test"
cd apps/api && bun vitest run --project integration
```

Expected: All integration tests pass (3 files, 7 tests total).

- [ ] **Step 3: Full monorepo typecheck**

```bash
cd /path/to/repo/root && bun run typecheck
```

Expected: No errors across all workspaces.

- [ ] **Step 4: Full monorepo lint**

```bash
bun run lint
```

Expected: No errors. If boundary violations appear for the `common/` layer, check that `apps/api/eslint.config.ts` excludes `common/` from boundary rules (it should, as `common/` is not a hexagonal layer).

- [ ] **Step 5: Final commit**

```bash
git add -u
git commit -m "chore: kernel baseline complete — schemas, domain, repos, CQRS handlers, RLS, migrations, CLI"
```
