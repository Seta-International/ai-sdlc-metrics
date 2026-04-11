# Access Control 04 — Permission Enforcement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire permission checks into every tRPC procedure via middleware + meta declarations, with audit logging for denied access.

**Architecture:** tRPC middleware reads `.meta({ permission })` from each procedure and calls `canDo()`. Simple role-level checks happen in middleware; resource-scoped checks happen in handlers. All denials logged to `audit_event`.

**Tech Stack:** tRPC, NestJS, vitest

**Depends on:** Plan 01 (`canDo()` on `KernelQueryFacade`), Plan 03 (`protectedProcedure` + auth context with `actorId` / `tenantId`)
**Blocks:** Plan 05 (Admin UI needs permission-protected endpoints)

**Spec:** `docs/superpowers/specs/2026-04-11-access-control-strategy-design.md` — Section 4

**Status:** not started

---

## Context: Current State of the Codebase

**tRPC init** (`apps/api/src/common/trpc/trpc-init.ts`):

```typescript
import { initTRPC } from '@trpc/server'
const t = initTRPC.create()
export const router = t.router
export const publicProcedure = t.procedure
```

After Plan 03, this file will also define a `TrpcContext` type (containing `actorId`, `tenantId`) and export `protectedProcedure` with auth middleware. This plan builds on that foundation.

**KernelQueryFacade** (`apps/api/src/modules/kernel/application/facades/kernel-query.facade.ts`): After Plan 01, it will have `canDo()`:

```typescript
canDo(actorId: string, permission: string, context: {
  tenantId: string
  scopeType?: 'global' | 'department' | 'project' | 'account'
  scopeId?: string
  resourceOwnerId?: string
}): Promise<boolean>
```

**Audit event repository** (`apps/api/src/modules/kernel/domain/repositories/audit-event.repository.port.ts`):

```typescript
export const AUDIT_EVENT_REPOSITORY = Symbol('IAuditEventRepository')
export interface IAuditEventRepository {
  insert(data: {
    tenantId: string
    actorId: string
    eventType: string
    module: string
    subjectId: string
    payload: unknown
  }): Promise<void>
}
```

Exported from `KernelModule` via `exports: [KernelQueryFacade, AUDIT_EVENT_REPOSITORY, OUTBOX_EVENT_REPOSITORY]`.

**Kernel router** (`apps/api/src/modules/kernel/interface/trpc/kernel.router.ts`):

```typescript
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
export const kernelRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' })),
})
```

**People router** (`apps/api/src/modules/people/interface/trpc/people.router.ts`):

```typescript
import { router } from '../../../../common/trpc/trpc-init'
export const peopleRouter = router({
  // TODO: add procedures for people module
})
```

---

## Task 1: Add tRPC Meta Type with Permission Field

**Files:**

- Modify: `apps/api/src/common/trpc/trpc-init.ts`
- Create: `apps/api/src/common/trpc/trpc-init.spec.ts`

This task extends the tRPC initialization to support typed meta with a `permission` field. After Plan 03, `trpc-init.ts` will already have a context type. This task adds the meta type on top.

- [ ] **Step 1: Write test for meta type support**

Create `apps/api/src/common/trpc/trpc-init.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { router, publicProcedure } from './trpc-init'

describe('trpc-init', () => {
  it('should allow creating a procedure with permission meta', () => {
    const testRouter = router({
      test: publicProcedure.meta({ permission: 'people:profile:read' }).query(() => 'ok'),
    })

    expect(testRouter).toBeDefined()
  })

  it('should allow creating a procedure without permission meta', () => {
    const testRouter = router({
      test: publicProcedure.query(() => 'ok'),
    })

    expect(testRouter).toBeDefined()
  })

  it('should allow creating a procedure with empty meta', () => {
    const testRouter = router({
      test: publicProcedure.meta({}).query(() => 'ok'),
    })

    expect(testRouter).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd apps/api && bunx vitest run src/common/trpc/trpc-init.spec.ts
```

The test should fail because `publicProcedure.meta()` does not accept `{ permission }` — tRPC's default meta type is `object` (empty), and `.meta({ permission: '...' })` will cause a TypeScript error.

- [ ] **Step 3: Update trpc-init.ts with meta type**

Modify `apps/api/src/common/trpc/trpc-init.ts`:

```typescript
import { initTRPC } from '@trpc/server'

/**
 * Meta type for tRPC procedures.
 * permission: the permission key required to access this procedure.
 * If not set, the procedure is accessible to any authenticated user
 * (or public, if using publicProcedure).
 */
export interface TrpcMeta {
  permission?: string
}

/**
 * tRPC context injected by auth middleware (Plan 03).
 * actorId and tenantId are set after JWT verification.
 */
export interface TrpcContext {
  actorId: string
  tenantId: string
}

const t = initTRPC.meta<TrpcMeta>().context<TrpcContext>().create()

export const router = t.router
export const publicProcedure = t.procedure
export const middleware = t.middleware
```

Note: Plan 03 will have already added `TrpcContext` and `.context<TrpcContext>()`. If it has, merge the meta type addition into the existing code. The key change this task makes is adding `.meta<TrpcMeta>()` to the `initTRPC` chain and exporting `TrpcMeta` and `middleware`.

- [ ] **Step 4: Run test to verify pass**

```bash
cd apps/api && bunx vitest run src/common/trpc/trpc-init.spec.ts
```

- [ ] **Step 5: Run typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

Fix any type errors in existing routers caused by the context/meta type changes. The `kernelRouter` uses `publicProcedure` which should continue to work. If any router procedure now requires context, update it.

- [ ] **Step 6: Commit**

```
feat(trpc): add TrpcMeta type with permission field to tRPC init
```

---

## Task 2: Create Permission Middleware

**Files:**

- Create: `apps/api/src/common/trpc/permission.middleware.ts`
- Create: `apps/api/src/common/trpc/permission.middleware.spec.ts`

The permission middleware reads `meta.permission` from the procedure. If not set, it passes through (the procedure does not require a specific permission). If set, it calls `kernelQueryFacade.canDo()` and throws `FORBIDDEN` if denied. On denial, it writes an `audit_event`.

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/common/trpc/permission.middleware.spec.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { createPermissionMiddleware } from './permission.middleware'
import type { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import type { IAuditEventRepository } from '../../modules/kernel/domain/repositories/audit-event.repository.port'

const ACTOR_ID = '01900000-0000-7000-8000-000000000001'
const TENANT_ID = '01900000-0000-7000-8000-000000000002'

describe('permissionMiddleware', () => {
  let kernelFacade: { canDo: ReturnType<typeof vi.fn> }
  let auditRepo: { insert: ReturnType<typeof vi.fn> }
  let nextFn: ReturnType<typeof vi.fn>

  beforeEach(() => {
    kernelFacade = {
      canDo: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn().mockResolvedValue(undefined),
    }
    nextFn = vi.fn().mockResolvedValue({ ok: true })
  })

  function callMiddleware(meta: { permission?: string } | undefined) {
    const mw = createPermissionMiddleware(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo as unknown as IAuditEventRepository,
    )
    return mw({
      ctx: { actorId: ACTOR_ID, tenantId: TENANT_ID },
      meta,
      next: nextFn,
      type: 'query' as const,
      path: 'people.getProfile',
      input: undefined,
      rawInput: undefined,
    } as any)
  }

  it('should pass through when no meta is set', async () => {
    await callMiddleware(undefined)
    expect(nextFn).toHaveBeenCalled()
    expect(kernelFacade.canDo).not.toHaveBeenCalled()
  })

  it('should pass through when meta has no permission', async () => {
    await callMiddleware({})
    expect(nextFn).toHaveBeenCalled()
    expect(kernelFacade.canDo).not.toHaveBeenCalled()
  })

  it('should pass through when permission is granted', async () => {
    kernelFacade.canDo.mockResolvedValue(true)

    await callMiddleware({ permission: 'people:profile:read' })

    expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'people:profile:read', {
      tenantId: TENANT_ID,
    })
    expect(nextFn).toHaveBeenCalled()
    expect(auditRepo.insert).not.toHaveBeenCalled()
  })

  it('should throw FORBIDDEN when permission is denied', async () => {
    kernelFacade.canDo.mockResolvedValue(false)

    await expect(callMiddleware({ permission: 'people:profile:update' })).rejects.toThrow(TRPCError)

    try {
      await callMiddleware({ permission: 'people:profile:update' })
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError)
      expect((error as TRPCError).code).toBe('FORBIDDEN')
    }

    expect(nextFn).not.toHaveBeenCalled()
  })

  it('should write audit_event on denial', async () => {
    kernelFacade.canDo.mockResolvedValue(false)

    try {
      await callMiddleware({ permission: 'admin:role:manage' })
    } catch {
      // expected
    }

    expect(auditRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      eventType: 'permission_denied',
      module: 'kernel',
      subjectId: ACTOR_ID,
      payload: {
        permission: 'admin:role:manage',
        path: 'people.getProfile',
        result: 'denied',
      },
    })
  })

  it('should not write audit_event on success', async () => {
    kernelFacade.canDo.mockResolvedValue(true)

    await callMiddleware({ permission: 'people:profile:read' })

    expect(auditRepo.insert).not.toHaveBeenCalled()
  })

  it('should not call next when permission is denied', async () => {
    kernelFacade.canDo.mockResolvedValue(false)

    try {
      await callMiddleware({ permission: 'people:profile:read' })
    } catch {
      // expected
    }

    expect(nextFn).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd apps/api && bunx vitest run src/common/trpc/permission.middleware.spec.ts
```

- [ ] **Step 3: Implement permission middleware**

Create `apps/api/src/common/trpc/permission.middleware.ts`:

```typescript
import { TRPCError } from '@trpc/server'
import type { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import type { IAuditEventRepository } from '../../modules/kernel/domain/repositories/audit-event.repository.port'
import type { TrpcContext, TrpcMeta } from './trpc-init'

/**
 * Creates a tRPC middleware function that checks permissions.
 *
 * Reads `meta.permission` from the procedure definition.
 * - If not set, passes through (no permission required).
 * - If set, calls `kernelQueryFacade.canDo()`.
 * - If denied, writes audit_event and throws FORBIDDEN.
 *
 * Usage:
 *   const permissionMw = createPermissionMiddleware(kernelFacade, auditRepo)
 *   export const permissionProtectedProcedure = protectedProcedure.use(permissionMw)
 */
export function createPermissionMiddleware(
  kernelFacade: KernelQueryFacade,
  auditRepo: IAuditEventRepository,
) {
  return async function permissionMiddleware(opts: {
    ctx: TrpcContext
    meta: TrpcMeta | undefined
    next: (opts: { ctx: TrpcContext }) => Promise<any>
    path: string
    type: string
    input: unknown
    rawInput: unknown
  }) {
    const { ctx, meta, next, path } = opts

    if (!meta?.permission) {
      return next({ ctx })
    }

    const allowed = await kernelFacade.canDo(ctx.actorId, meta.permission, {
      tenantId: ctx.tenantId,
    })

    if (!allowed) {
      await auditRepo.insert({
        tenantId: ctx.tenantId,
        actorId: ctx.actorId,
        eventType: 'permission_denied',
        module: 'kernel',
        subjectId: ctx.actorId,
        payload: {
          permission: meta.permission,
          path,
          result: 'denied',
        },
      })

      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Permission denied: ${meta.permission}`,
      })
    }

    return next({ ctx })
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd apps/api && bunx vitest run src/common/trpc/permission.middleware.spec.ts
```

- [ ] **Step 5: Run typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

- [ ] **Step 6: Commit**

```
feat(trpc): add permission middleware with audit logging on denial
```

---

## Task 3: Create Scope-Aware Permission Check Helper

**Files:**

- Create: `apps/api/src/common/auth/check-permission.ts`
- Create: `apps/api/src/common/auth/check-permission.spec.ts`

This is a helper function for handler-level permission checks. When the required scope depends on the resource being acted on (e.g., the department of the target employee), the middleware cannot know the scope at route declaration time. The handler fetches the resource, determines the scope, and calls this helper.

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/common/auth/check-permission.spec.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { checkPermission } from './check-permission'
import type { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import type { IAuditEventRepository } from '../../modules/kernel/domain/repositories/audit-event.repository.port'

const ACTOR_ID = '01900000-0000-7000-8000-000000000001'
const TENANT_ID = '01900000-0000-7000-8000-000000000002'
const DEPARTMENT_ID = '01900000-0000-7000-8000-000000000003'

describe('checkPermission', () => {
  let kernelFacade: { canDo: ReturnType<typeof vi.fn> }
  let auditRepo: { insert: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    kernelFacade = {
      canDo: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('should resolve when permission is granted', async () => {
    kernelFacade.canDo.mockResolvedValue(true)

    await expect(
      checkPermission(
        kernelFacade as unknown as KernelQueryFacade,
        auditRepo as unknown as IAuditEventRepository,
        {
          actorId: ACTOR_ID,
          tenantId: TENANT_ID,
          permission: 'people:profile:update',
          scopeType: 'department',
          scopeId: DEPARTMENT_ID,
        },
      ),
    ).resolves.toBeUndefined()

    expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'people:profile:update', {
      tenantId: TENANT_ID,
      scopeType: 'department',
      scopeId: DEPARTMENT_ID,
    })
  })

  it('should throw FORBIDDEN when permission is denied', async () => {
    kernelFacade.canDo.mockResolvedValue(false)

    await expect(
      checkPermission(
        kernelFacade as unknown as KernelQueryFacade,
        auditRepo as unknown as IAuditEventRepository,
        {
          actorId: ACTOR_ID,
          tenantId: TENANT_ID,
          permission: 'people:profile:update',
          scopeType: 'department',
          scopeId: DEPARTMENT_ID,
        },
      ),
    ).rejects.toThrow(TRPCError)
  })

  it('should throw with FORBIDDEN code', async () => {
    kernelFacade.canDo.mockResolvedValue(false)

    try {
      await checkPermission(
        kernelFacade as unknown as KernelQueryFacade,
        auditRepo as unknown as IAuditEventRepository,
        {
          actorId: ACTOR_ID,
          tenantId: TENANT_ID,
          permission: 'people:profile:update',
        },
      )
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as TRPCError).code).toBe('FORBIDDEN')
    }
  })

  it('should write audit_event on denial', async () => {
    kernelFacade.canDo.mockResolvedValue(false)

    try {
      await checkPermission(
        kernelFacade as unknown as KernelQueryFacade,
        auditRepo as unknown as IAuditEventRepository,
        {
          actorId: ACTOR_ID,
          tenantId: TENANT_ID,
          permission: 'time:leave:approve',
          scopeType: 'department',
          scopeId: DEPARTMENT_ID,
        },
      )
    } catch {
      // expected
    }

    expect(auditRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      eventType: 'permission_denied',
      module: 'kernel',
      subjectId: ACTOR_ID,
      payload: {
        permission: 'time:leave:approve',
        scopeType: 'department',
        scopeId: DEPARTMENT_ID,
        result: 'denied',
      },
    })
  })

  it('should not write audit_event on success', async () => {
    kernelFacade.canDo.mockResolvedValue(true)

    await checkPermission(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo as unknown as IAuditEventRepository,
      {
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        permission: 'people:profile:read',
      },
    )

    expect(auditRepo.insert).not.toHaveBeenCalled()
  })

  it('should pass resourceOwnerId for self-permission checks', async () => {
    kernelFacade.canDo.mockResolvedValue(true)

    await checkPermission(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo as unknown as IAuditEventRepository,
      {
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        permission: 'people:profile:self:read',
        resourceOwnerId: ACTOR_ID,
      },
    )

    expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'people:profile:self:read', {
      tenantId: TENANT_ID,
      resourceOwnerId: ACTOR_ID,
    })
  })

  it('should work with minimal context (no scope)', async () => {
    kernelFacade.canDo.mockResolvedValue(true)

    await checkPermission(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo as unknown as IAuditEventRepository,
      {
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        permission: 'admin:role:manage',
      },
    )

    expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'admin:role:manage', {
      tenantId: TENANT_ID,
    })
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd apps/api && bunx vitest run src/common/auth/check-permission.spec.ts
```

- [ ] **Step 3: Implement check-permission helper**

Create `apps/api/src/common/auth/check-permission.ts`:

```typescript
import { TRPCError } from '@trpc/server'
import type { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import type { IAuditEventRepository } from '../../modules/kernel/domain/repositories/audit-event.repository.port'

export interface CheckPermissionParams {
  actorId: string
  tenantId: string
  permission: string
  scopeType?: 'global' | 'department' | 'project' | 'account'
  scopeId?: string
  resourceOwnerId?: string
}

/**
 * Handler-level permission check for resource-scoped operations.
 *
 * Use this when the scope depends on the resource being acted on
 * and cannot be determined at route declaration time.
 *
 * Example: approving a leave request requires checking whether
 * the actor has 'time:leave:approve' scoped to the employee's department.
 * The middleware cannot know the department until the handler fetches the resource.
 *
 * Throws TRPCError with code FORBIDDEN if denied.
 * Writes audit_event on denial.
 */
export async function checkPermission(
  kernelFacade: KernelQueryFacade,
  auditRepo: IAuditEventRepository,
  params: CheckPermissionParams,
): Promise<void> {
  const { actorId, tenantId, permission, scopeType, scopeId, resourceOwnerId } = params

  const context: {
    tenantId: string
    scopeType?: 'global' | 'department' | 'project' | 'account'
    scopeId?: string
    resourceOwnerId?: string
  } = { tenantId }

  if (scopeType !== undefined) {
    context.scopeType = scopeType
  }
  if (scopeId !== undefined) {
    context.scopeId = scopeId
  }
  if (resourceOwnerId !== undefined) {
    context.resourceOwnerId = resourceOwnerId
  }

  const allowed = await kernelFacade.canDo(actorId, permission, context)

  if (!allowed) {
    await auditRepo.insert({
      tenantId,
      actorId,
      eventType: 'permission_denied',
      module: 'kernel',
      subjectId: actorId,
      payload: {
        permission,
        ...(scopeType !== undefined && { scopeType }),
        ...(scopeId !== undefined && { scopeId }),
        result: 'denied',
      },
    })

    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Permission denied: ${permission}`,
    })
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd apps/api && bunx vitest run src/common/auth/check-permission.spec.ts
```

- [ ] **Step 5: Run typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

- [ ] **Step 6: Commit**

```
feat(auth): add handler-level checkPermission helper with audit logging
```

---

## Task 4: Wire Permission Middleware into Procedure Chain

**Files:**

- Modify: `apps/api/src/common/trpc/trpc-init.ts`
- Create: `apps/api/src/common/trpc/create-protected-procedures.ts`
- Create: `apps/api/src/common/trpc/create-protected-procedures.spec.ts`

This task creates the `permissionProtectedProcedure` that chains auth middleware (from Plan 03) with the permission middleware. Since the permission middleware needs `KernelQueryFacade` and `IAuditEventRepository` (NestJS injectables), we create a factory function that accepts these dependencies and returns the wired procedure.

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/common/trpc/create-protected-procedures.spec.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { createProtectedProcedures } from './create-protected-procedures'
import type { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import type { IAuditEventRepository } from '../../modules/kernel/domain/repositories/audit-event.repository.port'
import { router } from './trpc-init'

const ACTOR_ID = '01900000-0000-7000-8000-000000000001'
const TENANT_ID = '01900000-0000-7000-8000-000000000002'

describe('createProtectedProcedures', () => {
  let kernelFacade: { canDo: ReturnType<typeof vi.fn> }
  let auditRepo: { insert: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    kernelFacade = {
      canDo: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('should create permissionProtectedProcedure that checks permissions', () => {
    const { permissionProtectedProcedure } = createProtectedProcedures(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo as unknown as IAuditEventRepository,
    )

    expect(permissionProtectedProcedure).toBeDefined()
  })

  it('should allow building a router with permission meta', () => {
    const { permissionProtectedProcedure } = createProtectedProcedures(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo as unknown as IAuditEventRepository,
    )

    const testRouter = router({
      test: permissionProtectedProcedure
        .meta({ permission: 'people:profile:read' })
        .query(() => 'ok'),
    })

    expect(testRouter).toBeDefined()
  })

  it('should allow building a router without permission meta', () => {
    const { permissionProtectedProcedure } = createProtectedProcedures(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo as unknown as IAuditEventRepository,
    )

    const testRouter = router({
      test: permissionProtectedProcedure.query(() => 'ok'),
    })

    expect(testRouter).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd apps/api && bunx vitest run src/common/trpc/create-protected-procedures.spec.ts
```

- [ ] **Step 3: Implement create-protected-procedures factory**

Create `apps/api/src/common/trpc/create-protected-procedures.ts`:

```typescript
import type { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import type { IAuditEventRepository } from '../../modules/kernel/domain/repositories/audit-event.repository.port'
import { createPermissionMiddleware } from './permission.middleware'
import { publicProcedure, middleware } from './trpc-init'

/**
 * Factory that creates permission-aware tRPC procedures.
 *
 * Call this once during app bootstrap, passing NestJS-injected dependencies.
 * The returned `permissionProtectedProcedure` chains:
 *   1. Auth middleware (from Plan 03 — validates JWT, injects actorId/tenantId)
 *   2. Permission middleware (this plan — checks canDo() based on meta.permission)
 *
 * Usage in routers:
 *   const { permissionProtectedProcedure } = createProtectedProcedures(facade, auditRepo)
 *
 *   export const peopleRouter = router({
 *     getProfile: permissionProtectedProcedure
 *       .meta({ permission: 'people:profile:read' })
 *       .input(z.object({ actorId: z.string() }))
 *       .query(({ ctx, input }) => { ... }),
 *   })
 */
export function createProtectedProcedures(
  kernelFacade: KernelQueryFacade,
  auditRepo: IAuditEventRepository,
) {
  const permissionMw = middleware(async (opts) => {
    const mw = createPermissionMiddleware(kernelFacade, auditRepo)
    return mw(opts as any)
  })

  // After Plan 03, replace publicProcedure with protectedProcedure here
  // so the chain becomes: auth -> permission -> handler
  const permissionProtectedProcedure = publicProcedure.use(permissionMw)

  return {
    permissionProtectedProcedure,
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd apps/api && bunx vitest run src/common/trpc/create-protected-procedures.spec.ts
```

- [ ] **Step 5: Run typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

- [ ] **Step 6: Commit**

```
feat(trpc): add createProtectedProcedures factory for permission-aware procedures
```

---

## Task 5: Retrofit Kernel tRPC Router with Permissions

**Files:**

- Modify: `apps/api/src/modules/kernel/interface/trpc/kernel.router.ts`
- Create: `apps/api/src/modules/kernel/interface/trpc/kernel.router.spec.ts`

Add `.meta({ permission })` to kernel procedures. The `health` endpoint stays as `publicProcedure` (no auth needed). Role management endpoints require `admin:role:manage`.

- [ ] **Step 1: Write tests for kernel router permission declarations**

Create `apps/api/src/modules/kernel/interface/trpc/kernel.router.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { TRPCError } from '@trpc/server'
import { createKernelRouter } from './kernel.router'
import { router } from '../../../../common/trpc/trpc-init'
import type { KernelQueryFacade } from '../../application/facades/kernel-query.facade'
import type { IAuditEventRepository } from '../../domain/repositories/audit-event.repository.port'
import { createProtectedProcedures } from '../../../../common/trpc/create-protected-procedures'

const ACTOR_ID = '01900000-0000-7000-8000-000000000001'
const TENANT_ID = '01900000-0000-7000-8000-000000000002'

describe('kernelRouter', () => {
  function setup(canDo: boolean) {
    const kernelFacade = {
      canDo: vi.fn().mockResolvedValue(canDo),
      getRoleGrants: vi.fn().mockResolvedValue([]),
      getActor: vi.fn().mockResolvedValue(null),
    }
    const auditRepo = {
      insert: vi.fn().mockResolvedValue(undefined),
    }
    const { permissionProtectedProcedure } = createProtectedProcedures(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo as unknown as IAuditEventRepository,
    )

    const kernelRouter = createKernelRouter(permissionProtectedProcedure)

    return { kernelRouter, kernelFacade, auditRepo }
  }

  it('should have a health endpoint that works without auth', async () => {
    const { kernelRouter } = setup(false)
    const caller = router({ kernel: kernelRouter }).createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    })

    const result = await caller.kernel.health()
    expect(result).toEqual({ status: 'ok' })
  })

  it('should have a getRoleGrants endpoint that requires admin:role:read', async () => {
    const { kernelRouter, kernelFacade } = setup(true)
    kernelFacade.getRoleGrants.mockResolvedValue([])

    const caller = router({ kernel: kernelRouter }).createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    })

    const result = await caller.kernel.getRoleGrants({ actorId: ACTOR_ID })
    expect(result).toEqual([])
    expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'admin:role:read', {
      tenantId: TENANT_ID,
    })
  })

  it('should deny getRoleGrants when permission is not granted', async () => {
    const { kernelRouter } = setup(false)

    const caller = router({ kernel: kernelRouter }).createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    })

    await expect(caller.kernel.getRoleGrants({ actorId: ACTOR_ID })).rejects.toThrow(TRPCError)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd apps/api && bunx vitest run src/modules/kernel/interface/trpc/kernel.router.spec.ts
```

- [ ] **Step 3: Update kernel router**

Modify `apps/api/src/modules/kernel/interface/trpc/kernel.router.ts`:

```typescript
import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { KernelQueryFacade } from '../../application/facades/kernel-query.facade'

/**
 * Creates the kernel router with permission-protected procedures.
 *
 * Health endpoint remains public. Role management endpoints require permissions.
 * The permissionProtectedProcedure is injected so the router does not depend
 * on NestJS DI directly.
 */
export function createKernelRouter(
  permissionProtectedProcedure: any,
  kernelFacade?: KernelQueryFacade,
) {
  return router({
    // Public: no auth, no permission
    health: publicProcedure.query(() => ({ status: 'ok' })),

    // Protected: requires admin:role:read
    getRoleGrants: permissionProtectedProcedure
      .meta({ permission: 'admin:role:read' })
      .input(z.object({ actorId: z.string().uuid() }))
      .query(async ({ input }: { input: { actorId: string }; ctx: { tenantId: string } }) => {
        if (!kernelFacade) {
          throw new Error('KernelQueryFacade not injected')
        }
        return kernelFacade.getRoleGrants(input.actorId, '')
      }),
  })
}

// Backward-compatible default export for existing app-router.ts
// After Plan 03 fully wires DI, this will be replaced by the factory call
export const kernelRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' })),
})
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd apps/api && bunx vitest run src/modules/kernel/interface/trpc/kernel.router.spec.ts
```

- [ ] **Step 5: Run full typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

Ensure `app-router.ts` still compiles — it imports `kernelRouter` which is still exported as the backward-compatible default.

- [ ] **Step 6: Commit**

```
feat(kernel): retrofit kernel router with permission-protected procedures
```

---

## Task 6: Retrofit People tRPC Router with Permissions

**Files:**

- Modify: `apps/api/src/modules/people/interface/trpc/people.router.ts`
- Create: `apps/api/src/modules/people/interface/trpc/people.router.spec.ts`

Add tRPC procedures to the people router with `.meta({ permission })`. Demonstrates both middleware-level checks (simple role) and handler-level scope checks.

- [ ] **Step 1: Write tests for people router**

Create `apps/api/src/modules/people/interface/trpc/people.router.spec.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { createPeopleRouter } from './people.router'
import { router } from '../../../../common/trpc/trpc-init'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { PeopleQueryFacade } from '../../application/facades/people-query.facade'
import { createProtectedProcedures } from '../../../../common/trpc/create-protected-procedures'

const ACTOR_ID = '01900000-0000-7000-8000-000000000001'
const TENANT_ID = '01900000-0000-7000-8000-000000000002'
const OTHER_ACTOR_ID = '01900000-0000-7000-8000-000000000003'
const DEPARTMENT_ID = '01900000-0000-7000-8000-000000000004'

describe('peopleRouter', () => {
  let kernelFacade: {
    canDo: ReturnType<typeof vi.fn>
  }
  let auditRepo: { insert: ReturnType<typeof vi.fn> }
  let peopleFacade: {
    getProfile: ReturnType<typeof vi.fn>
    getOwnProfile: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    kernelFacade = {
      canDo: vi.fn().mockResolvedValue(true),
    }
    auditRepo = {
      insert: vi.fn().mockResolvedValue(undefined),
    }
    peopleFacade = {
      getProfile: vi.fn().mockResolvedValue({
        id: OTHER_ACTOR_ID,
        displayName: 'John Doe',
        status: 'active',
      }),
      getOwnProfile: vi.fn().mockResolvedValue({
        id: ACTOR_ID,
        displayName: 'Jane Doe',
        status: 'active',
      }),
    }
  })

  function createRouter() {
    const { permissionProtectedProcedure } = createProtectedProcedures(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo as unknown as IAuditEventRepository,
    )

    return createPeopleRouter(
      permissionProtectedProcedure,
      peopleFacade as unknown as PeopleQueryFacade,
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo as unknown as IAuditEventRepository,
    )
  }

  describe('getProfile', () => {
    it('should return profile when permission is granted', async () => {
      const peopleRouter = createRouter()
      const caller = router({ people: peopleRouter }).createCaller({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
      })

      const result = await caller.people.getProfile({ actorId: OTHER_ACTOR_ID })

      expect(result).toEqual({
        id: OTHER_ACTOR_ID,
        displayName: 'John Doe',
        status: 'active',
      })
      expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'people:profile:read', {
        tenantId: TENANT_ID,
      })
    })

    it('should deny when permission is not granted', async () => {
      kernelFacade.canDo.mockResolvedValue(false)
      const peopleRouter = createRouter()
      const caller = router({ people: peopleRouter }).createCaller({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
      })

      await expect(caller.people.getProfile({ actorId: OTHER_ACTOR_ID })).rejects.toThrow(TRPCError)
    })
  })

  describe('getOwnProfile', () => {
    it('should return own profile when permission is granted', async () => {
      const peopleRouter = createRouter()
      const caller = router({ people: peopleRouter }).createCaller({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
      })

      const result = await caller.people.getOwnProfile()

      expect(result).toEqual({
        id: ACTOR_ID,
        displayName: 'Jane Doe',
        status: 'active',
      })
      expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'people:profile:self:read', {
        tenantId: TENANT_ID,
      })
    })

    it('should deny when self-read permission is not granted', async () => {
      kernelFacade.canDo.mockResolvedValue(false)
      const peopleRouter = createRouter()
      const caller = router({ people: peopleRouter }).createCaller({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
      })

      await expect(caller.people.getOwnProfile()).rejects.toThrow(TRPCError)
    })
  })

  describe('updateProfile (handler-level scope check)', () => {
    it('should call handler-level scope check for department-scoped update', async () => {
      // First canDo call: middleware-level check for people:profile:update (passes)
      // Second canDo call: handler-level scope check for department
      kernelFacade.canDo
        .mockResolvedValueOnce(true) // middleware
        .mockResolvedValueOnce(true) // handler scope check

      peopleFacade.getProfile.mockResolvedValue({
        id: OTHER_ACTOR_ID,
        displayName: 'John Doe',
        departmentId: DEPARTMENT_ID,
        status: 'active',
      })

      const peopleRouter = createRouter()
      const caller = router({ people: peopleRouter }).createCaller({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
      })

      const result = await caller.people.updateProfile({
        actorId: OTHER_ACTOR_ID,
        displayName: 'John Updated',
      })

      expect(result).toEqual({ success: true })
      // Second call should be the handler-level scope check
      expect(kernelFacade.canDo).toHaveBeenCalledTimes(2)
      expect(kernelFacade.canDo).toHaveBeenNthCalledWith(
        2,
        ACTOR_ID,
        'people:profile:update',
        expect.objectContaining({
          tenantId: TENANT_ID,
          scopeType: 'department',
          scopeId: DEPARTMENT_ID,
        }),
      )
    })

    it('should deny at handler level when department scope check fails', async () => {
      kernelFacade.canDo
        .mockResolvedValueOnce(true) // middleware passes
        .mockResolvedValueOnce(false) // handler scope check fails

      peopleFacade.getProfile.mockResolvedValue({
        id: OTHER_ACTOR_ID,
        displayName: 'John Doe',
        departmentId: DEPARTMENT_ID,
        status: 'active',
      })

      const peopleRouter = createRouter()
      const caller = router({ people: peopleRouter }).createCaller({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
      })

      await expect(
        caller.people.updateProfile({
          actorId: OTHER_ACTOR_ID,
          displayName: 'John Updated',
        }),
      ).rejects.toThrow(TRPCError)
    })
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd apps/api && bunx vitest run src/modules/people/interface/trpc/people.router.spec.ts
```

- [ ] **Step 3: Implement people router with permissions**

Modify `apps/api/src/modules/people/interface/trpc/people.router.ts`:

```typescript
import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { TrpcContext } from '../../../../common/trpc/trpc-init'
import { checkPermission } from '../../../../common/auth/check-permission'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { PeopleQueryFacade } from '../../application/facades/people-query.facade'

/**
 * Creates the people router with permission-protected procedures.
 *
 * Demonstrates two permission enforcement patterns:
 *
 * 1. Middleware-level: `.meta({ permission })` — checked before handler runs.
 *    Used for simple role-level checks (e.g., "can this user read any profile?").
 *
 * 2. Handler-level: `checkPermission()` — checked inside the handler.
 *    Used when the scope depends on the resource (e.g., "can this user update
 *    a profile in department X?"). The handler fetches the resource first to
 *    determine the scope, then calls checkPermission.
 */
export function createPeopleRouter(
  permissionProtectedProcedure: any,
  peopleFacade: PeopleQueryFacade,
  kernelFacade: KernelQueryFacade,
  auditRepo: IAuditEventRepository,
) {
  return router({
    // Middleware-level check: requires people:profile:read
    getProfile: permissionProtectedProcedure
      .meta({ permission: 'people:profile:read' })
      .input(z.object({ actorId: z.string().uuid() }))
      .query(async ({ ctx, input }: { ctx: TrpcContext; input: { actorId: string } }) => {
        return peopleFacade.getProfile(input.actorId, ctx.tenantId)
      }),

    // Middleware-level check: requires people:profile:self:read
    getOwnProfile: permissionProtectedProcedure
      .meta({ permission: 'people:profile:self:read' })
      .query(async ({ ctx }: { ctx: TrpcContext }) => {
        return peopleFacade.getOwnProfile(ctx.actorId, ctx.tenantId)
      }),

    // Handler-level scope check: middleware checks people:profile:update (role-level),
    // handler additionally checks department scope
    updateProfile: permissionProtectedProcedure
      .meta({ permission: 'people:profile:update' })
      .input(
        z.object({
          actorId: z.string().uuid(),
          displayName: z.string().optional(),
        }),
      )
      .mutation(
        async ({
          ctx,
          input,
        }: {
          ctx: TrpcContext
          input: { actorId: string; displayName?: string }
        }) => {
          // Fetch the target profile to determine department scope
          const profile = await peopleFacade.getProfile(input.actorId, ctx.tenantId)

          // Handler-level scope check: verify actor can update profiles
          // in the target's department
          await checkPermission(kernelFacade, auditRepo, {
            actorId: ctx.actorId,
            tenantId: ctx.tenantId,
            permission: 'people:profile:update',
            scopeType: 'department',
            scopeId: (profile as any).departmentId,
          })

          // Proceed with update (actual update logic will be in command handler)
          return { success: true }
        },
      ),
  })
}

// Backward-compatible default export for existing app-router.ts
// After DI wiring is complete, this will be replaced by the factory call
export const peopleRouter = router({
  // TODO: replace with createPeopleRouter() call from DI-wired bootstrap
})
```

- [ ] **Step 4: Add `getProfile` and `getOwnProfile` to PeopleQueryFacade**

Modify `apps/api/src/modules/people/application/facades/people-query.facade.ts`:

```typescript
import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'

@Injectable()
export class PeopleQueryFacade {
  constructor(private readonly queryBus: QueryBus) {}

  async getProfile(actorId: string, tenantId: string): Promise<any> {
    // TODO: wire to GetProfileQuery when query handler is implemented
    return null
  }

  async getOwnProfile(actorId: string, tenantId: string): Promise<any> {
    // TODO: wire to GetOwnProfileQuery when query handler is implemented
    return null
  }
}
```

- [ ] **Step 5: Run test to verify pass**

```bash
cd apps/api && bunx vitest run src/modules/people/interface/trpc/people.router.spec.ts
```

- [ ] **Step 6: Run full typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

- [ ] **Step 7: Commit**

```
feat(people): retrofit people router with permission-protected procedures
```

---

## Task 7: Integration Test — Permission Denial Writes Audit Event

**Files:**

- Create: `apps/api/src/common/trpc/permission-enforcement.integration.spec.ts`

This integration test verifies the full flow: a procedure with `.meta({ permission })` is called, the permission check fails, an audit_event is written, and a FORBIDDEN error is thrown.

- [ ] **Step 1: Write integration test**

Create `apps/api/src/common/trpc/permission-enforcement.integration.spec.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from './trpc-init'
import { createProtectedProcedures } from './create-protected-procedures'
import type { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import type { IAuditEventRepository } from '../../modules/kernel/domain/repositories/audit-event.repository.port'

const ACTOR_ID = '01900000-0000-7000-8000-000000000001'
const TENANT_ID = '01900000-0000-7000-8000-000000000002'

describe('permission enforcement integration', () => {
  let kernelFacade: { canDo: ReturnType<typeof vi.fn> }
  let auditRepo: { insert: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    kernelFacade = {
      canDo: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('should allow access when canDo returns true', async () => {
    kernelFacade.canDo.mockResolvedValue(true)

    const { permissionProtectedProcedure } = createProtectedProcedures(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo as unknown as IAuditEventRepository,
    )

    const testRouter = router({
      secret: permissionProtectedProcedure
        .meta({ permission: 'admin:secret:read' })
        .query(() => ({ data: 'top-secret' })),
    })

    const caller = testRouter.createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    })

    const result = await caller.secret()
    expect(result).toEqual({ data: 'top-secret' })
    expect(auditRepo.insert).not.toHaveBeenCalled()
  })

  it('should deny access and write audit_event when canDo returns false', async () => {
    kernelFacade.canDo.mockResolvedValue(false)

    const { permissionProtectedProcedure } = createProtectedProcedures(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo as unknown as IAuditEventRepository,
    )

    const testRouter = router({
      secret: permissionProtectedProcedure
        .meta({ permission: 'admin:secret:read' })
        .query(() => ({ data: 'top-secret' })),
    })

    const caller = testRouter.createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    })

    await expect(caller.secret()).rejects.toThrow(TRPCError)

    try {
      await caller.secret()
    } catch (error) {
      expect((error as TRPCError).code).toBe('FORBIDDEN')
      expect((error as TRPCError).message).toContain('admin:secret:read')
    }

    expect(auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        eventType: 'permission_denied',
        module: 'kernel',
        payload: expect.objectContaining({
          permission: 'admin:secret:read',
          result: 'denied',
        }),
      }),
    )
  })

  it('should skip permission check when no meta.permission is set', async () => {
    const { permissionProtectedProcedure } = createProtectedProcedures(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo as unknown as IAuditEventRepository,
    )

    const testRouter = router({
      // No .meta({ permission }) — any authenticated user can access
      open: permissionProtectedProcedure.query(() => ({ public: true })),
    })

    const caller = testRouter.createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    })

    const result = await caller.open()
    expect(result).toEqual({ public: true })
    expect(kernelFacade.canDo).not.toHaveBeenCalled()
  })

  it('should work with public procedures that have no auth context', async () => {
    const testRouter = router({
      health: publicProcedure.query(() => ({ status: 'ok' })),
    })

    const caller = testRouter.createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    })

    const result = await caller.health()
    expect(result).toEqual({ status: 'ok' })
  })

  it('should enforce permissions across multiple procedures in same router', async () => {
    kernelFacade.canDo
      .mockResolvedValueOnce(true) // first call: allowed
      .mockResolvedValueOnce(false) // second call: denied

    const { permissionProtectedProcedure } = createProtectedProcedures(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo as unknown as IAuditEventRepository,
    )

    const testRouter = router({
      read: permissionProtectedProcedure
        .meta({ permission: 'data:read' })
        .query(() => ({ read: true })),
      write: permissionProtectedProcedure
        .meta({ permission: 'data:write' })
        .mutation(() => ({ written: true })),
    })

    const caller = testRouter.createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    })

    // First call succeeds
    const readResult = await caller.read()
    expect(readResult).toEqual({ read: true })

    // Second call is denied
    await expect(caller.write()).rejects.toThrow(TRPCError)
  })
})
```

- [ ] **Step 2: Run integration test**

```bash
cd apps/api && bunx vitest run src/common/trpc/permission-enforcement.integration.spec.ts
```

All tests should pass since they exercise the full middleware chain with mocked dependencies.

- [ ] **Step 3: Run all tests to ensure nothing is broken**

```bash
cd apps/api && bunx vitest run
```

- [ ] **Step 4: Run typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

- [ ] **Step 5: Commit**

```
test(trpc): add integration tests for permission enforcement flow
```

---

## Task 8: Final Verification and Commit

- [ ] **Step 1: Run all tests**

```bash
cd apps/api && bunx vitest run
```

- [ ] **Step 2: Run typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

- [ ] **Step 3: Run lint**

```bash
cd apps/api && bunx eslint src/common/trpc/ src/common/auth/ src/modules/kernel/interface/trpc/ src/modules/people/interface/trpc/ --fix
```

- [ ] **Step 4: Verify file inventory**

All files created or modified in this plan:

| Action   | File                                                                     |
| -------- | ------------------------------------------------------------------------ |
| Modified | `apps/api/src/common/trpc/trpc-init.ts`                                  |
| Created  | `apps/api/src/common/trpc/trpc-init.spec.ts`                             |
| Created  | `apps/api/src/common/trpc/permission.middleware.ts`                      |
| Created  | `apps/api/src/common/trpc/permission.middleware.spec.ts`                 |
| Created  | `apps/api/src/common/auth/check-permission.ts`                           |
| Created  | `apps/api/src/common/auth/check-permission.spec.ts`                      |
| Created  | `apps/api/src/common/trpc/create-protected-procedures.ts`                |
| Created  | `apps/api/src/common/trpc/create-protected-procedures.spec.ts`           |
| Modified | `apps/api/src/modules/kernel/interface/trpc/kernel.router.ts`            |
| Created  | `apps/api/src/modules/kernel/interface/trpc/kernel.router.spec.ts`       |
| Modified | `apps/api/src/modules/people/interface/trpc/people.router.ts`            |
| Created  | `apps/api/src/modules/people/interface/trpc/people.router.spec.ts`       |
| Modified | `apps/api/src/modules/people/application/facades/people-query.facade.ts` |
| Created  | `apps/api/src/common/trpc/permission-enforcement.integration.spec.ts`    |

- [ ] **Step 5: Final commit if any remaining changes**

```
chore(access-control): finalize permission enforcement plan 04
```

---

## Permission Key Reference

Permissions used in this plan, for cross-referencing with Plan 01 seed data:

| Permission                 | Module | Used In             | Check Level |
| -------------------------- | ------ | ------------------- | ----------- |
| `admin:role:read`          | kernel | kernel router       | middleware  |
| `admin:role:manage`        | kernel | kernel router       | middleware  |
| `people:profile:read`      | people | people router       | middleware  |
| `people:profile:self:read` | people | people router       | middleware  |
| `people:profile:update`    | people | people router       | both        |
| `time:leave:approve`       | time   | (example in helper) | handler     |

---

## Architecture Notes

### Middleware vs Handler-Level Checks

**Middleware-level** (via `.meta({ permission })`):

- Checked before the handler runs
- No access to the resource being acted on
- Best for: "can this actor perform this action at all?" (role-level)
- Example: `people:profile:read` — can the actor read any profile?

**Handler-level** (via `checkPermission()` helper):

- Checked inside the handler, after fetching the target resource
- Has access to scope information (department, project, etc.)
- Best for: "can this actor perform this action on this specific resource?"
- Example: `people:profile:update` scoped to a department — middleware confirms the actor has the permission, handler confirms the scope matches the target profile's department

### Delegation Transparency

`canDo()` (from Plan 01) already unions the actor's own `role_grant` entries with active delegations where they are the delegatee. No code in this plan needs to be delegation-aware. Handlers call `canDo()` with the requesting actor's ID, and delegated permissions are resolved automatically.

### Audit Strategy

Only **denied** permission checks are logged by default. This avoids flooding `audit_event` with routine successful checks while still capturing security-relevant events. Sensitive operations can opt into logging successful checks by calling `auditRepo.insert()` explicitly in their handlers.
