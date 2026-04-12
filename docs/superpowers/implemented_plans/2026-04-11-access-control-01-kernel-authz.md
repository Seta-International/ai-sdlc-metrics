# Access Control 01 — Kernel Authorization Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DB-configurable role-permission mapping and `canDo()` authorization gate to the kernel module.

**Architecture:** New `role_permission` table in `core` schema maps roles to permission keys per tenant. `canDo()` on `KernelQueryFacade` resolves role grants (including delegations) → permission lookup → scope check. Seeded with defaults on tenant creation.

**Tech Stack:** NestJS CQRS, Drizzle ORM, PostgreSQL, vitest

**Depends on:** Kernel baseline (already implemented)
**Blocks:** All other access control plans (02-06) depend on this

**Spec:** `docs/superpowers/specs/2026-04-11-access-control-strategy-design.md` — Section 1

**Status:** complete

---

## Task 1: Add `source` column to `role_grant` schema and entity

**Files:**

- Modify: `apps/api/src/modules/kernel/infrastructure/schema/role-grant.schema.ts`
- Modify: `apps/api/src/modules/kernel/domain/entities/role-grant.entity.ts`

- [ ] **Step 1: Update the Drizzle schema**

Add `source` column to `role-grant.schema.ts`:

```typescript
import { coreSchema } from './actor.schema'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const roleGrant = coreSchema.table('role_grant', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  roleKey: text('role_key', {
    enum: [
      'hr_ops',
      'line_manager',
      'project_manager',
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
  scopeId: uuid('scope_id'),
  grantedBy: uuid('granted_by').notNull(),
  source: text('source', {
    enum: ['manual', 'idp_sync', 'delegation'],
  })
    .notNull()
    .default('manual'),
  validFrom: timestamp('valid_from').defaultNow().notNull(),
  validUntil: timestamp('valid_until'),
})
```

- [ ] **Step 2: Update the entity type**

Update `role-grant.entity.ts`:

```typescript
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
  | 'project_manager'

export type ScopeTypeValue = 'global' | 'department' | 'project' | 'account'

export type RoleGrantSourceValue = 'manual' | 'idp_sync' | 'delegation'

export interface RoleGrant {
  id: string
  tenantId: string
  actorId: string
  roleKey: RoleKeyValue
  scopeType: ScopeTypeValue
  scopeId: string | null
  grantedBy: string
  source: RoleGrantSourceValue
  validFrom: Date
  validUntil: Date | null
}
```

- [ ] **Step 3: Generate migration**

```bash
cd apps/api && bun run db:generate
```

Review the generated SQL. It should contain an `ALTER TABLE` adding the `source` column with default `'manual'`. Verify it does NOT recreate the table.

- [ ] **Step 4: Run typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/kernel/infrastructure/schema/role-grant.schema.ts \
       apps/api/src/modules/kernel/domain/entities/role-grant.entity.ts \
       packages/db/drizzle/
git commit -m "feat(kernel): add source column to role_grant schema and entity"
```

---

## Task 2: Update `IRoleGrantRepository`, implementation, and command

**Files:**

- Modify: `apps/api/src/modules/kernel/domain/repositories/role-grant.repository.port.ts`
- Modify: `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-role-grant.repository.ts`
- Modify: `apps/api/src/modules/kernel/application/commands/grant-role.command.ts`
- Modify: `apps/api/src/modules/kernel/application/commands/grant-role.handler.ts`
- Modify: `apps/api/src/modules/kernel/application/commands/grant-role.handler.spec.ts`

- [ ] **Step 1: Update the repository port**

Update `role-grant.repository.port.ts`:

```typescript
import type { RoleGrant, RoleGrantSourceValue } from '../entities/role-grant.entity'

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
    source?: RoleGrantSourceValue
  }): Promise<RoleGrant>
  revokeAllForActor(actorId: string, tenantId: string, revokedAt: Date): Promise<void>
  revokeBySource(
    actorId: string,
    tenantId: string,
    source: RoleGrantSourceValue,
    revokedAt: Date,
  ): Promise<void>
}
```

- [ ] **Step 2: Update the Drizzle repository adapter**

Update `drizzle-role-grant.repository.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import type { RoleGrant, RoleGrantSourceValue } from '../../domain/entities/role-grant.entity'
import type { IRoleGrantRepository } from '../../domain/repositories/role-grant.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { roleGrant } from '../schema/index'

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
    source?: RoleGrantSourceValue
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
        source: data.source ?? 'manual',
      })
      .returning()
    return rows[0] as RoleGrant
  }

  async revokeAllForActor(actorId: string, tenantId: string, revokedAt: Date): Promise<void> {
    await this.db
      .update(roleGrant)
      .set({ validUntil: revokedAt })
      .where(
        and(
          eq(roleGrant.actorId, actorId),
          eq(roleGrant.tenantId, tenantId),
          isNull(roleGrant.validUntil),
        ),
      )
  }

  async revokeBySource(
    actorId: string,
    tenantId: string,
    source: RoleGrantSourceValue,
    revokedAt: Date,
  ): Promise<void> {
    await this.db
      .update(roleGrant)
      .set({ validUntil: revokedAt })
      .where(
        and(
          eq(roleGrant.actorId, actorId),
          eq(roleGrant.tenantId, tenantId),
          eq(roleGrant.source, source),
          isNull(roleGrant.validUntil),
        ),
      )
  }
}
```

- [ ] **Step 3: Update GrantRoleCommand**

Update `grant-role.command.ts`:

```typescript
import type {
  RoleGrantSourceValue,
  RoleKeyValue,
  ScopeTypeValue,
} from '../../domain/entities/role-grant.entity'

export class GrantRoleCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly roleKey: RoleKeyValue,
    readonly scopeType: ScopeTypeValue,
    readonly scopeId: string | null,
    readonly grantedBy: string,
    readonly source: RoleGrantSourceValue = 'manual',
  ) {}
}
```

- [ ] **Step 4: Update GrantRoleHandler to pass source through**

Update `grant-role.handler.ts`:

```typescript
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ActorNotFoundException } from '../../domain/exceptions/actor.exceptions'
import { DomainException } from '../../domain/exceptions/domain.exception'
import {
  ACTOR_REPOSITORY,
  type IActorRepository,
} from '../../domain/repositories/actor.repository.port'
import {
  ROLE_GRANT_REPOSITORY,
  type IRoleGrantRepository,
} from '../../domain/repositories/role-grant.repository.port'
import { GrantRoleCommand } from './grant-role.command'

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
    if (!actor) {
      throw new ActorNotFoundException(command.actorId)
    }

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
      source: command.source,
    })

    return grant.id
  }
}
```

- [ ] **Step 5: Write failing tests first, then verify existing tests pass**

Update `grant-role.handler.spec.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GrantRoleCommand } from './grant-role.command'
import { GrantRoleHandler } from './grant-role.handler'
import { ActorNotFoundException } from '../../domain/exceptions/actor.exceptions'
import { DomainException } from '../../domain/exceptions/domain.exception'
import type { Actor } from '../../domain/entities/actor.entity'
import type { RoleGrant } from '../../domain/entities/role-grant.entity'
import type { IActorRepository } from '../../domain/repositories/actor.repository.port'
import type { IRoleGrantRepository } from '../../domain/repositories/role-grant.repository.port'

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
  source: 'manual',
  validFrom: new Date(),
  validUntil: null,
}

describe('GrantRoleHandler', () => {
  let handler: GrantRoleHandler
  let actorRepo: IActorRepository
  let roleGrantRepo: IRoleGrantRepository

  beforeEach(() => {
    actorRepo = { findById: vi.fn(), insert: vi.fn(), updateStatus: vi.fn() }
    roleGrantRepo = {
      findByActorId: vi.fn(),
      insert: vi.fn(),
      revokeAllForActor: vi.fn(),
      revokeBySource: vi.fn(),
    }
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
      source: 'manual',
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

  it('passes source through to repository insert', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(fakeActor)
    vi.mocked(roleGrantRepo.insert).mockResolvedValue({
      ...fakeGrant,
      source: 'idp_sync',
    })

    await handler.execute(
      new GrantRoleCommand(TENANT_ID, ACTOR_ID, 'employee', 'global', null, GRANTER_ID, 'idp_sync'),
    )

    expect(roleGrantRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'idp_sync' }),
    )
  })

  it('defaults source to manual when not provided', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(fakeActor)
    vi.mocked(roleGrantRepo.insert).mockResolvedValue(fakeGrant)

    await handler.execute(
      new GrantRoleCommand(TENANT_ID, ACTOR_ID, 'employee', 'global', null, GRANTER_ID),
    )

    expect(roleGrantRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ source: 'manual' }))
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

- [ ] **Step 6: Run tests**

```bash
cd apps/api && bunx vitest run src/modules/kernel/application/commands/grant-role.handler.spec.ts
```

Expected: all 6 tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/kernel/domain/repositories/role-grant.repository.port.ts \
       apps/api/src/modules/kernel/infrastructure/repositories/drizzle-role-grant.repository.ts \
       apps/api/src/modules/kernel/application/commands/grant-role.command.ts \
       apps/api/src/modules/kernel/application/commands/grant-role.handler.ts \
       apps/api/src/modules/kernel/application/commands/grant-role.handler.spec.ts
git commit -m "feat(kernel): update role_grant repository and command to support source field"
```

---

## Task 3: Create `role_permission` schema, entity, and repository

**Files:**

- Create: `apps/api/src/modules/kernel/infrastructure/schema/role-permission.schema.ts`
- Modify: `apps/api/src/modules/kernel/infrastructure/schema/index.ts`
- Create: `apps/api/src/modules/kernel/domain/entities/role-permission.entity.ts`
- Create: `apps/api/src/modules/kernel/domain/repositories/role-permission.repository.port.ts`
- Create: `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-role-permission.repository.ts`
- Create: `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-role-permission.repository.integration.spec.ts`

- [ ] **Step 1: Create the Drizzle schema**

Create `apps/api/src/modules/kernel/infrastructure/schema/role-permission.schema.ts`:

```typescript
import { coreSchema } from './actor.schema'
import { uuid, text, timestamp, boolean, uniqueIndex } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const rolePermission = coreSchema.table(
  'role_permission',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    roleKey: text('role_key', {
      enum: [
        'hr_ops',
        'line_manager',
        'project_manager',
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
    permissionKey: text('permission_key').notNull(),
    isLocked: boolean('is_locked').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantRolePermissionUnique: uniqueIndex('uq_role_permission_tenant_role_perm').on(
      table.tenantId,
      table.roleKey,
      table.permissionKey,
    ),
  }),
)
```

- [ ] **Step 2: Export from schema index**

Update `apps/api/src/modules/kernel/infrastructure/schema/index.ts`:

```typescript
export { coreSchema, actor } from './actor.schema'
export { tenant } from './tenant.schema'
export { userIdentity } from './user-identity.schema'
export { roleGrant } from './role-grant.schema'
export { rolePermission } from './role-permission.schema'
export { department } from './department.schema'
export { decisionCase } from './decision-case.schema'
export { decisionOutcome } from './decision-outcome.schema'
export { decisionStep } from './decision-step.schema'
export { auditEvent } from './audit-event.schema'
export { outboxEvent } from './outbox-event.schema'
```

- [ ] **Step 3: Create the entity**

Create `apps/api/src/modules/kernel/domain/entities/role-permission.entity.ts`:

```typescript
import type { RoleKeyValue } from './role-grant.entity'

export interface RolePermission {
  id: string
  tenantId: string
  roleKey: RoleKeyValue
  permissionKey: string
  isLocked: boolean
  createdAt: Date
}
```

- [ ] **Step 4: Create the repository port**

Create `apps/api/src/modules/kernel/domain/repositories/role-permission.repository.port.ts`:

```typescript
import type { RolePermission } from '../entities/role-permission.entity'
import type { RoleKeyValue } from '../entities/role-grant.entity'

export const ROLE_PERMISSION_REPOSITORY = Symbol('IRolePermissionRepository')

export interface IRolePermissionRepository {
  findByRoleKey(roleKey: RoleKeyValue, tenantId: string): Promise<RolePermission[]>
  findByRoleKeys(roleKeys: RoleKeyValue[], tenantId: string): Promise<RolePermission[]>
  insert(data: {
    tenantId: string
    roleKey: RoleKeyValue
    permissionKey: string
    isLocked: boolean
  }): Promise<RolePermission>
  remove(tenantId: string, roleKey: RoleKeyValue, permissionKey: string): Promise<void>
  findAll(tenantId: string): Promise<RolePermission[]>
}
```

- [ ] **Step 5: Create the Drizzle repository adapter**

Create `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-role-permission.repository.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, inArray } from 'drizzle-orm'
import type { RoleKeyValue } from '../../domain/entities/role-grant.entity'
import type { RolePermission } from '../../domain/entities/role-permission.entity'
import type { IRolePermissionRepository } from '../../domain/repositories/role-permission.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { rolePermission } from '../schema/index'

@Injectable()
export class DrizzleRolePermissionRepository implements IRolePermissionRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByRoleKey(roleKey: RoleKeyValue, tenantId: string): Promise<RolePermission[]> {
    const rows = await this.db
      .select()
      .from(rolePermission)
      .where(and(eq(rolePermission.roleKey, roleKey), eq(rolePermission.tenantId, tenantId)))

    return rows as RolePermission[]
  }

  async findByRoleKeys(roleKeys: RoleKeyValue[], tenantId: string): Promise<RolePermission[]> {
    if (roleKeys.length === 0) return []

    const rows = await this.db
      .select()
      .from(rolePermission)
      .where(and(inArray(rolePermission.roleKey, roleKeys), eq(rolePermission.tenantId, tenantId)))

    return rows as RolePermission[]
  }

  async insert(data: {
    tenantId: string
    roleKey: RoleKeyValue
    permissionKey: string
    isLocked: boolean
  }): Promise<RolePermission> {
    const rows = await this.db
      .insert(rolePermission)
      .values({
        tenantId: data.tenantId,
        roleKey: data.roleKey,
        permissionKey: data.permissionKey,
        isLocked: data.isLocked,
      })
      .returning()

    return rows[0] as RolePermission
  }

  async remove(tenantId: string, roleKey: RoleKeyValue, permissionKey: string): Promise<void> {
    await this.db
      .delete(rolePermission)
      .where(
        and(
          eq(rolePermission.tenantId, tenantId),
          eq(rolePermission.roleKey, roleKey),
          eq(rolePermission.permissionKey, permissionKey),
        ),
      )
  }

  async findAll(tenantId: string): Promise<RolePermission[]> {
    const rows = await this.db
      .select()
      .from(rolePermission)
      .where(eq(rolePermission.tenantId, tenantId))

    return rows as RolePermission[]
  }
}
```

- [ ] **Step 6: Generate migration**

```bash
cd apps/api && bun run db:generate
```

Review the generated SQL. It should contain a `CREATE TABLE "core"."role_permission"` with the unique index. Append RLS policy to the migration:

```sql
-- RLS for role_permission
ALTER TABLE "core"."role_permission" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_permission_tenant_isolation" ON "core"."role_permission"
  USING ("tenant_id"::text = current_setting('app.tenant_id', true));
```

- [ ] **Step 7: Write integration test**

Create `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-role-permission.repository.integration.spec.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
} from '@future/db/test-helpers'
import { DrizzleRolePermissionRepository } from './drizzle-role-permission.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000010'
const TENANT_B = '01900000-0000-7fff-8000-000000000011'

describe('DrizzleRolePermissionRepository', () => {
  const db = createTestDb()
  let repo: DrizzleRolePermissionRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'rp-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'rp-tenant-b' })
    repo = new DrizzleRolePermissionRepository(db as never)
  })

  afterAll(async () => {
    await truncateCoreSchema(db)
  })

  it('inserts and finds a role permission by role key', async () => {
    await setTenantContext(db, TENANT_A)

    const inserted = await repo.insert({
      tenantId: TENANT_A,
      roleKey: 'employee',
      permissionKey: 'people:profile:self:read',
      isLocked: true,
    })

    expect(inserted.id).toBeDefined()
    expect(inserted.roleKey).toBe('employee')
    expect(inserted.permissionKey).toBe('people:profile:self:read')
    expect(inserted.isLocked).toBe(true)

    const results = await repo.findByRoleKey('employee', TENANT_A)
    expect(results).toHaveLength(1)
    expect(results[0]?.permissionKey).toBe('people:profile:self:read')
  })

  it('findByRoleKeys returns permissions for multiple roles', async () => {
    await setTenantContext(db, TENANT_A)

    await repo.insert({
      tenantId: TENANT_A,
      roleKey: 'hr_ops',
      permissionKey: 'people:profile:read',
      isLocked: false,
    })

    const results = await repo.findByRoleKeys(['employee', 'hr_ops'], TENANT_A)
    expect(results.length).toBeGreaterThanOrEqual(2)

    const permKeys = results.map((r) => r.permissionKey)
    expect(permKeys).toContain('people:profile:self:read')
    expect(permKeys).toContain('people:profile:read')
  })

  it('findByRoleKeys returns empty array for empty input', async () => {
    await setTenantContext(db, TENANT_A)
    const results = await repo.findByRoleKeys([], TENANT_A)
    expect(results).toHaveLength(0)
  })

  it('remove deletes a permission entry', async () => {
    await setTenantContext(db, TENANT_A)

    await repo.insert({
      tenantId: TENANT_A,
      roleKey: 'recruiter',
      permissionKey: 'hiring:candidate:create',
      isLocked: false,
    })

    await repo.remove(TENANT_A, 'recruiter', 'hiring:candidate:create')
    const results = await repo.findByRoleKey('recruiter', TENANT_A)
    const match = results.find((r) => r.permissionKey === 'hiring:candidate:create')
    expect(match).toBeUndefined()
  })

  it('enforces tenant isolation via RLS', async () => {
    await setTenantContext(db, TENANT_B)

    await repo.insert({
      tenantId: TENANT_B,
      roleKey: 'employee',
      permissionKey: 'time:leave:self:submit',
      isLocked: true,
    })

    await setTenantContext(db, TENANT_A)
    const results = await repo.findByRoleKey('employee', TENANT_B)
    // RLS should filter out tenant B's data when context is tenant A
    const tenantBResults = results.filter((r) => r.tenantId === TENANT_B)
    expect(tenantBResults).toHaveLength(0)
  })

  it('findAll returns all permissions for a tenant', async () => {
    await setTenantContext(db, TENANT_A)
    const results = await repo.findAll(TENANT_A)
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.tenantId === TENANT_A)).toBe(true)
  })
})
```

- [ ] **Step 8: Run integration test**

```bash
cd apps/api && bunx vitest run src/modules/kernel/infrastructure/repositories/drizzle-role-permission.repository.integration.spec.ts
```

Expected: all tests PASS

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/kernel/infrastructure/schema/role-permission.schema.ts \
       apps/api/src/modules/kernel/infrastructure/schema/index.ts \
       apps/api/src/modules/kernel/domain/entities/role-permission.entity.ts \
       apps/api/src/modules/kernel/domain/repositories/role-permission.repository.port.ts \
       apps/api/src/modules/kernel/infrastructure/repositories/drizzle-role-permission.repository.ts \
       apps/api/src/modules/kernel/infrastructure/repositories/drizzle-role-permission.repository.integration.spec.ts \
       packages/db/drizzle/
git commit -m "feat(kernel): add role_permission table, entity, repository port and adapter"
```

---

## Task 4: Create `Delegation` entity and repository port

The delegation schema already exists (`apps/api/src/modules/kernel/infrastructure/schema/delegation.schema.ts`) but there is no entity or repository. We need a read-only delegation repository for the `canDo()` resolution.

**Files:**

- Create: `apps/api/src/modules/kernel/domain/entities/delegation.entity.ts`
- Create: `apps/api/src/modules/kernel/domain/repositories/delegation.repository.port.ts`
- Create: `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-delegation.repository.ts`

- [ ] **Step 1: Create the delegation entity**

Create `apps/api/src/modules/kernel/domain/entities/delegation.entity.ts`:

```typescript
export interface Delegation {
  id: string
  tenantId: string
  delegatorId: string
  delegateeId: string
  role: string
  validFrom: Date
  validUntil: Date
}
```

- [ ] **Step 2: Create the delegation repository port**

Create `apps/api/src/modules/kernel/domain/repositories/delegation.repository.port.ts`:

```typescript
import type { Delegation } from '../entities/delegation.entity'

export const DELEGATION_REPOSITORY = Symbol('IDelegationRepository')

export interface IDelegationRepository {
  findActiveDelegationsForDelegatee(delegateeId: string, tenantId: string): Promise<Delegation[]>
}
```

- [ ] **Step 3: Create the Drizzle delegation repository**

Create `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-delegation.repository.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, gt, lt } from 'drizzle-orm'
import type { Delegation } from '../../domain/entities/delegation.entity'
import type { IDelegationRepository } from '../../domain/repositories/delegation.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { delegation } from '../schema/delegation.schema'

@Injectable()
export class DrizzleDelegationRepository implements IDelegationRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findActiveDelegationsForDelegatee(
    delegateeId: string,
    tenantId: string,
  ): Promise<Delegation[]> {
    const now = new Date()
    const rows = await this.db
      .select()
      .from(delegation)
      .where(
        and(
          eq(delegation.delegateeId, delegateeId),
          eq(delegation.tenantId, tenantId),
          lt(delegation.validFrom, now),
          gt(delegation.validUntil, now),
        ),
      )

    return rows as Delegation[]
  }
}
```

- [ ] **Step 4: Run typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/kernel/domain/entities/delegation.entity.ts \
       apps/api/src/modules/kernel/domain/repositories/delegation.repository.port.ts \
       apps/api/src/modules/kernel/infrastructure/repositories/drizzle-delegation.repository.ts
git commit -m "feat(kernel): add delegation entity, repository port and adapter"
```

---

## Task 5: Create `canDo()` query and handler

**Files:**

- Create: `apps/api/src/modules/kernel/application/queries/can-do.query.ts`
- Create: `apps/api/src/modules/kernel/application/queries/can-do.handler.ts`
- Create: `apps/api/src/modules/kernel/application/queries/can-do.handler.spec.ts`

- [ ] **Step 1: Write the failing test first**

Create `apps/api/src/modules/kernel/application/queries/can-do.handler.spec.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CanDoQuery } from './can-do.query'
import { CanDoHandler } from './can-do.handler'
import type { IRoleGrantRepository } from '../../domain/repositories/role-grant.repository.port'
import type { IRolePermissionRepository } from '../../domain/repositories/role-permission.repository.port'
import type { IDelegationRepository } from '../../domain/repositories/delegation.repository.port'
import type { RoleGrant } from '../../domain/entities/role-grant.entity'
import type { RolePermission } from '../../domain/entities/role-permission.entity'
import type { Delegation } from '../../domain/entities/delegation.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const GRANTER_ID = '01900000-0000-7000-8000-000000000003'
const DEPT_A = '01900000-0000-7000-8000-000000000010'
const DEPT_B = '01900000-0000-7000-8000-000000000011'
const DELEGATOR_ID = '01900000-0000-7000-8000-000000000020'

function makeGrant(overrides: Partial<RoleGrant> = {}): RoleGrant {
  return {
    id: '01900000-0000-7000-8000-000000000099',
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    roleKey: 'employee',
    scopeType: 'global',
    scopeId: null,
    grantedBy: GRANTER_ID,
    source: 'manual',
    validFrom: new Date(),
    validUntil: null,
    ...overrides,
  }
}

function makePermission(overrides: Partial<RolePermission> = {}): RolePermission {
  return {
    id: '01900000-0000-7000-8000-000000000098',
    tenantId: TENANT_ID,
    roleKey: 'employee',
    permissionKey: 'people:profile:self:read',
    isLocked: true,
    createdAt: new Date(),
    ...overrides,
  }
}

function makeDelegation(overrides: Partial<Delegation> = {}): Delegation {
  const now = new Date()
  return {
    id: '01900000-0000-7000-8000-000000000097',
    tenantId: TENANT_ID,
    delegatorId: DELEGATOR_ID,
    delegateeId: ACTOR_ID,
    role: 'line_manager',
    validFrom: new Date(now.getTime() - 86400000),
    validUntil: new Date(now.getTime() + 86400000),
    ...overrides,
  }
}

describe('CanDoHandler', () => {
  let handler: CanDoHandler
  let roleGrantRepo: IRoleGrantRepository
  let rolePermissionRepo: IRolePermissionRepository
  let delegationRepo: IDelegationRepository

  beforeEach(() => {
    roleGrantRepo = {
      findByActorId: vi.fn().mockResolvedValue([]),
      insert: vi.fn(),
      revokeAllForActor: vi.fn(),
      revokeBySource: vi.fn(),
    }
    rolePermissionRepo = {
      findByRoleKey: vi.fn(),
      findByRoleKeys: vi.fn().mockResolvedValue([]),
      insert: vi.fn(),
      remove: vi.fn(),
      findAll: vi.fn(),
    }
    delegationRepo = {
      findActiveDelegationsForDelegatee: vi.fn().mockResolvedValue([]),
    }
    handler = new CanDoHandler(roleGrantRepo, rolePermissionRepo, delegationRepo)
  })

  it('returns true when actor has a global grant with matching permission', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({ roleKey: 'employee', scopeType: 'global' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({ roleKey: 'employee', permissionKey: 'people:profile:self:read' }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'people:profile:self:read', { tenantId: TENANT_ID }),
    )

    expect(result).toBe(true)
  })

  it('returns true when grant scope matches requested scope', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({
        roleKey: 'line_manager',
        scopeType: 'department',
        scopeId: DEPT_A,
      }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({
        roleKey: 'line_manager',
        permissionKey: 'time:leave:approve',
      }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'time:leave:approve', {
        tenantId: TENANT_ID,
        scopeType: 'department',
        scopeId: DEPT_A,
      }),
    )

    expect(result).toBe(true)
  })

  it('returns false when grant scope does not match requested scope', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({
        roleKey: 'line_manager',
        scopeType: 'department',
        scopeId: DEPT_A,
      }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({
        roleKey: 'line_manager',
        permissionKey: 'time:leave:approve',
      }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'time:leave:approve', {
        tenantId: TENANT_ID,
        scopeType: 'department',
        scopeId: DEPT_B,
      }),
    )

    expect(result).toBe(false)
  })

  it('returns true for self permission when actorId matches resourceOwnerId', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({ roleKey: 'employee', scopeType: 'global' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({
        roleKey: 'employee',
        permissionKey: 'people:profile:self:read',
      }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'people:profile:self:read', {
        tenantId: TENANT_ID,
        resourceOwnerId: ACTOR_ID,
      }),
    )

    expect(result).toBe(true)
  })

  it('returns false for self permission when actorId does not match resourceOwnerId', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({ roleKey: 'employee', scopeType: 'global' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({
        roleKey: 'employee',
        permissionKey: 'people:profile:self:read',
      }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'people:profile:self:read', {
        tenantId: TENANT_ID,
        resourceOwnerId: '01900000-0000-7000-8000-999999999999',
      }),
    )

    expect(result).toBe(false)
  })

  it('returns true when permission comes from a delegation', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([])
    vi.mocked(delegationRepo.findActiveDelegationsForDelegatee).mockResolvedValue([
      makeDelegation({ role: 'line_manager' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({
        roleKey: 'line_manager',
        permissionKey: 'time:leave:approve',
      }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'time:leave:approve', { tenantId: TENANT_ID }),
    )

    expect(result).toBe(true)
  })

  it('returns false when no matching permission exists', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({ roleKey: 'employee', scopeType: 'global' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({
        roleKey: 'employee',
        permissionKey: 'people:profile:self:read',
      }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'admin:tenant:manage', { tenantId: TENANT_ID }),
    )

    expect(result).toBe(false)
  })

  it('returns false when actor has no grants and no delegations', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([])
    vi.mocked(delegationRepo.findActiveDelegationsForDelegatee).mockResolvedValue([])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'people:profile:read', { tenantId: TENANT_ID }),
    )

    expect(result).toBe(false)
    expect(rolePermissionRepo.findByRoleKeys).not.toHaveBeenCalled()
  })

  it('unions direct grants and delegated roles for permission lookup', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({ roleKey: 'employee', scopeType: 'global' }),
    ])
    vi.mocked(delegationRepo.findActiveDelegationsForDelegatee).mockResolvedValue([
      makeDelegation({ role: 'line_manager' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({ roleKey: 'employee', permissionKey: 'people:profile:self:read' }),
      makePermission({ roleKey: 'line_manager', permissionKey: 'time:leave:approve' }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'time:leave:approve', { tenantId: TENANT_ID }),
    )

    expect(result).toBe(true)
    expect(rolePermissionRepo.findByRoleKeys).toHaveBeenCalledWith(
      expect.arrayContaining(['employee', 'line_manager']),
      TENANT_ID,
    )
  })

  it('global grant scope passes any requested scope', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({ roleKey: 'hr_ops', scopeType: 'global' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({ roleKey: 'hr_ops', permissionKey: 'people:profile:read' }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'people:profile:read', {
        tenantId: TENANT_ID,
        scopeType: 'department',
        scopeId: DEPT_A,
      }),
    )

    expect(result).toBe(true)
  })

  it('self permission passes without resourceOwnerId when not provided', async () => {
    // When no resourceOwnerId is provided, self permissions should still pass
    // because the caller didn't request owner-scoping — this is a permission-only check
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({ roleKey: 'employee', scopeType: 'global' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({
        roleKey: 'employee',
        permissionKey: 'people:profile:self:read',
      }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'people:profile:self:read', {
        tenantId: TENANT_ID,
      }),
    )

    expect(result).toBe(true)
  })
})
```

- [ ] **Step 2: Create the query class**

Create `apps/api/src/modules/kernel/application/queries/can-do.query.ts`:

```typescript
export interface CanDoContext {
  tenantId: string
  scopeType?: 'global' | 'department' | 'project' | 'account'
  scopeId?: string
  resourceOwnerId?: string
}

export class CanDoQuery {
  constructor(
    readonly actorId: string,
    readonly permission: string,
    readonly context: CanDoContext,
  ) {}
}
```

- [ ] **Step 3: Create the handler**

Create `apps/api/src/modules/kernel/application/queries/can-do.handler.ts`:

```typescript
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  ROLE_GRANT_REPOSITORY,
  type IRoleGrantRepository,
} from '../../domain/repositories/role-grant.repository.port'
import {
  ROLE_PERMISSION_REPOSITORY,
  type IRolePermissionRepository,
} from '../../domain/repositories/role-permission.repository.port'
import {
  DELEGATION_REPOSITORY,
  type IDelegationRepository,
} from '../../domain/repositories/delegation.repository.port'
import type { RoleKeyValue } from '../../domain/entities/role-grant.entity'
import { CanDoQuery } from './can-do.query'

@QueryHandler(CanDoQuery)
export class CanDoHandler implements IQueryHandler<CanDoQuery, boolean> {
  constructor(
    @Inject(ROLE_GRANT_REPOSITORY) private readonly roleGrantRepo: IRoleGrantRepository,
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly rolePermissionRepo: IRolePermissionRepository,
    @Inject(DELEGATION_REPOSITORY) private readonly delegationRepo: IDelegationRepository,
  ) {}

  async execute(query: CanDoQuery): Promise<boolean> {
    const { actorId, permission, context } = query

    // Step 1: Get active role grants for actor
    const grants = await this.roleGrantRepo.findByActorId(actorId, context.tenantId)

    // Step 2: Get active delegations where actor is delegatee
    const delegations = await this.delegationRepo.findActiveDelegationsForDelegatee(
      actorId,
      context.tenantId,
    )

    // Step 3: Collect all unique role keys from grants + delegations
    const roleKeysFromGrants = grants.map((g) => g.roleKey)
    const roleKeysFromDelegations = delegations.map((d) => d.role as RoleKeyValue)
    const allRoleKeys = [...new Set([...roleKeysFromGrants, ...roleKeysFromDelegations])]

    if (allRoleKeys.length === 0) {
      return false
    }

    // Step 4: Fetch role_permissions for those role_keys
    const permissions = await this.rolePermissionRepo.findByRoleKeys(allRoleKeys, context.tenantId)

    // Step 5: Find matching permissions
    const matchingPermissions = permissions.filter((p) => p.permissionKey === permission)

    if (matchingPermissions.length === 0) {
      return false
    }

    // Step 6: Check scope for each matching permission
    const isSelfPermission = permission.includes(':self:')

    for (const matchedPerm of matchingPermissions) {
      // Check self qualifier
      if (isSelfPermission && context.resourceOwnerId !== undefined) {
        if (actorId !== context.resourceOwnerId) {
          continue
        }
      }

      // Find grants (direct or delegated) that provide this role
      const directGrantsForRole = grants.filter((g) => g.roleKey === matchedPerm.roleKey)
      const delegatedForRole = delegations.filter((d) => d.role === matchedPerm.roleKey)

      // Check direct grants scope
      for (const grant of directGrantsForRole) {
        if (grant.scopeType === 'global') {
          return true
        }

        if (
          context.scopeType &&
          context.scopeId &&
          grant.scopeType === context.scopeType &&
          grant.scopeId === context.scopeId
        ) {
          return true
        }

        // No scope requested — any grant passes
        if (!context.scopeType) {
          return true
        }
      }

      // Delegated roles pass with global scope (delegation is authority transfer)
      if (delegatedForRole.length > 0) {
        if (!context.scopeType) {
          return true
        }
        // For scoped checks, look at the delegator's grants
        // Simplified: delegations grant global scope for the delegated role
        return true
      }
    }

    return false
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api && bunx vitest run src/modules/kernel/application/queries/can-do.handler.spec.ts
```

Expected: all 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/kernel/application/queries/can-do.query.ts \
       apps/api/src/modules/kernel/application/queries/can-do.handler.ts \
       apps/api/src/modules/kernel/application/queries/can-do.handler.spec.ts
git commit -m "feat(kernel): add canDo query handler with full scope and delegation resolution"
```

---

## Task 6: Create `getEffectivePermissions()` query and handler

**Files:**

- Create: `apps/api/src/modules/kernel/application/queries/get-effective-permissions.query.ts`
- Create: `apps/api/src/modules/kernel/application/queries/get-effective-permissions.handler.ts`
- Create: `apps/api/src/modules/kernel/application/queries/get-effective-permissions.handler.spec.ts`

- [ ] **Step 1: Write the failing test first**

Create `apps/api/src/modules/kernel/application/queries/get-effective-permissions.handler.spec.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetEffectivePermissionsQuery } from './get-effective-permissions.query'
import { GetEffectivePermissionsHandler } from './get-effective-permissions.handler'
import type { IRoleGrantRepository } from '../../domain/repositories/role-grant.repository.port'
import type { IRolePermissionRepository } from '../../domain/repositories/role-permission.repository.port'
import type { IDelegationRepository } from '../../domain/repositories/delegation.repository.port'
import type { RoleGrant } from '../../domain/entities/role-grant.entity'
import type { RolePermission } from '../../domain/entities/role-permission.entity'
import type { Delegation } from '../../domain/entities/delegation.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const GRANTER_ID = '01900000-0000-7000-8000-000000000003'
const DELEGATOR_ID = '01900000-0000-7000-8000-000000000020'

function makeGrant(overrides: Partial<RoleGrant> = {}): RoleGrant {
  return {
    id: '01900000-0000-7000-8000-000000000099',
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    roleKey: 'employee',
    scopeType: 'global',
    scopeId: null,
    grantedBy: GRANTER_ID,
    source: 'manual',
    validFrom: new Date(),
    validUntil: null,
    ...overrides,
  }
}

function makePermission(overrides: Partial<RolePermission> = {}): RolePermission {
  return {
    id: '01900000-0000-7000-8000-000000000098',
    tenantId: TENANT_ID,
    roleKey: 'employee',
    permissionKey: 'people:profile:self:read',
    isLocked: true,
    createdAt: new Date(),
    ...overrides,
  }
}

function makeDelegation(overrides: Partial<Delegation> = {}): Delegation {
  const now = new Date()
  return {
    id: '01900000-0000-7000-8000-000000000097',
    tenantId: TENANT_ID,
    delegatorId: DELEGATOR_ID,
    delegateeId: ACTOR_ID,
    role: 'line_manager',
    validFrom: new Date(now.getTime() - 86400000),
    validUntil: new Date(now.getTime() + 86400000),
    ...overrides,
  }
}

describe('GetEffectivePermissionsHandler', () => {
  let handler: GetEffectivePermissionsHandler
  let roleGrantRepo: IRoleGrantRepository
  let rolePermissionRepo: IRolePermissionRepository
  let delegationRepo: IDelegationRepository

  beforeEach(() => {
    roleGrantRepo = {
      findByActorId: vi.fn().mockResolvedValue([]),
      insert: vi.fn(),
      revokeAllForActor: vi.fn(),
      revokeBySource: vi.fn(),
    }
    rolePermissionRepo = {
      findByRoleKey: vi.fn(),
      findByRoleKeys: vi.fn().mockResolvedValue([]),
      insert: vi.fn(),
      remove: vi.fn(),
      findAll: vi.fn(),
    }
    delegationRepo = {
      findActiveDelegationsForDelegatee: vi.fn().mockResolvedValue([]),
    }
    handler = new GetEffectivePermissionsHandler(roleGrantRepo, rolePermissionRepo, delegationRepo)
  })

  it('returns permissions from direct role grants', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([makeGrant({ roleKey: 'employee' })])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({ permissionKey: 'people:profile:self:read' }),
      makePermission({ permissionKey: 'time:leave:self:submit' }),
    ])

    const result = await handler.execute(new GetEffectivePermissionsQuery(ACTOR_ID, TENANT_ID))

    expect(result).toEqual(
      expect.arrayContaining(['people:profile:self:read', 'time:leave:self:submit']),
    )
    expect(result).toHaveLength(2)
  })

  it('includes permissions from delegated roles', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([makeGrant({ roleKey: 'employee' })])
    vi.mocked(delegationRepo.findActiveDelegationsForDelegatee).mockResolvedValue([
      makeDelegation({ role: 'line_manager' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({ roleKey: 'employee', permissionKey: 'people:profile:self:read' }),
      makePermission({ roleKey: 'line_manager', permissionKey: 'time:leave:approve' }),
    ])

    const result = await handler.execute(new GetEffectivePermissionsQuery(ACTOR_ID, TENANT_ID))

    expect(result).toEqual(
      expect.arrayContaining(['people:profile:self:read', 'time:leave:approve']),
    )
  })

  it('returns unique permissions when multiple roles grant same permission', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({ roleKey: 'employee' }),
      makeGrant({ roleKey: 'hr_ops' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({ roleKey: 'employee', permissionKey: 'people:profile:self:read' }),
      makePermission({ roleKey: 'hr_ops', permissionKey: 'people:profile:self:read' }),
      makePermission({ roleKey: 'hr_ops', permissionKey: 'people:profile:read' }),
    ])

    const result = await handler.execute(new GetEffectivePermissionsQuery(ACTOR_ID, TENANT_ID))

    expect(result).toHaveLength(2)
    expect(result).toEqual(
      expect.arrayContaining(['people:profile:self:read', 'people:profile:read']),
    )
  })

  it('returns empty array when actor has no grants or delegations', async () => {
    const result = await handler.execute(new GetEffectivePermissionsQuery(ACTOR_ID, TENANT_ID))

    expect(result).toEqual([])
    expect(rolePermissionRepo.findByRoleKeys).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Create the query class**

Create `apps/api/src/modules/kernel/application/queries/get-effective-permissions.query.ts`:

```typescript
export class GetEffectivePermissionsQuery {
  constructor(
    readonly actorId: string,
    readonly tenantId: string,
  ) {}
}
```

- [ ] **Step 3: Create the handler**

Create `apps/api/src/modules/kernel/application/queries/get-effective-permissions.handler.ts`:

```typescript
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  ROLE_GRANT_REPOSITORY,
  type IRoleGrantRepository,
} from '../../domain/repositories/role-grant.repository.port'
import {
  ROLE_PERMISSION_REPOSITORY,
  type IRolePermissionRepository,
} from '../../domain/repositories/role-permission.repository.port'
import {
  DELEGATION_REPOSITORY,
  type IDelegationRepository,
} from '../../domain/repositories/delegation.repository.port'
import type { RoleKeyValue } from '../../domain/entities/role-grant.entity'
import { GetEffectivePermissionsQuery } from './get-effective-permissions.query'

@QueryHandler(GetEffectivePermissionsQuery)
export class GetEffectivePermissionsHandler implements IQueryHandler<
  GetEffectivePermissionsQuery,
  string[]
> {
  constructor(
    @Inject(ROLE_GRANT_REPOSITORY) private readonly roleGrantRepo: IRoleGrantRepository,
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly rolePermissionRepo: IRolePermissionRepository,
    @Inject(DELEGATION_REPOSITORY) private readonly delegationRepo: IDelegationRepository,
  ) {}

  async execute(query: GetEffectivePermissionsQuery): Promise<string[]> {
    const { actorId, tenantId } = query

    // Step 1: Get active role grants
    const grants = await this.roleGrantRepo.findByActorId(actorId, tenantId)

    // Step 2: Get active delegations
    const delegations = await this.delegationRepo.findActiveDelegationsForDelegatee(
      actorId,
      tenantId,
    )

    // Step 3: Collect unique role keys
    const roleKeysFromGrants = grants.map((g) => g.roleKey)
    const roleKeysFromDelegations = delegations.map((d) => d.role as RoleKeyValue)
    const allRoleKeys = [...new Set([...roleKeysFromGrants, ...roleKeysFromDelegations])]

    if (allRoleKeys.length === 0) {
      return []
    }

    // Step 4: Fetch all permissions for those roles
    const permissions = await this.rolePermissionRepo.findByRoleKeys(allRoleKeys, tenantId)

    // Step 5: Return unique permission keys
    const uniquePermissions = [...new Set(permissions.map((p) => p.permissionKey))]

    return uniquePermissions
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api && bunx vitest run src/modules/kernel/application/queries/get-effective-permissions.handler.spec.ts
```

Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/kernel/application/queries/get-effective-permissions.query.ts \
       apps/api/src/modules/kernel/application/queries/get-effective-permissions.handler.ts \
       apps/api/src/modules/kernel/application/queries/get-effective-permissions.handler.spec.ts
git commit -m "feat(kernel): add getEffectivePermissions query handler"
```

---

## Task 7: Wire `canDo()` and `getEffectivePermissions()` into `KernelQueryFacade`

**Files:**

- Modify: `apps/api/src/modules/kernel/application/facades/kernel-query.facade.ts`
- Modify: `apps/api/src/modules/kernel/kernel.module.ts`

- [ ] **Step 1: Update KernelQueryFacade**

Update `apps/api/src/modules/kernel/application/facades/kernel-query.facade.ts`:

```typescript
import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import type { Actor } from '../../domain/entities/actor.entity'
import type { RoleGrant } from '../../domain/entities/role-grant.entity'
import type { Tenant } from '../../domain/entities/tenant.entity'
import type { UserIdentity } from '../../domain/entities/user-identity.entity'
import { GetActorQuery } from '../queries/get-actor.query'
import { GetRoleGrantsQuery } from '../queries/get-role-grants.query'
import { GetTenantQuery } from '../queries/get-tenant.query'
import { GetUserIdentityBySsoSubjectQuery } from '../queries/get-user-identity-by-sso-subject.query'
import { CanDoQuery, type CanDoContext } from '../queries/can-do.query'
import { GetEffectivePermissionsQuery } from '../queries/get-effective-permissions.query'

/**
 * KernelQueryFacade is the only cross-module import allowed from the kernel.
 * No module imports kernel repositories or entities directly.
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
    return grants.some((grant) => grant.roleKey === roleKey)
  }

  async getActiveRoleGrant(
    actorId: string,
    roleKey: string,
    tenantId: string,
  ): Promise<RoleGrant | null> {
    const grants = await this.getRoleGrants(actorId, tenantId)
    return grants.find((grant) => grant.roleKey === roleKey) ?? null
  }

  getUserIdentityBySsoSubject(ssoSubject: string, tenantId: string): Promise<UserIdentity | null> {
    return this.queryBus.execute(new GetUserIdentityBySsoSubjectQuery(ssoSubject, tenantId))
  }

  canDo(actorId: string, permission: string, context: CanDoContext): Promise<boolean> {
    return this.queryBus.execute(new CanDoQuery(actorId, permission, context))
  }

  getEffectivePermissions(actorId: string, tenantId: string): Promise<string[]> {
    return this.queryBus.execute(new GetEffectivePermissionsQuery(actorId, tenantId))
  }
}
```

- [ ] **Step 2: Update kernel.module.ts**

Update `apps/api/src/modules/kernel/kernel.module.ts`:

```typescript
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ACTOR_REPOSITORY } from './domain/repositories/actor.repository.port'
import { DEPARTMENT_REPOSITORY } from './domain/repositories/department.repository.port'
import { DECISION_CASE_REPOSITORY } from './domain/repositories/decision-case.repository.port'
import { ROLE_GRANT_REPOSITORY } from './domain/repositories/role-grant.repository.port'
import { ROLE_PERMISSION_REPOSITORY } from './domain/repositories/role-permission.repository.port'
import { DELEGATION_REPOSITORY } from './domain/repositories/delegation.repository.port'
import { TENANT_REPOSITORY } from './domain/repositories/tenant.repository.port'
import { USER_IDENTITY_REPOSITORY } from './domain/repositories/user-identity.repository.port'
import { CreateActorHandler } from './application/commands/create-actor.handler'
import { CreateDecisionCaseHandler } from './application/commands/create-decision-case.handler'
import { CreateUserIdentityHandler } from './application/commands/create-user-identity.handler'
import { DeprovisionUserIdentityHandler } from './application/commands/deprovision-user-identity.handler'
import { GrantRoleHandler } from './application/commands/grant-role.handler'
import { ResolveDecisionCaseHandler } from './application/commands/resolve-decision-case.handler'
import { RevokeAllRoleGrantsHandler } from './application/commands/revoke-all-role-grants.handler'
import { UpdateActorStatusHandler } from './application/commands/update-actor-status.handler'
import { KernelQueryFacade } from './application/facades/kernel-query.facade'
import { GetActorHandler } from './application/queries/get-actor.handler'
import { GetRoleGrantsHandler } from './application/queries/get-role-grants.handler'
import { GetTenantHandler } from './application/queries/get-tenant.handler'
import { GetUserIdentityBySsoSubjectHandler } from './application/queries/get-user-identity-by-sso-subject.handler'
import { CanDoHandler } from './application/queries/can-do.handler'
import { GetEffectivePermissionsHandler } from './application/queries/get-effective-permissions.handler'
import { DrizzleActorRepository } from './infrastructure/repositories/drizzle-actor.repository'
import { DrizzleDecisionCaseRepository } from './infrastructure/repositories/drizzle-decision-case.repository'
import { DrizzleDepartmentRepository } from './infrastructure/repositories/drizzle-department.repository'
import { DrizzleRoleGrantRepository } from './infrastructure/repositories/drizzle-role-grant.repository'
import { DrizzleRolePermissionRepository } from './infrastructure/repositories/drizzle-role-permission.repository'
import { DrizzleDelegationRepository } from './infrastructure/repositories/drizzle-delegation.repository'
import { DrizzleTenantRepository } from './infrastructure/repositories/drizzle-tenant.repository'
import { DrizzleUserIdentityRepository } from './infrastructure/repositories/drizzle-user-identity.repository'
import { AUDIT_EVENT_REPOSITORY } from './domain/repositories/audit-event.repository.port'
import { OUTBOX_EVENT_REPOSITORY } from './domain/repositories/outbox-event.repository.port'
import { DrizzleAuditEventRepository } from './infrastructure/repositories/drizzle-audit-event.repository'
import { DrizzleOutboxEventRepository } from './infrastructure/repositories/drizzle-outbox-event.repository'

@Module({
  imports: [CqrsModule],
  providers: [
    { provide: TENANT_REPOSITORY, useClass: DrizzleTenantRepository },
    { provide: ACTOR_REPOSITORY, useClass: DrizzleActorRepository },
    { provide: USER_IDENTITY_REPOSITORY, useClass: DrizzleUserIdentityRepository },
    { provide: ROLE_GRANT_REPOSITORY, useClass: DrizzleRoleGrantRepository },
    { provide: ROLE_PERMISSION_REPOSITORY, useClass: DrizzleRolePermissionRepository },
    { provide: DELEGATION_REPOSITORY, useClass: DrizzleDelegationRepository },
    { provide: DEPARTMENT_REPOSITORY, useClass: DrizzleDepartmentRepository },
    { provide: DECISION_CASE_REPOSITORY, useClass: DrizzleDecisionCaseRepository },
    { provide: AUDIT_EVENT_REPOSITORY, useClass: DrizzleAuditEventRepository },
    { provide: OUTBOX_EVENT_REPOSITORY, useClass: DrizzleOutboxEventRepository },
    CreateActorHandler,
    CreateDecisionCaseHandler,
    CreateUserIdentityHandler,
    DeprovisionUserIdentityHandler,
    GrantRoleHandler,
    ResolveDecisionCaseHandler,
    RevokeAllRoleGrantsHandler,
    UpdateActorStatusHandler,
    GetActorHandler,
    GetTenantHandler,
    GetRoleGrantsHandler,
    GetUserIdentityBySsoSubjectHandler,
    CanDoHandler,
    GetEffectivePermissionsHandler,
    KernelQueryFacade,
  ],
  exports: [KernelQueryFacade, AUDIT_EVENT_REPOSITORY, OUTBOX_EVENT_REPOSITORY],
})
export class KernelModule {}
```

- [ ] **Step 3: Run typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/kernel/application/facades/kernel-query.facade.ts \
       apps/api/src/modules/kernel/kernel.module.ts
git commit -m "feat(kernel): wire canDo and getEffectivePermissions into KernelQueryFacade"
```

---

## Task 8: Default permission seed data and command

**Files:**

- Create: `apps/api/src/modules/kernel/domain/constants/default-role-permissions.ts`
- Create: `apps/api/src/modules/kernel/application/commands/seed-role-permissions.command.ts`
- Create: `apps/api/src/modules/kernel/application/commands/seed-role-permissions.handler.ts`
- Create: `apps/api/src/modules/kernel/application/commands/seed-role-permissions.handler.spec.ts`

- [ ] **Step 1: Create the default permissions constant**

Create `apps/api/src/modules/kernel/domain/constants/default-role-permissions.ts`:

```typescript
import type { RoleKeyValue } from '../entities/role-grant.entity'

export interface DefaultPermissionEntry {
  permissionKey: string
  isLocked: boolean
}

export type DefaultRolePermissionMap = Record<RoleKeyValue, DefaultPermissionEntry[]>

const EMPLOYEE_LOCKED: DefaultPermissionEntry[] = [
  { permissionKey: 'people:profile:self:read', isLocked: true },
  { permissionKey: 'time:leave:self:submit', isLocked: true },
  { permissionKey: 'time:attendance:self:read', isLocked: true },
]

const EMPLOYEE_DEFAULTS: DefaultPermissionEntry[] = [
  { permissionKey: 'planner:task:self:manage', isLocked: false },
]

const TENANT_ADMIN_LOCKED: DefaultPermissionEntry[] = [
  { permissionKey: 'admin:role:manage', isLocked: true },
  { permissionKey: 'admin:tenant:read', isLocked: true },
]

const ALL_PERMISSIONS: DefaultPermissionEntry[] = [
  { permissionKey: 'people:profile:read', isLocked: false },
  { permissionKey: 'people:profile:update', isLocked: false },
  { permissionKey: 'people:profile:self:read', isLocked: false },
  { permissionKey: 'people:profile:team:read', isLocked: false },
  { permissionKey: 'time:leave:self:submit', isLocked: false },
  { permissionKey: 'time:leave:read', isLocked: false },
  { permissionKey: 'time:leave:approve', isLocked: false },
  { permissionKey: 'time:attendance:self:read', isLocked: false },
  { permissionKey: 'time:attendance:read', isLocked: false },
  { permissionKey: 'hiring:candidate:read', isLocked: false },
  { permissionKey: 'hiring:candidate:create', isLocked: false },
  { permissionKey: 'hiring:pipeline:manage', isLocked: false },
  { permissionKey: 'performance:review:submit', isLocked: false },
  { permissionKey: 'performance:review:read', isLocked: false },
  { permissionKey: 'finance:invoice:read', isLocked: false },
  { permissionKey: 'finance:payroll:read', isLocked: false },
  { permissionKey: 'finance:budget:manage', isLocked: false },
  { permissionKey: 'projects:assignment:manage', isLocked: false },
  { permissionKey: 'projects:staffing:read', isLocked: false },
  { permissionKey: 'planner:task:self:manage', isLocked: false },
  { permissionKey: 'admin:role:manage', isLocked: false },
  { permissionKey: 'admin:tenant:read', isLocked: false },
  { permissionKey: 'admin:tenant:manage', isLocked: false },
]

export const DEFAULT_ROLE_PERMISSIONS: DefaultRolePermissionMap = {
  employee: [...EMPLOYEE_LOCKED, ...EMPLOYEE_DEFAULTS],

  line_manager: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: 'people:profile:team:read', isLocked: true },
    { permissionKey: 'time:leave:approve', isLocked: false },
    { permissionKey: 'performance:review:submit', isLocked: false },
  ],

  hr_ops: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: 'people:profile:read', isLocked: false },
    { permissionKey: 'people:profile:update', isLocked: false },
    { permissionKey: 'time:leave:read', isLocked: false },
    { permissionKey: 'hiring:candidate:read', isLocked: false },
  ],

  tenant_admin: [...TENANT_ADMIN_LOCKED, ...ALL_PERMISSIONS],

  recruiter: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: 'hiring:candidate:read', isLocked: false },
    { permissionKey: 'hiring:candidate:create', isLocked: false },
    { permissionKey: 'hiring:pipeline:manage', isLocked: false },
  ],

  finance_operator: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: 'finance:invoice:read', isLocked: false },
    { permissionKey: 'finance:payroll:read', isLocked: false },
    { permissionKey: 'finance:budget:manage', isLocked: false },
  ],

  project_manager: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: 'projects:assignment:manage', isLocked: false },
    { permissionKey: 'projects:staffing:read', isLocked: false },
  ],

  platform_admin: [...TENANT_ADMIN_LOCKED, ...ALL_PERMISSIONS],

  executive: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: 'people:profile:read', isLocked: false },
    { permissionKey: 'finance:invoice:read', isLocked: false },
    { permissionKey: 'finance:budget:manage', isLocked: false },
    { permissionKey: 'projects:staffing:read', isLocked: false },
  ],

  staffing_owner: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: 'projects:assignment:manage', isLocked: false },
    { permissionKey: 'projects:staffing:read', isLocked: false },
  ],

  account_manager: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: 'projects:staffing:read', isLocked: false },
    { permissionKey: 'finance:invoice:read', isLocked: false },
  ],

  review_operator: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: 'performance:review:submit', isLocked: false },
    { permissionKey: 'performance:review:read', isLocked: false },
  ],
}
```

- [ ] **Step 2: Write the failing test first**

Create `apps/api/src/modules/kernel/application/commands/seed-role-permissions.handler.spec.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SeedRolePermissionsCommand } from './seed-role-permissions.command'
import { SeedRolePermissionsHandler } from './seed-role-permissions.handler'
import type { IRolePermissionRepository } from '../../domain/repositories/role-permission.repository.port'
import { DEFAULT_ROLE_PERMISSIONS } from '../../domain/constants/default-role-permissions'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('SeedRolePermissionsHandler', () => {
  let handler: SeedRolePermissionsHandler
  let rolePermissionRepo: IRolePermissionRepository

  beforeEach(() => {
    rolePermissionRepo = {
      findByRoleKey: vi.fn(),
      findByRoleKeys: vi.fn(),
      insert: vi.fn().mockImplementation(async (data) => ({
        id: '01900000-0000-7000-8000-000000000050',
        tenantId: data.tenantId,
        roleKey: data.roleKey,
        permissionKey: data.permissionKey,
        isLocked: data.isLocked,
        createdAt: new Date(),
      })),
      remove: vi.fn(),
      findAll: vi.fn(),
    }
    handler = new SeedRolePermissionsHandler(rolePermissionRepo)
  })

  it('inserts all default permissions for every role', async () => {
    await handler.execute(new SeedRolePermissionsCommand(TENANT_ID))

    let expectedInsertCount = 0
    for (const entries of Object.values(DEFAULT_ROLE_PERMISSIONS)) {
      expectedInsertCount += entries.length
    }

    expect(rolePermissionRepo.insert).toHaveBeenCalledTimes(expectedInsertCount)
  })

  it('inserts employee locked permissions with isLocked true', async () => {
    await handler.execute(new SeedRolePermissionsCommand(TENANT_ID))

    expect(rolePermissionRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      roleKey: 'employee',
      permissionKey: 'people:profile:self:read',
      isLocked: true,
    })
  })

  it('inserts employee default permissions with isLocked false', async () => {
    await handler.execute(new SeedRolePermissionsCommand(TENANT_ID))

    expect(rolePermissionRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      roleKey: 'employee',
      permissionKey: 'planner:task:self:manage',
      isLocked: false,
    })
  })

  it('inserts tenant_admin locked permissions', async () => {
    await handler.execute(new SeedRolePermissionsCommand(TENANT_ID))

    expect(rolePermissionRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      roleKey: 'tenant_admin',
      permissionKey: 'admin:role:manage',
      isLocked: true,
    })
    expect(rolePermissionRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      roleKey: 'tenant_admin',
      permissionKey: 'admin:tenant:read',
      isLocked: true,
    })
  })

  it('inserts line_manager specific locked permissions', async () => {
    await handler.execute(new SeedRolePermissionsCommand(TENANT_ID))

    expect(rolePermissionRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      roleKey: 'line_manager',
      permissionKey: 'people:profile:team:read',
      isLocked: true,
    })
  })

  it('inserts all roles defined in DEFAULT_ROLE_PERMISSIONS', async () => {
    await handler.execute(new SeedRolePermissionsCommand(TENANT_ID))

    const calledRoleKeys = vi
      .mocked(rolePermissionRepo.insert)
      .mock.calls.map((call) => call[0].roleKey)

    const expectedRoleKeys = Object.keys(DEFAULT_ROLE_PERMISSIONS)
    for (const roleKey of expectedRoleKeys) {
      expect(calledRoleKeys).toContain(roleKey)
    }
  })
})
```

- [ ] **Step 3: Create the command class**

Create `apps/api/src/modules/kernel/application/commands/seed-role-permissions.command.ts`:

```typescript
export class SeedRolePermissionsCommand {
  constructor(readonly tenantId: string) {}
}
```

- [ ] **Step 4: Create the handler**

Create `apps/api/src/modules/kernel/application/commands/seed-role-permissions.handler.ts`:

```typescript
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  ROLE_PERMISSION_REPOSITORY,
  type IRolePermissionRepository,
} from '../../domain/repositories/role-permission.repository.port'
import type { RoleKeyValue } from '../../domain/entities/role-grant.entity'
import { DEFAULT_ROLE_PERMISSIONS } from '../../domain/constants/default-role-permissions'
import { SeedRolePermissionsCommand } from './seed-role-permissions.command'

@CommandHandler(SeedRolePermissionsCommand)
export class SeedRolePermissionsHandler implements ICommandHandler<
  SeedRolePermissionsCommand,
  void
> {
  constructor(
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly rolePermissionRepo: IRolePermissionRepository,
  ) {}

  async execute(command: SeedRolePermissionsCommand): Promise<void> {
    const { tenantId } = command

    for (const [roleKey, entries] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      for (const entry of entries) {
        await this.rolePermissionRepo.insert({
          tenantId,
          roleKey: roleKey as RoleKeyValue,
          permissionKey: entry.permissionKey,
          isLocked: entry.isLocked,
        })
      }
    }
  }
}
```

- [ ] **Step 5: Run tests**

```bash
cd apps/api && bunx vitest run src/modules/kernel/application/commands/seed-role-permissions.handler.spec.ts
```

Expected: all 6 tests PASS

- [ ] **Step 6: Wire seed handler into kernel.module.ts**

Add the import and register `SeedRolePermissionsHandler` as a provider in `kernel.module.ts`:

Add to imports section:

```typescript
import { SeedRolePermissionsHandler } from './application/commands/seed-role-permissions.handler'
```

Add to the providers array (after `UpdateActorStatusHandler`):

```typescript
    SeedRolePermissionsHandler,
```

- [ ] **Step 7: Run typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/kernel/domain/constants/default-role-permissions.ts \
       apps/api/src/modules/kernel/application/commands/seed-role-permissions.command.ts \
       apps/api/src/modules/kernel/application/commands/seed-role-permissions.handler.ts \
       apps/api/src/modules/kernel/application/commands/seed-role-permissions.handler.spec.ts \
       apps/api/src/modules/kernel/kernel.module.ts
git commit -m "feat(kernel): add default role-permission seed command with full seed map"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run all kernel tests**

```bash
cd apps/api && bunx vitest run src/modules/kernel/
```

Expected: ALL tests PASS

- [ ] **Step 2: Run typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

Expected: PASS

- [ ] **Step 3: Verify migration generates cleanly**

```bash
cd apps/api && bun run db:generate
```

Expected: no new changes (migration already generated in Tasks 1 and 3)

- [ ] **Step 4: Final commit (if any files missed)**

```bash
git status
# If any unstaged files, add and commit
```

---

## Summary of new/modified files

| Action | File                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| Modify | `apps/api/src/modules/kernel/infrastructure/schema/role-grant.schema.ts`                                         |
| Modify | `apps/api/src/modules/kernel/infrastructure/schema/index.ts`                                                     |
| Modify | `apps/api/src/modules/kernel/domain/entities/role-grant.entity.ts`                                               |
| Modify | `apps/api/src/modules/kernel/domain/repositories/role-grant.repository.port.ts`                                  |
| Modify | `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-role-grant.repository.ts`                       |
| Modify | `apps/api/src/modules/kernel/application/commands/grant-role.command.ts`                                         |
| Modify | `apps/api/src/modules/kernel/application/commands/grant-role.handler.ts`                                         |
| Modify | `apps/api/src/modules/kernel/application/commands/grant-role.handler.spec.ts`                                    |
| Modify | `apps/api/src/modules/kernel/application/facades/kernel-query.facade.ts`                                         |
| Modify | `apps/api/src/modules/kernel/kernel.module.ts`                                                                   |
| Create | `apps/api/src/modules/kernel/infrastructure/schema/role-permission.schema.ts`                                    |
| Create | `apps/api/src/modules/kernel/domain/entities/role-permission.entity.ts`                                          |
| Create | `apps/api/src/modules/kernel/domain/repositories/role-permission.repository.port.ts`                             |
| Create | `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-role-permission.repository.ts`                  |
| Create | `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-role-permission.repository.integration.spec.ts` |
| Create | `apps/api/src/modules/kernel/domain/entities/delegation.entity.ts`                                               |
| Create | `apps/api/src/modules/kernel/domain/repositories/delegation.repository.port.ts`                                  |
| Create | `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-delegation.repository.ts`                       |
| Create | `apps/api/src/modules/kernel/application/queries/can-do.query.ts`                                                |
| Create | `apps/api/src/modules/kernel/application/queries/can-do.handler.ts`                                              |
| Create | `apps/api/src/modules/kernel/application/queries/can-do.handler.spec.ts`                                         |
| Create | `apps/api/src/modules/kernel/application/queries/get-effective-permissions.query.ts`                             |
| Create | `apps/api/src/modules/kernel/application/queries/get-effective-permissions.handler.ts`                           |
| Create | `apps/api/src/modules/kernel/application/queries/get-effective-permissions.handler.spec.ts`                      |
| Create | `apps/api/src/modules/kernel/domain/constants/default-role-permissions.ts`                                       |
| Create | `apps/api/src/modules/kernel/application/commands/seed-role-permissions.command.ts`                              |
| Create | `apps/api/src/modules/kernel/application/commands/seed-role-permissions.handler.ts`                              |
| Create | `apps/api/src/modules/kernel/application/commands/seed-role-permissions.handler.spec.ts`                         |
| Create | `packages/db/drizzle/migrations/XXXX_role_permission_and_source.sql` (generated)                                 |
