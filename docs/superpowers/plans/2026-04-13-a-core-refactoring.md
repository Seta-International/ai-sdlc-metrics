# @future/core Package & Kernel Boundary Refactoring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract shared domain base types into `@future/core`, expand kernel facades to cover all write operations, and eliminate all cross-module DDD boundary violations.

**Architecture:** Create a zero-dependency `@future/core` package for `DomainException` and shared domain vocabulary types. Add `KernelActorFacade` for actor lifecycle operations. Expand `KernelAuditFacade` with query methods. Move identity's cross-schema query behind `KernelQueryFacade`. Migrate all 28+ violating files to use proper boundaries.

**Tech Stack:** TypeScript, NestJS CQRS, Drizzle ORM, Turborepo, vitest

**Prerequisite:** None — this is the foundation.

---

## File Map

| Action | Path                                                                                          |
| ------ | --------------------------------------------------------------------------------------------- |
| Create | `packages/core/package.json`                                                                  |
| Create | `packages/core/tsconfig.json`                                                                 |
| Create | `packages/core/src/domain-exception.ts`                                                       |
| Create | `packages/core/src/domain-exception.spec.ts`                                                  |
| Create | `packages/core/src/types/identifiers.ts`                                                      |
| Create | `packages/core/src/types/pagination.ts`                                                       |
| Create | `packages/core/src/types/enums.ts`                                                            |
| Create | `packages/core/src/index.ts`                                                                  |
| Modify | `apps/api/src/modules/kernel/domain/exceptions/domain.exception.ts`                           |
| Modify | `apps/api/src/modules/kernel/domain/entities/actor.entity.ts`                                 |
| Modify | `apps/api/src/modules/kernel/domain/entities/role-grant.entity.ts`                            |
| Modify | `apps/api/src/modules/identity/domain/exceptions/identity.exceptions.ts`                      |
| Modify | `apps/api/src/modules/people/domain/exceptions/people.exceptions.ts`                          |
| Modify | `apps/api/src/modules/projects/domain/exceptions/projects.exceptions.ts`                      |
| Modify | `apps/api/src/modules/identity/application/commands/configure-identity-provider.handler.ts`   |
| Modify | `apps/api/src/modules/identity/application/commands/trigger-directory-sync.handler.ts`        |
| Modify | `apps/api/src/modules/identity/application/commands/revoke-api-key.handler.ts`                |
| Modify | `apps/api/src/modules/identity/application/commands/sync-idp-groups.handler.ts`               |
| Modify | `apps/api/src/modules/identity/application/commands/test-idp-connection.handler.ts`           |
| Modify | `apps/api/src/modules/identity/application/commands/remove-group-mapping.handler.ts`          |
| Modify | `apps/api/src/modules/identity/application/commands/upsert-group-mapping.handler.ts`          |
| Modify | `apps/api/src/modules/identity/application/commands/invite-local-user.handler.ts`             |
| Modify | `apps/api/src/modules/identity/application/commands/run-directory-sync.handler.ts`            |
| Modify | `apps/api/src/modules/agents/infrastructure/guards/mcp-auth.guard.ts`                         |
| Modify | `apps/api/src/modules/agents/infrastructure/guards/tool-permission.guard.ts`                  |
| Create | `apps/api/src/modules/kernel/application/facades/kernel-actor.facade.ts`                      |
| Create | `apps/api/src/modules/kernel/application/facades/kernel-actor.facade.spec.ts`                 |
| Modify | `apps/api/src/modules/kernel/application/facades/kernel-audit.facade.ts`                      |
| Create | `apps/api/src/modules/kernel/application/facades/kernel-audit.facade.spec.ts`                 |
| Modify | `apps/api/src/modules/kernel/application/facades/kernel-query.facade.ts`                      |
| Create | `apps/api/src/modules/kernel/application/queries/get-local-users-with-actors.query.ts`        |
| Create | `apps/api/src/modules/kernel/application/queries/get-local-users-with-actors.handler.ts`      |
| Create | `apps/api/src/modules/kernel/application/queries/get-local-users-with-actors.handler.spec.ts` |
| Modify | `apps/api/src/modules/kernel/kernel.module.ts`                                                |
| Modify | `apps/api/src/modules/admin/application/queries/query-audit-log.handler.ts`                   |
| Modify | `apps/api/src/modules/admin/application/queries/export-audit-log.handler.ts`                  |
| Modify | `apps/api/src/modules/people/interface/trpc/people.router.ts`                                 |
| Modify | `apps/api/src/modules/identity/application/commands/create-system-actor.handler.ts`           |
| Modify | `apps/api/src/modules/identity/application/commands/deactivate-local-user.handler.ts`         |
| Modify | `apps/api/src/modules/people/application/commands/complete-offboarding.handler.ts`            |
| Modify | `apps/api/src/modules/people/application/commands/approve-offboarding.handler.ts`             |
| Modify | `apps/api/src/modules/people/application/commands/trigger-offboarding.handler.ts`             |
| Modify | `apps/api/src/modules/people/application/commands/reject-offboarding.handler.ts`              |
| Modify | `apps/api/src/modules/people/application/commands/approve-profile-change.handler.ts`          |
| Modify | `apps/api/src/modules/people/application/commands/complete-task.handler.ts`                   |
| Modify | `apps/api/src/modules/identity/infrastructure/queries/drizzle-local-user-query.service.ts`    |

---

## Task 1: Create `@future/core` package

**Files:**

- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/domain-exception.ts`
- Create: `packages/core/src/domain-exception.spec.ts`
- Create: `packages/core/src/types/identifiers.ts`
- Create: `packages/core/src/types/pagination.ts`
- Create: `packages/core/src/types/enums.ts`
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: Generate workspace**

Run: `turbo gen workspace`

When prompted:

- Name: `@future/core`
- Directory: `packages/core`

If `turbo gen workspace` is not available or fails, create the directory manually:

```bash
mkdir -p packages/core/src/types
```

- [ ] **Step 2: Write `package.json`**

Create `packages/core/package.json`:

```json
{
  "name": "@future/core",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "test:unit": "vitest run"
  },
  "devDependencies": {
    "@future/eslint-config": "workspace:*",
    "@future/tsconfig": "*",
    "eslint": "^10.2.0",
    "typescript": "^6.0.2",
    "vitest": "^3.2.1"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

Create `packages/core/tsconfig.json`:

```json
{
  "extends": "@future/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Write `domain-exception.ts`**

Create `packages/core/src/domain-exception.ts`:

```typescript
export abstract class DomainException extends Error {
  abstract readonly code: string

  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}
```

- [ ] **Step 5: Write the failing test for DomainException**

Create `packages/core/src/domain-exception.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { DomainException } from './domain-exception'

class TestException extends DomainException {
  readonly code = 'TEST_ERROR'
  constructor(msg: string) {
    super(msg)
  }
}

describe('DomainException', () => {
  it('sets message and code', () => {
    const err = new TestException('something went wrong')
    expect(err.message).toBe('something went wrong')
    expect(err.code).toBe('TEST_ERROR')
  })

  it('sets name to the subclass name', () => {
    const err = new TestException('fail')
    expect(err.name).toBe('TestException')
  })

  it('is an instance of Error', () => {
    const err = new TestException('fail')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(DomainException)
  })
})
```

- [ ] **Step 6: Write `types/identifiers.ts`**

Create `packages/core/src/types/identifiers.ts`:

```typescript
export type TenantId = string
export type ActorId = string
```

- [ ] **Step 7: Write `types/pagination.ts`**

Create `packages/core/src/types/pagination.ts`:

```typescript
export interface PaginationOpts {
  limit: number
  offset: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}
```

- [ ] **Step 8: Write `types/enums.ts`**

Create `packages/core/src/types/enums.ts`:

```typescript
export type ActorType = 'person' | 'organization' | 'system'
export type ActorStatus = 'invited' | 'active' | 'inactive' | 'suspended' | 'archived'

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
```

- [ ] **Step 9: Write `index.ts`**

Create `packages/core/src/index.ts`:

```typescript
export { DomainException } from './domain-exception'
export type { TenantId, ActorId } from './types/identifiers'
export type { PaginationOpts, PaginatedResult } from './types/pagination'
export type {
  ActorType,
  ActorStatus,
  RoleKeyValue,
  ScopeTypeValue,
  RoleGrantSourceValue,
} from './types/enums'
```

- [ ] **Step 10: Install dependencies and build**

```bash
bun install
bun run --filter @future/core build
```

Expected: build succeeds, `packages/core/dist/` is created with `.js` and `.d.ts` files.

- [ ] **Step 11: Run test**

```bash
bun run --filter @future/core test:unit
```

Expected: 3 tests pass.

- [ ] **Step 12: Commit**

```bash
git add packages/core/
git commit -m "feat(core): create @future/core — shared DomainException and domain types"
```

---

## Task 2: Migrate DomainException imports

**Files:**

- Modify: `apps/api/src/modules/kernel/domain/exceptions/domain.exception.ts`
- Modify: `apps/api/src/modules/identity/domain/exceptions/identity.exceptions.ts`
- Modify: `apps/api/src/modules/people/domain/exceptions/people.exceptions.ts`
- Modify: `apps/api/src/modules/projects/domain/exceptions/projects.exceptions.ts`

- [ ] **Step 1: Add `@future/core` dependency to `apps/api`**

```bash
cd apps/api && bun add @future/core@workspace:* && cd ../..
```

- [ ] **Step 2: Update kernel's `domain.exception.ts` to re-export**

Edit `apps/api/src/modules/kernel/domain/exceptions/domain.exception.ts`:

Replace the entire file with:

```typescript
// Re-export from @future/core — kernel no longer owns DomainException.
// This re-export exists for backward compatibility during migration.
// New modules should import directly from '@future/core'.
export { DomainException } from '@future/core'
```

- [ ] **Step 3: Update identity exceptions**

Edit `apps/api/src/modules/identity/domain/exceptions/identity.exceptions.ts`:

Change line 1 from:

```typescript
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'
```

To:

```typescript
import { DomainException } from '@future/core'
```

- [ ] **Step 4: Update people exceptions**

Edit `apps/api/src/modules/people/domain/exceptions/people.exceptions.ts`:

Change line 1 from:

```typescript
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'
```

To:

```typescript
import { DomainException } from '@future/core'
```

- [ ] **Step 5: Update projects exceptions**

Edit `apps/api/src/modules/projects/domain/exceptions/projects.exceptions.ts`:

Remove lines 1-3:

```typescript
// NOTE: DomainException is imported cross-module from kernel. This is intentional —
// it is the shared base class for all domain exceptions across the application.
// No other kernel domain internals should be imported by other modules.
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'
```

Replace with:

```typescript
import { DomainException } from '@future/core'
```

- [ ] **Step 6: Update 7 identity handlers that import DomainException directly**

For each of these files, find the `DomainException` import and change it from the kernel path to `@future/core`. If the handler imports DomainException indirectly via the identity exceptions file, no change is needed.

Check each file with:

```bash
grep -n "kernel/domain/exceptions" apps/api/src/modules/identity/application/commands/*.handler.ts
```

For each match, change:

```typescript
import { DomainException } from '../../../../kernel/domain/exceptions/domain.exception'
```

To:

```typescript
import { DomainException } from '@future/core'
```

Files to check:

- `configure-identity-provider.handler.ts`
- `trigger-directory-sync.handler.ts`
- `revoke-api-key.handler.ts`
- `sync-idp-groups.handler.ts`
- `test-idp-connection.handler.ts`
- `remove-group-mapping.handler.ts`
- `upsert-group-mapping.handler.ts`

- [ ] **Step 7: Run tests**

```bash
bun run --filter @future/api test:unit
```

Expected: all existing tests pass. No behavior change — only import paths changed.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/kernel/domain/exceptions/domain.exception.ts
git add apps/api/src/modules/identity/domain/exceptions/identity.exceptions.ts
git add apps/api/src/modules/people/domain/exceptions/people.exceptions.ts
git add apps/api/src/modules/projects/domain/exceptions/projects.exceptions.ts
git add apps/api/src/modules/identity/application/commands/
git add apps/api/package.json
git commit -m "refactor: migrate DomainException imports to @future/core"
```

---

## Task 3: Migrate shared domain types

**Files:**

- Modify: `apps/api/src/modules/kernel/domain/entities/actor.entity.ts`
- Modify: `apps/api/src/modules/kernel/domain/entities/role-grant.entity.ts`
- Modify: `apps/api/src/modules/identity/application/commands/invite-local-user.handler.ts`
- Modify: `apps/api/src/modules/identity/application/commands/run-directory-sync.handler.ts`
- Modify: `apps/api/src/modules/agents/infrastructure/guards/mcp-auth.guard.ts`
- Modify: `apps/api/src/modules/agents/infrastructure/guards/tool-permission.guard.ts`

- [ ] **Step 1: Update `actor.entity.ts`**

Edit `apps/api/src/modules/kernel/domain/entities/actor.entity.ts`:

Replace:

```typescript
export type ActorType = 'person' | 'organization' | 'system'
export type ActorStatus = 'invited' | 'active' | 'inactive' | 'suspended' | 'archived'
```

With:

```typescript
import type { ActorType, ActorStatus } from '@future/core'
export type { ActorType, ActorStatus } from '@future/core'
```

Keep the `Actor` interface and helper functions unchanged.

- [ ] **Step 2: Update `role-grant.entity.ts`**

Edit `apps/api/src/modules/kernel/domain/entities/role-grant.entity.ts`:

Replace:

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
```

With:

```typescript
import type { RoleKeyValue, ScopeTypeValue, RoleGrantSourceValue } from '@future/core'
export type { RoleKeyValue, ScopeTypeValue, RoleGrantSourceValue } from '@future/core'
```

Keep the `RoleGrant` interface unchanged.

- [ ] **Step 3: Update identity handlers importing kernel entity types**

For `invite-local-user.handler.ts`, find:

```typescript
import { RoleKeyValue, ScopeTypeValue } from '../../../../kernel/domain/entities/role-grant.entity'
```

Replace with:

```typescript
import type { RoleKeyValue, ScopeTypeValue } from '@future/core'
```

Do the same for `run-directory-sync.handler.ts`.

- [ ] **Step 4: Update agents guards importing kernel entity types**

For `mcp-auth.guard.ts` and `tool-permission.guard.ts`, find any import of `ActorType` from kernel entities and replace with `@future/core`.

Check:

```bash
grep -rn "kernel/domain/entities/actor" apps/api/src/modules/agents/
```

For each match, replace the kernel import with:

```typescript
import type { ActorType } from '@future/core'
```

- [ ] **Step 5: Build and test**

```bash
bun run --filter "@future/*" build
bun run --filter @future/api test:unit
```

Expected: all tests pass. No behavior change.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/kernel/domain/entities/
git add apps/api/src/modules/identity/application/commands/invite-local-user.handler.ts
git add apps/api/src/modules/identity/application/commands/run-directory-sync.handler.ts
git add apps/api/src/modules/agents/infrastructure/guards/
git commit -m "refactor: migrate shared domain types (ActorType, RoleKeyValue, etc.) to @future/core"
```

---

## Task 4: Create `KernelActorFacade`

**Files:**

- Create: `apps/api/src/modules/kernel/application/facades/kernel-actor.facade.ts`
- Create: `apps/api/src/modules/kernel/application/facades/kernel-actor.facade.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/kernel/application/facades/kernel-actor.facade.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { KernelActorFacade } from './kernel-actor.facade'
import { CreateActorCommand } from '../commands/create-actor.command'
import { UpdateActorStatusCommand } from '../commands/update-actor-status.command'
import { GrantRoleCommand } from '../commands/grant-role.command'

describe('KernelActorFacade', () => {
  let facade: KernelActorFacade
  let commandBus: { execute: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    commandBus = { execute: vi.fn() }
    facade = new KernelActorFacade(commandBus as unknown as CommandBus)
  })

  describe('createActor', () => {
    it('dispatches CreateActorCommand and returns actorId', async () => {
      commandBus.execute.mockResolvedValue('actor-123')

      const result = await facade.createActor('tenant-1', 'system', 'Bot User', 'admin-1')

      expect(commandBus.execute).toHaveBeenCalledWith(expect.any(CreateActorCommand))
      expect(result).toBe('actor-123')
    })
  })

  describe('deactivateActor', () => {
    it('dispatches UpdateActorStatusCommand with inactive status', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      await facade.deactivateActor('actor-1', 'tenant-1')

      expect(commandBus.execute).toHaveBeenCalledWith(expect.any(UpdateActorStatusCommand))
    })
  })

  describe('grantRole', () => {
    it('dispatches GrantRoleCommand', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      await facade.grantRole('actor-1', 'employee', 'global', null, 'tenant-1', 'admin-1')

      expect(commandBus.execute).toHaveBeenCalledWith(expect.any(GrantRoleCommand))
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run --filter @future/api test:unit -- --testPathPattern kernel-actor.facade
```

Expected: FAIL — `./kernel-actor.facade` module not found.

- [ ] **Step 3: Implement `KernelActorFacade`**

Create `apps/api/src/modules/kernel/application/facades/kernel-actor.facade.ts`:

```typescript
import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import type { RoleKeyValue, ScopeTypeValue } from '@future/core'
import { CreateActorCommand } from '../commands/create-actor.command'
import { UpdateActorStatusCommand } from '../commands/update-actor-status.command'
import { GrantRoleCommand } from '../commands/grant-role.command'
import { RevokeAllRoleGrantsCommand } from '../commands/revoke-all-role-grants.command'

@Injectable()
export class KernelActorFacade {
  constructor(private readonly commandBus: CommandBus) {}

  createActor(
    tenantId: string,
    type: 'person' | 'organization' | 'system',
    displayName: string,
    createdBy: string,
  ): Promise<string> {
    return this.commandBus.execute(new CreateActorCommand(tenantId, type, displayName))
  }

  deactivateActor(actorId: string, tenantId: string): Promise<void> {
    return this.commandBus.execute(new UpdateActorStatusCommand(actorId, tenantId, 'inactive'))
  }

  grantRole(
    actorId: string,
    roleKey: RoleKeyValue,
    scopeType: ScopeTypeValue,
    scopeId: string | null,
    tenantId: string,
    grantedBy: string,
  ): Promise<void> {
    return this.commandBus.execute(
      new GrantRoleCommand(actorId, roleKey, scopeType, scopeId, tenantId, grantedBy),
    )
  }

  revokeAllRoles(actorId: string, tenantId: string): Promise<void> {
    return this.commandBus.execute(new RevokeAllRoleGrantsCommand(actorId, tenantId))
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run --filter @future/api test:unit -- --testPathPattern kernel-actor.facade
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/kernel/application/facades/kernel-actor.facade.ts
git add apps/api/src/modules/kernel/application/facades/kernel-actor.facade.spec.ts
git commit -m "feat(kernel): add KernelActorFacade — actor lifecycle operations"
```

---

## Task 5: Expand `KernelAuditFacade` with query methods

**Files:**

- Modify: `apps/api/src/modules/kernel/application/facades/kernel-audit.facade.ts`
- Create: `apps/api/src/modules/kernel/application/facades/kernel-audit.facade.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/kernel/application/facades/kernel-audit.facade.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KernelAuditFacade } from './kernel-audit.facade'

describe('KernelAuditFacade', () => {
  let facade: KernelAuditFacade
  let auditRepo: {
    insert: ReturnType<typeof vi.fn>
    query: ReturnType<typeof vi.fn>
    queryAll: ReturnType<typeof vi.fn>
  }
  let outboxRepo: { insert: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    auditRepo = { insert: vi.fn(), query: vi.fn(), queryAll: vi.fn() }
    outboxRepo = { insert: vi.fn() }
    facade = new KernelAuditFacade(auditRepo as any, outboxRepo as any)
  })

  describe('queryAuditLog', () => {
    it('delegates to auditRepo.query', async () => {
      const result = { items: [], total: 0 }
      auditRepo.query.mockResolvedValue(result)

      const actual = await facade.queryAuditLog('tenant-1', { limit: 10, offset: 0 })

      expect(auditRepo.query).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        limit: 10,
        offset: 0,
      })
      expect(actual).toBe(result)
    })
  })

  describe('exportAuditLog', () => {
    it('delegates to auditRepo.queryAll', async () => {
      const rows = [{ id: '1' }]
      auditRepo.queryAll.mockResolvedValue(rows)

      const actual = await facade.exportAuditLog('tenant-1', {})

      expect(auditRepo.queryAll).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
      })
      expect(actual).toBe(rows)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run --filter @future/api test:unit -- --testPathPattern kernel-audit.facade.spec
```

Expected: FAIL — `queryAuditLog` is not a function.

- [ ] **Step 3: Expand `kernel-audit.facade.ts`**

Edit `apps/api/src/modules/kernel/application/facades/kernel-audit.facade.ts`. Add the new imports and methods:

Add to the import block:

```typescript
import {
  AUDIT_EVENT_QUERY_REPOSITORY,
  type IAuditEventQueryRepository,
  type AuditEventRow,
} from '../../domain/repositories/audit-event-query.repository.port'
```

Add to the constructor:

```typescript
@Inject(AUDIT_EVENT_QUERY_REPOSITORY)
private readonly auditQueryRepo: IAuditEventQueryRepository,
```

Add these methods after the existing ones:

```typescript
queryAuditLog(
  tenantId: string,
  filters: {
    actorId?: string
    eventType?: string
    module?: string
    dateFrom?: string
    dateTo?: string
    limit?: number
    offset?: number
  },
): Promise<{ items: AuditEventRow[]; total: number }> {
  return this.auditQueryRepo.query({ tenantId, ...filters })
}

exportAuditLog(
  tenantId: string,
  filters: {
    actorId?: string
    eventType?: string
    module?: string
    dateFrom?: string
    dateTo?: string
  },
): Promise<AuditEventRow[]> {
  return this.auditQueryRepo.queryAll({ tenantId, ...filters })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run --filter @future/api test:unit -- --testPathPattern kernel-audit.facade.spec
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/kernel/application/facades/kernel-audit.facade.ts
git add apps/api/src/modules/kernel/application/facades/kernel-audit.facade.spec.ts
git commit -m "feat(kernel): expand KernelAuditFacade with queryAuditLog, exportAuditLog"
```

---

## Task 6: Add `getLocalUsersWithActors` to `KernelQueryFacade`

**Files:**

- Create: `apps/api/src/modules/kernel/application/queries/get-local-users-with-actors.query.ts`
- Create: `apps/api/src/modules/kernel/application/queries/get-local-users-with-actors.handler.ts`
- Create: `apps/api/src/modules/kernel/application/queries/get-local-users-with-actors.handler.spec.ts`
- Modify: `apps/api/src/modules/kernel/application/facades/kernel-query.facade.ts`

- [ ] **Step 1: Create the query class**

Create `apps/api/src/modules/kernel/application/queries/get-local-users-with-actors.query.ts`:

```typescript
export class GetLocalUsersWithActorsQuery {
  constructor(readonly tenantId: string) {}
}
```

- [ ] **Step 2: Define the return type and write the failing test**

Create `apps/api/src/modules/kernel/application/queries/get-local-users-with-actors.handler.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  GetLocalUsersWithActorsHandler,
  type LocalUserWithActorDto,
} from './get-local-users-with-actors.handler'
import { GetLocalUsersWithActorsQuery } from './get-local-users-with-actors.query'

describe('GetLocalUsersWithActorsHandler', () => {
  let handler: GetLocalUsersWithActorsHandler
  let db: { select: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                {
                  actorId: 'actor-1',
                  email: 'test@example.com',
                  displayName: 'Test User',
                  status: 'active',
                  lastLoginAt: null,
                  createdAt: new Date(),
                },
              ]),
            }),
          }),
        }),
      }),
    }
    handler = new GetLocalUsersWithActorsHandler(db as any)
  })

  it('returns local users with actor details', async () => {
    const query = new GetLocalUsersWithActorsQuery('tenant-1')
    const result = await handler.execute(query)

    expect(result).toHaveLength(1)
    expect(result[0].actorId).toBe('actor-1')
    expect(result[0].email).toBe('test@example.com')
    expect(result[0].displayName).toBe('Test User')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bun run --filter @future/api test:unit -- --testPathPattern get-local-users-with-actors.handler.spec
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the handler**

Create `apps/api/src/modules/kernel/application/queries/get-local-users-with-actors.handler.ts`:

```typescript
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { userIdentity, actor } from '../../infrastructure/schema/index'
import { GetLocalUsersWithActorsQuery } from './get-local-users-with-actors.query'

export interface LocalUserWithActorDto {
  actorId: string
  email: string
  displayName: string
  status: string
  lastLoginAt: Date | null
  createdAt: Date
}

@QueryHandler(GetLocalUsersWithActorsQuery)
export class GetLocalUsersWithActorsHandler implements IQueryHandler<
  GetLocalUsersWithActorsQuery,
  LocalUserWithActorDto[]
> {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async execute(query: GetLocalUsersWithActorsQuery): Promise<LocalUserWithActorDto[]> {
    const rows = await this.db
      .select({
        actorId: userIdentity.actorId,
        email: userIdentity.email,
        displayName: actor.displayName,
        status: userIdentity.status,
        lastLoginAt: userIdentity.lastLoginAt,
        createdAt: userIdentity.createdAt,
      })
      .from(userIdentity)
      .innerJoin(actor, and(eq(actor.id, userIdentity.actorId), eq(actor.tenantId, query.tenantId)))
      .where(and(eq(userIdentity.tenantId, query.tenantId), eq(userIdentity.provider, 'local')))
      .orderBy(actor.displayName)

    return rows as LocalUserWithActorDto[]
  }
}
```

- [ ] **Step 5: Add method to `KernelQueryFacade`**

Edit `apps/api/src/modules/kernel/application/facades/kernel-query.facade.ts`.

Add import:

```typescript
import { GetLocalUsersWithActorsQuery } from '../queries/get-local-users-with-actors.query'
import type { LocalUserWithActorDto } from '../queries/get-local-users-with-actors.handler'
```

Add method at the end of the class:

```typescript
getLocalUsersWithActors(tenantId: string): Promise<LocalUserWithActorDto[]> {
  return this.queryBus.execute(new GetLocalUsersWithActorsQuery(tenantId))
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
bun run --filter @future/api test:unit -- --testPathPattern get-local-users-with-actors
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/kernel/application/queries/get-local-users-with-actors.*
git add apps/api/src/modules/kernel/application/facades/kernel-query.facade.ts
git commit -m "feat(kernel): add getLocalUsersWithActors to KernelQueryFacade"
```

---

## Task 7: Update `kernel.module.ts` — register new providers and fix exports

**Files:**

- Modify: `apps/api/src/modules/kernel/kernel.module.ts`

- [ ] **Step 1: Add imports for new providers**

Add to the import block in `kernel.module.ts`:

```typescript
import { KernelActorFacade } from './application/facades/kernel-actor.facade'
import { GetLocalUsersWithActorsHandler } from './application/queries/get-local-users-with-actors.handler'
```

- [ ] **Step 2: Register new providers**

Add to the `providers` array (after the existing handler registrations):

```typescript
GetLocalUsersWithActorsHandler,
KernelActorFacade,
```

- [ ] **Step 3: Update exports — remove `AUDIT_EVENT_QUERY_REPOSITORY`, add `KernelActorFacade`**

Change the `exports` array from:

```typescript
exports: [KernelQueryFacade, KernelAuditFacade, AUDIT_EVENT_QUERY_REPOSITORY],
```

To:

```typescript
exports: [KernelQueryFacade, KernelAuditFacade, KernelActorFacade],
```

- [ ] **Step 4: Run typecheck**

```bash
bun run --filter @future/api typecheck
```

Expected: may show errors in admin module (it imports `AUDIT_EVENT_QUERY_REPOSITORY` from kernel). This will be fixed in Task 8.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/kernel/kernel.module.ts
git commit -m "refactor(kernel): register KernelActorFacade, remove AUDIT_EVENT_QUERY_REPOSITORY export"
```

---

## Task 8: Migrate admin audit queries to use `KernelAuditFacade`

**Files:**

- Modify: `apps/api/src/modules/admin/application/queries/query-audit-log.handler.ts`
- Modify: `apps/api/src/modules/admin/application/queries/export-audit-log.handler.ts`

- [ ] **Step 1: Update `query-audit-log.handler.ts`**

Replace the entire file content of `apps/api/src/modules/admin/application/queries/query-audit-log.handler.ts`:

```typescript
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { QueryAuditLogQuery } from './query-audit-log.query'

export interface AuditLogResultDto {
  items: unknown[]
  total: number
}

@QueryHandler(QueryAuditLogQuery)
export class QueryAuditLogHandler implements IQueryHandler<QueryAuditLogQuery, AuditLogResultDto> {
  constructor(private readonly auditFacade: KernelAuditFacade) {}

  async execute(query: QueryAuditLogQuery): Promise<AuditLogResultDto> {
    return this.auditFacade.queryAuditLog(query.tenantId, {
      actorId: query.actorId,
      eventType: query.eventType,
      module: query.module,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      limit: query.limit,
      offset: query.offset,
    })
  }
}
```

- [ ] **Step 2: Update `export-audit-log.handler.ts`**

Read the file first, then replace the direct repository import pattern with facade usage. The handler should inject `KernelAuditFacade` instead of `AUDIT_EVENT_QUERY_REPOSITORY` and call `this.auditFacade.exportAuditLog(...)`.

- [ ] **Step 3: Update people router**

Read `apps/api/src/modules/people/interface/trpc/people.router.ts` and find where it imports `IAuditEventRepository` from kernel. Replace with `KernelAuditFacade` usage.

- [ ] **Step 4: Run tests**

```bash
bun run --filter @future/api test:unit
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/application/queries/
git add apps/api/src/modules/people/interface/trpc/people.router.ts
git commit -m "refactor(admin,people): migrate audit queries to KernelAuditFacade"
```

---

## Task 9: Migrate identity handlers to `KernelActorFacade`

**Files:**

- Modify: `apps/api/src/modules/identity/application/commands/create-system-actor.handler.ts`
- Modify: `apps/api/src/modules/identity/application/commands/invite-local-user.handler.ts`
- Modify: `apps/api/src/modules/identity/application/commands/deactivate-local-user.handler.ts`
- Modify: `apps/api/src/modules/identity/application/commands/run-directory-sync.handler.ts`

- [ ] **Step 1: Update `create-system-actor.handler.ts`**

Replace the file content:

```typescript
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { KernelActorFacade } from '../../../kernel/application/facades/kernel-actor.facade'
import { CreateSystemActorCommand } from './create-system-actor.command'

@CommandHandler(CreateSystemActorCommand)
export class CreateSystemActorHandler implements ICommandHandler<
  CreateSystemActorCommand,
  { actorId: string }
> {
  constructor(
    private readonly actorFacade: KernelActorFacade,
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  async execute(command: CreateSystemActorCommand): Promise<{ actorId: string }> {
    const actorId = await this.actorFacade.createActor(
      command.tenantId,
      'system',
      command.displayName,
      command.createdBy,
    )

    await this.auditFacade.recordEvent({
      tenantId: command.tenantId,
      actorId: command.createdBy,
      eventType: 'system_actor.created',
      module: 'identity',
      subjectId: actorId,
      payload: { displayName: command.displayName },
    })

    return { actorId }
  }
}
```

- [ ] **Step 2: Update remaining identity handlers**

For each of these files, read the current content, find `CommandBus` + `CreateActorCommand` or `UpdateActorStatusCommand` or `GrantRoleCommand` imports from kernel, and replace with `KernelActorFacade`:

- `invite-local-user.handler.ts` — replace `commandBus.execute(new CreateActorCommand(...))` with `actorFacade.createActor(...)` and `commandBus.execute(new GrantRoleCommand(...))` with `actorFacade.grantRole(...)`
- `deactivate-local-user.handler.ts` — replace `commandBus.execute(new UpdateActorStatusCommand(...))` with `actorFacade.deactivateActor(...)`
- `run-directory-sync.handler.ts` — replace all kernel command dispatches with facade calls

For each handler:

1. Remove kernel command imports (`CreateActorCommand`, `UpdateActorStatusCommand`, `GrantRoleCommand`)
2. Replace `CommandBus` injection with `KernelActorFacade` injection (keep `CommandBus` if it's used for non-kernel commands)
3. Replace `this.commandBus.execute(new Create/Update/Grant...Command(...))` with `this.actorFacade.method(...)`

- [ ] **Step 3: Run tests**

```bash
bun run --filter @future/api test:unit -- --testPathPattern identity
```

Expected: all identity tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/identity/application/commands/
git commit -m "refactor(identity): migrate to KernelActorFacade — no direct kernel command dispatch"
```

---

## Task 10: Migrate people handlers to `KernelActorFacade`

**Files:**

- Modify: `apps/api/src/modules/people/application/commands/complete-offboarding.handler.ts`
- Modify: `apps/api/src/modules/people/application/commands/approve-offboarding.handler.ts`
- Modify: `apps/api/src/modules/people/application/commands/trigger-offboarding.handler.ts`
- Modify: `apps/api/src/modules/people/application/commands/reject-offboarding.handler.ts`
- Modify: `apps/api/src/modules/people/application/commands/approve-profile-change.handler.ts`
- Modify: `apps/api/src/modules/people/application/commands/complete-task.handler.ts`

- [ ] **Step 1: Read each file and identify kernel command imports**

```bash
grep -rn "kernel/application/commands" apps/api/src/modules/people/application/commands/
```

For each file with a match:

1. Remove the kernel command import
2. Add `KernelActorFacade` import: `import { KernelActorFacade } from '../../../kernel/application/facades/kernel-actor.facade'`
3. Add to constructor: `private readonly actorFacade: KernelActorFacade`
4. Replace `this.commandBus.execute(new UpdateActorStatusCommand(...))` with `this.actorFacade.deactivateActor(...)`
5. Replace `this.commandBus.execute(new RevokeAllRoleGrantsCommand(...))` with `this.actorFacade.revokeAllRoles(...)`

- [ ] **Step 2: Run tests**

```bash
bun run --filter @future/api test:unit -- --testPathPattern people
```

Expected: all people tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/people/application/commands/
git commit -m "refactor(people): migrate to KernelActorFacade — no direct kernel command dispatch"
```

---

## Task 11: Migrate identity's cross-schema query to `KernelQueryFacade`

**Files:**

- Modify: `apps/api/src/modules/identity/infrastructure/queries/drizzle-local-user-query.service.ts`

- [ ] **Step 1: Replace the implementation**

Replace the entire file content of `apps/api/src/modules/identity/infrastructure/queries/drizzle-local-user-query.service.ts`:

```typescript
import { Injectable } from '@nestjs/common'
import type { ILocalUserQueryPort, LocalUserDto } from '../../domain/ports/local-user-query.port'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'

@Injectable()
export class DrizzleLocalUserQueryService implements ILocalUserQueryPort {
  constructor(private readonly kernelQueryFacade: KernelQueryFacade) {}

  async listByTenantId(tenantId: string): Promise<LocalUserDto[]> {
    const users = await this.kernelQueryFacade.getLocalUsersWithActors(tenantId)
    return users as LocalUserDto[]
  }
}
```

Note: this removes the `DB_TOKEN` injection and all Drizzle/schema imports. The query now lives in kernel where both tables are accessible.

- [ ] **Step 2: Run tests**

```bash
bun run --filter @future/api test:unit -- --testPathPattern identity
```

Expected: all tests pass. The mock may need updating if tests mocked `DB_TOKEN` — they should now mock `KernelQueryFacade`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/identity/infrastructure/queries/drizzle-local-user-query.service.ts
git commit -m "refactor(identity): delegate local user query to KernelQueryFacade — no cross-schema import"
```

---

## Task 12: Verify zero remaining violations

- [ ] **Step 1: Check for cross-module domain imports**

```bash
grep -rn "kernel/domain/" apps/api/src/modules/identity/ apps/api/src/modules/people/ apps/api/src/modules/projects/ apps/api/src/modules/agents/ apps/api/src/modules/admin/ --include="*.ts" | grep -v "node_modules" | grep -v ".spec.ts"
```

Expected: zero results (excluding test files).

- [ ] **Step 2: Check for cross-module infrastructure imports**

```bash
grep -rn "kernel/infrastructure/" apps/api/src/modules/identity/ apps/api/src/modules/people/ apps/api/src/modules/projects/ apps/api/src/modules/agents/ apps/api/src/modules/admin/ --include="*.ts" | grep -v "node_modules"
```

Expected: zero results.

- [ ] **Step 3: Check for direct kernel repository Symbol imports**

```bash
grep -rn "AUDIT_EVENT_REPOSITORY\|AUDIT_EVENT_QUERY_REPOSITORY\|OUTBOX_EVENT_REPOSITORY" apps/api/src/modules/identity/ apps/api/src/modules/people/ apps/api/src/modules/projects/ apps/api/src/modules/agents/ apps/api/src/modules/admin/ --include="*.ts"
```

Expected: zero results.

- [ ] **Step 4: Check for kernel command imports outside kernel**

```bash
grep -rn "kernel/application/commands/" apps/api/src/modules/identity/ apps/api/src/modules/people/ apps/api/src/modules/projects/ apps/api/src/modules/agents/ apps/api/src/modules/admin/ --include="*.ts"
```

Expected: zero results.

- [ ] **Step 5: Run full test suite**

```bash
bun run --filter "@future/*" build && bun run --filter @future/api test:unit
```

Expected: all tests pass.

- [ ] **Step 6: Final commit if any cleanup was needed**

```bash
git add -A
git status
# Only commit if there are changes
git diff --cached --quiet || git commit -m "refactor: final cleanup — zero cross-module boundary violations"
```
