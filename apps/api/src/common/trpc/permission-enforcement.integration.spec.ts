import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from './trpc-init'
import { createProtectedProcedures } from './create-protected-procedures'
import type { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import type { IAuditLogger } from '../auth/audit-logger.interface'
import type { TrpcContext } from './trpc-init'

const ACTOR_ID = '01900000-0000-7000-8000-000000000001'
const TENANT_ID = '01900000-0000-7000-8000-000000000002'

const makeCtx = () => ({ actorId: ACTOR_ID, tenantId: TENANT_ID }) as unknown as TrpcContext

describe('permission enforcement integration', () => {
  let kernelFacade: { canDo: ReturnType<typeof vi.fn> }
  let auditRepo: IAuditLogger & { insert: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    kernelFacade = { canDo: vi.fn() }
    auditRepo = { insert: vi.fn().mockResolvedValue(undefined) }
  })

  it('should allow access when canDo returns true', async () => {
    kernelFacade.canDo.mockResolvedValue(true)
    const { permissionProtectedProcedure } = createProtectedProcedures(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo,
    )
    const testRouter = router({
      secret: permissionProtectedProcedure
        .meta({ permission: 'admin:secret:read' })
        .query(() => ({ data: 'top-secret' })),
    })
    const caller = testRouter.createCaller(makeCtx())
    const result = await caller.secret()
    expect(result).toEqual({ data: 'top-secret' })
    expect(auditRepo.insert).not.toHaveBeenCalled()
  })

  it('should deny access and write audit_event when canDo returns false', async () => {
    kernelFacade.canDo.mockResolvedValue(false)
    const { permissionProtectedProcedure } = createProtectedProcedures(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo,
    )
    const testRouter = router({
      secret: permissionProtectedProcedure
        .meta({ permission: 'admin:secret:read' })
        .query(() => ({ data: 'top-secret' })),
    })
    const caller = testRouter.createCaller(makeCtx())
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
        payload: expect.objectContaining({ permission: 'admin:secret:read', result: 'denied' }),
      }),
    )
  })

  it('should skip permission check when no meta.permission is set', async () => {
    const { permissionProtectedProcedure } = createProtectedProcedures(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo,
    )
    const testRouter = router({
      open: permissionProtectedProcedure.query(() => ({ public: true })),
    })
    const caller = testRouter.createCaller(makeCtx())
    const result = await caller.open()
    expect(result).toEqual({ public: true })
    expect(kernelFacade.canDo).not.toHaveBeenCalled()
  })

  it('should work with public procedures that have no auth context', async () => {
    const testRouter = router({
      health: publicProcedure.query(() => ({ status: 'ok' })),
    })
    const caller = testRouter.createCaller(makeCtx())
    const result = await caller.health()
    expect(result).toEqual({ status: 'ok' })
  })

  it('should enforce permissions across multiple procedures in same router', async () => {
    kernelFacade.canDo
      .mockResolvedValueOnce(true) // first call: allowed
      .mockResolvedValueOnce(false) // second call: denied
    const { permissionProtectedProcedure } = createProtectedProcedures(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo,
    )
    const testRouter = router({
      read: permissionProtectedProcedure
        .meta({ permission: 'data:read' })
        .query(() => ({ read: true })),
      write: permissionProtectedProcedure
        .meta({ permission: 'data:write' })
        .mutation(() => ({ written: true })),
    })
    const caller = testRouter.createCaller(makeCtx())
    const readResult = await caller.read()
    expect(readResult).toEqual({ read: true })
    await expect(caller.write()).rejects.toThrow(TRPCError)
  })
})
