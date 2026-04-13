# @future/core Package & Kernel Boundary Refactoring Spec

**Date:** 2026-04-13
**Status:** Draft
**Owns:** Shared domain base types, kernel facade expansion, DDD boundary enforcement
**Priority:** Prerequisite — must complete before planner, integrations, or any new module

---

## Overview

The codebase has 28+ files violating DDD module boundaries. Modules import kernel's domain entities, infrastructure schema, repository ports, and dispatch kernel commands directly. This makes modules tightly coupled to kernel internals and breaks the hexagonal architecture.

This spec fixes all violations by:

1. Creating `@future/core` — a zero-dependency package for shared domain base types
2. Expanding kernel facades to cover all write operations (actors, roles, outbox)
3. Moving cross-schema queries behind kernel facades
4. Migrating all violating imports to use proper boundaries

### Why now

Every new module (planner, integrations, voice capture) will need `DomainException`, audit facades, and actor operations. If we build them on top of the current boundary violations, we multiply the problem. Fix the foundation first.

---

## Category 1: `@future/core` Package

### Package structure

```
packages/core/
  src/
    domain-exception.ts
    types/
      identifiers.ts
      pagination.ts
      enums.ts
    index.ts
  package.json
  tsconfig.json
```

Create via `turbo gen workspace` per CLAUDE.md.

### Exports

#### `domain-exception.ts`

```typescript
export abstract class DomainException extends Error {
  abstract readonly code: string

  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}
```

Exact copy of current `kernel/domain/exceptions/domain.exception.ts`. After extraction, kernel re-imports from `@future/core`.

#### `types/identifiers.ts`

```typescript
// Plain type aliases (not branded). Can upgrade to branded types later.
export type TenantId = string
export type ActorId = string
```

#### `types/pagination.ts`

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

#### `types/enums.ts`

Shared domain vocabulary used across module boundaries:

```typescript
// From kernel/domain/entities/actor.entity.ts
export type ActorType = 'person' | 'organization' | 'system'
export type ActorStatus = 'active' | 'inactive' | 'suspended'

// From kernel/domain/entities/role-grant.entity.ts
export type RoleKey = string
export type ScopeType = 'global' | 'department' | 'project' | 'account'
```

### What does NOT go in `@future/core`

- NestJS decorators or DI — zero NestJS dependency
- Drizzle types — stays in `@future/db`
- Event contracts — stays in `@future/event-contracts`
- tRPC types — stays in API common
- Business logic — stays in kernel or owning module
- Repository interfaces — each module owns its own

---

## Category 2: Kernel Facade Expansion

### Current state

| Facade              | Methods                                                                                                                    | Exported |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| `KernelQueryFacade` | `getActor`, `getTenant`, `getRoleGrants`, `hasRole`, `canDo`, `getEffectivePermissions`, `getRolePermissions`, `listRoles` | Yes      |
| `KernelAuditFacade` | `recordEvent`, `publishOutboxEvent`                                                                                        | Yes      |

### Problem

Modules bypass facades for write operations:

- Identity dispatches `CreateActorCommand`, `DeactivateActorCommand`, `GrantRoleCommand` via CommandBus
- People dispatches `PublishOutboxEventCommand`, `DeactivateActorCommand` via CommandBus
- Admin imports `IAuditEventQueryRepository` directly for audit log queries

### Fix: Expand `KernelAuditFacade`

Add query methods to replace direct repository imports:

```typescript
@Injectable()
export class KernelAuditFacade {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  // Existing
  recordEvent(data: RecordAuditEventDto): Promise<void> { ... }
  publishOutboxEvent(data: PublishOutboxEventDto): Promise<void> { ... }

  // NEW — replaces direct IAuditEventQueryRepository imports
  queryAuditLog(tenantId: string, filters: AuditLogFilters): Promise<PaginatedResult<AuditEvent>> { ... }
  exportAuditLog(tenantId: string, filters: AuditLogFilters): Promise<AuditEvent[]> { ... }
}
```

### Fix: New `KernelActorFacade`

New facade for actor lifecycle operations:

```typescript
@Injectable()
export class KernelActorFacade {
  constructor(private readonly commandBus: CommandBus) {}

  createActor(
    tenantId: string,
    type: ActorType,
    displayName: string,
    createdBy: string,
  ): Promise<Actor> {
    return this.commandBus.execute(new CreateActorCommand(tenantId, type, displayName, createdBy))
  }

  deactivateActor(actorId: string, tenantId: string, deactivatedBy: string): Promise<void> {
    return this.commandBus.execute(new DeactivateActorCommand(actorId, tenantId, deactivatedBy))
  }

  grantRole(
    actorId: string,
    roleKey: RoleKey,
    scopeType: ScopeType,
    scopeId: string | null,
    tenantId: string,
    grantedBy: string,
  ): Promise<void> {
    return this.commandBus.execute(
      new GrantRoleCommand(actorId, roleKey, scopeType, scopeId, tenantId, grantedBy),
    )
  }

  revokeRole(
    actorId: string,
    roleKey: RoleKey,
    scopeType: ScopeType,
    scopeId: string | null,
    tenantId: string,
    revokedBy: string,
  ): Promise<void> {
    return this.commandBus.execute(
      new RevokeRoleCommand(actorId, roleKey, scopeType, scopeId, tenantId, revokedBy),
    )
  }
}
```

### Fix: Expand `KernelQueryFacade`

Add method for identity's cross-schema query:

```typescript
// NEW — replaces identity's direct schema import of actor + userIdentity tables
getLocalUsersWithActors(tenantId: string, filters?: LocalUserFilters): Promise<LocalUserWithActor[]> { ... }
```

### Updated kernel module exports

```typescript
@Module({
  // ...
  exports: [KernelQueryFacade, KernelAuditFacade, KernelActorFacade],
})
export class KernelModule {}
```

---

## Category 3: Domain Vocabulary Migration

| Type              | From                                           | To                                        | Action                           |
| ----------------- | ---------------------------------------------- | ----------------------------------------- | -------------------------------- |
| `DomainException` | `kernel/domain/exceptions/domain.exception.ts` | `@future/core`                            | Move class, kernel re-imports    |
| `ActorType`       | `kernel/domain/entities/actor.entity.ts`       | `@future/core/types/enums`                | Move type, kernel re-imports     |
| `ActorStatus`     | `kernel/domain/entities/actor.entity.ts`       | `@future/core/types/enums`                | Move type, kernel re-imports     |
| `RoleKeyValue`    | `kernel/domain/entities/role-grant.entity.ts`  | `@future/core/types/enums` as `RoleKey`   | Move + rename, kernel re-imports |
| `ScopeTypeValue`  | `kernel/domain/entities/role-grant.entity.ts`  | `@future/core/types/enums` as `ScopeType` | Move + rename, kernel re-imports |

After migration, kernel entity files import from `@future/core`:

```typescript
// kernel/domain/entities/actor.entity.ts
import type { ActorType, ActorStatus } from '@future/core'

export interface Actor {
  id: string
  tenantId: string
  type: ActorType
  status: ActorStatus
  displayName: string
  createdAt: Date
  updatedAt: Date
}
```

All other modules import shared types from `@future/core` — never from kernel internals.

---

## Category 4: Infrastructure Schema Coupling Fix

### The violation

`identity/infrastructure/queries/drizzle-local-user-query.service.ts` imports:

- `actor` table from `kernel/infrastructure/schema/`
- `userIdentity` table from `kernel/infrastructure/schema/`

It performs cross-schema joins (identity schema + core schema) to return local users with their actor details.

### The fix

Move the query logic behind `KernelQueryFacade.getLocalUsersWithActors()`.

**Before (identity module):**

```typescript
// identity/infrastructure/queries/drizzle-local-user-query.service.ts
import { actor } from '../../../kernel/infrastructure/schema/index'
import { userIdentity } from '../../../kernel/infrastructure/schema/index'

// Direct cross-schema query
const rows = await this.db
  .select()
  .from(userIdentity)
  .innerJoin(actor, eq(userIdentity.actorId, actor.id))
  .where(eq(actor.tenantId, tenantId))
```

**After (kernel handles the query, identity calls facade):**

```typescript
// kernel/application/facades/kernel-query.facade.ts
async getLocalUsersWithActors(tenantId: string, filters?: LocalUserFilters): Promise<LocalUserWithActor[]> {
  return this.queryBus.execute(new GetLocalUsersWithActorsQuery(tenantId, filters))
}

// kernel/application/queries/get-local-users-with-actors.handler.ts
// Query lives in kernel where both tables are accessible
```

```typescript
// identity/infrastructure/queries/drizzle-local-user-query.service.ts
// Now delegates to kernel facade — no cross-schema import
const users = await this.kernelQueryFacade.getLocalUsersWithActors(tenantId, filters)
```

The `LocalUserWithActor` return type is defined in `@future/core` or as part of the facade's public API.

---

## File-by-File Migration Map

### Phase 1: Create `@future/core` (0 existing files changed)

| Action | Path                                     |
| ------ | ---------------------------------------- |
| Create | `packages/core/package.json`             |
| Create | `packages/core/tsconfig.json`            |
| Create | `packages/core/src/domain-exception.ts`  |
| Create | `packages/core/src/types/identifiers.ts` |
| Create | `packages/core/src/types/pagination.ts`  |
| Create | `packages/core/src/types/enums.ts`       |
| Create | `packages/core/src/index.ts`             |

### Phase 2: Migrate DomainException (11 files)

| Action | Path                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------- |
| Modify | `apps/api/src/modules/kernel/domain/exceptions/domain.exception.ts` — re-export from `@future/core`   |
| Modify | `apps/api/src/modules/identity/domain/exceptions/identity.exceptions.ts` — import from `@future/core` |
| Modify | `apps/api/src/modules/people/domain/exceptions/people.exceptions.ts` — import from `@future/core`     |
| Modify | `apps/api/src/modules/projects/domain/exceptions/projects.exceptions.ts` — import from `@future/core` |
| Modify | 7 identity command handlers — update import path                                                      |

### Phase 3: Migrate shared types (6 files)

| Action | Path                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------- |
| Modify | `apps/api/src/modules/kernel/domain/entities/actor.entity.ts` — import `ActorType`, `ActorStatus` from `@future/core`  |
| Modify | `apps/api/src/modules/kernel/domain/entities/role-grant.entity.ts` — import `RoleKey`, `ScopeType` from `@future/core` |
| Modify | `apps/api/src/modules/identity/application/commands/invite-local-user.handler.ts` — import from `@future/core`         |
| Modify | `apps/api/src/modules/identity/application/commands/run-directory-sync.handler.ts` — import from `@future/core`        |
| Modify | `apps/api/src/modules/agents/infrastructure/guards/mcp-auth.guard.ts` — import from `@future/core`                     |
| Modify | `apps/api/src/modules/agents/infrastructure/guards/tool-permission.guard.ts` — import from `@future/core`              |

### Phase 4: Kernel facade expansion (8 files)

| Action | Path                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| Modify | `apps/api/src/modules/kernel/application/facades/kernel-audit.facade.ts` — add `queryAuditLog`, `exportAuditLog` |
| Create | `apps/api/src/modules/kernel/application/facades/kernel-actor.facade.ts` — new facade                            |
| Create | `apps/api/src/modules/kernel/application/facades/kernel-actor.facade.spec.ts` — tests                            |
| Modify | `apps/api/src/modules/kernel/application/facades/kernel-query.facade.ts` — add `getLocalUsersWithActors`         |
| Create | `apps/api/src/modules/kernel/application/queries/get-local-users-with-actors.query.ts`                           |
| Create | `apps/api/src/modules/kernel/application/queries/get-local-users-with-actors.handler.ts`                         |
| Create | `apps/api/src/modules/kernel/application/queries/get-local-users-with-actors.handler.spec.ts`                    |
| Modify | `apps/api/src/modules/kernel/kernel.module.ts` — export `KernelActorFacade`, register new providers              |

### Phase 5: Migrate callers to facades (14 files)

| Action | Path                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| Modify | `apps/api/src/modules/admin/application/queries/export-audit-log.handler.ts` — use `KernelAuditFacade.exportAuditLog` |
| Modify | `apps/api/src/modules/admin/application/queries/query-audit-log.handler.ts` — use `KernelAuditFacade.queryAuditLog`   |
| Modify | `apps/api/src/modules/people/interface/trpc/people.router.ts` — use facade instead of `IAuditEventRepository`         |
| Modify | `apps/api/src/modules/identity/application/commands/create-system-actor.handler.ts` — use `KernelActorFacade`         |
| Modify | `apps/api/src/modules/identity/application/commands/invite-local-user.handler.ts` — use `KernelActorFacade`           |
| Modify | `apps/api/src/modules/identity/application/commands/deactivate-local-user.handler.ts` — use `KernelActorFacade`       |
| Modify | `apps/api/src/modules/identity/application/commands/run-directory-sync.handler.ts` — use `KernelActorFacade`          |
| Modify | `apps/api/src/modules/people/application/commands/complete-offboarding.handler.ts` — use `KernelActorFacade`          |
| Modify | `apps/api/src/modules/people/application/commands/approve-offboarding.handler.ts` — use `KernelActorFacade`           |
| Modify | `apps/api/src/modules/people/application/commands/trigger-offboarding.handler.ts` — use facade                        |
| Modify | `apps/api/src/modules/people/application/commands/reject-offboarding.handler.ts` — use facade                         |
| Modify | `apps/api/src/modules/people/application/commands/approve-profile-change.handler.ts` — use facade                     |
| Modify | `apps/api/src/modules/people/application/commands/complete-task.handler.ts` — use facade                              |
| Modify | `apps/api/src/modules/identity/infrastructure/queries/drizzle-local-user-query.service.ts` — use `KernelQueryFacade`  |

---

## Implementation Order

**Phase 1 — Create `@future/core` (no dependencies)**

1. `turbo gen workspace` → `packages/core`
2. Write `domain-exception.ts`, types files, `index.ts`
3. `bun run --filter @future/core build`
4. Unit tests for `DomainException`

**Phase 2 — Migrate DomainException + shared types (depends on Phase 1)**

5. Update kernel entity files to import from `@future/core`
6. Update kernel `domain.exception.ts` to re-export from `@future/core`
7. Update all 10 files importing `DomainException` — change import path
8. Update 4 files importing `RoleKeyValue`/`ScopeTypeValue`/`ActorType`/`ActorStatus`
9. Run full test suite — no behavior change, just import paths

**Phase 3 — Kernel facade expansion (depends on Phase 2)**

10. Expand `KernelAuditFacade` — add `queryAuditLog`, `exportAuditLog`
11. Create `KernelActorFacade` — `createActor`, `deactivateActor`, `grantRole`, `revokeRole`
12. Expand `KernelQueryFacade` — add `getLocalUsersWithActors`
13. Create `GetLocalUsersWithActorsQuery` + handler in kernel
14. Write tests for all new facade methods
15. Update `kernel.module.ts` exports

**Phase 4 — Migrate callers to facades (depends on Phase 3)**

16. Update admin module audit queries to use `KernelAuditFacade`
17. Update identity command handlers to use `KernelActorFacade`
18. Update people command handlers to use `KernelActorFacade`
19. Update identity's `drizzle-local-user-query.service.ts` to use `KernelQueryFacade`
20. Update people router to use `KernelAuditFacade` instead of direct repo import
21. Run full test suite — behavior should be identical
22. Remove unused imports and verify no remaining cross-module violations

**Phase 5 — Verify (depends on Phase 4)**

23. Grep for any remaining `../kernel/domain/` or `../kernel/infrastructure/` imports from non-kernel modules
24. Grep for any remaining kernel repository Symbol imports from non-kernel modules
25. Zero violations = done

---

## Pattern Reference

Follow `modules/people/` for module patterns. For the new `KernelActorFacade`, follow the existing `KernelAuditFacade` pattern:

- Facade: `application/facades/kernel-audit.facade.ts`
- Module export: `kernel.module.ts` exports array

For `@future/core` package, follow `@future/event-contracts` as the reference:

- Zero runtime dependencies
- Pure TypeScript types + one abstract class
- Simple barrel export from `index.ts`

---

## Verification Criteria

You know the refactoring is complete when:

1. **`@future/core` builds**: `bun run --filter @future/core build` succeeds
2. **No cross-module domain imports**: `grep -r "kernel/domain/" apps/api/src/modules/{identity,people,projects,agents,admin}/ --include="*.ts"` returns zero results (excluding kernel's own files)
3. **No cross-module infrastructure imports**: `grep -r "kernel/infrastructure/" apps/api/src/modules/{identity,people,projects,agents,admin}/ --include="*.ts"` returns zero results
4. **No direct kernel repository imports**: `grep -r "AUDIT_EVENT_REPOSITORY\|OUTBOX_EVENT_REPOSITORY\|TENANT_REPOSITORY" apps/api/src/modules/{identity,people,projects,agents,admin}/ --include="*.ts"` returns zero results
5. **KernelActorFacade works**: Create actor via facade → actor exists in DB. Deactivate → status changes. Grant role → role grant exists.
6. **KernelAuditFacade expanded**: `queryAuditLog` returns paginated results. `exportAuditLog` returns full list.
7. **KernelQueryFacade expanded**: `getLocalUsersWithActors` returns users with actor details, same data as the old direct query.
8. **All existing tests pass**: No behavior changes — only import paths and method call sites changed.
9. **New facade tests pass**: Each new facade method has unit tests covering happy path + error cases.
10. **Identity module works end-to-end**: invite-local-user, run-directory-sync, create-system-actor all work through facades.
