/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { router } from './trpc-init'
import { createProtectedProcedures } from './create-protected-procedures'
import type { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import type { KernelAuditFacade } from '../../modules/kernel/application/facades/kernel-audit.facade'

const ACTOR_ID = '01900000-0000-7000-8000-000000000001'
const TENANT_ID = '01900000-0000-7000-8000-000000000002'

describe('Permission Enforcement Integration', () => {
  let kernelFacade: { canDo: ReturnType<typeof vi.fn> }
  let auditFacade: { recordEvent: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    kernelFacade = { canDo: vi.fn() }
    auditFacade = { recordEvent: vi.fn().mockResolvedValue(undefined) }
  })

  function buildRouter(canDo: boolean) {
    kernelFacade.canDo.mockResolvedValue(canDo)
    const { permissionProtectedProcedure } = createProtectedProcedures(
      kernelFacade as unknown as KernelQueryFacade,
      auditFacade as unknown as KernelAuditFacade,
    )
    return router({
      readResource: permissionProtectedProcedure
        .meta({ permission: 'resource:read' })
        .query(() => ({ data: 'secret' })),
      writeResource: permissionProtectedProcedure
        .meta({ permission: 'resource:write' })
        .mutation(() => ({ success: true })),
      publicResource: permissionProtectedProcedure.query(() => ({ data: 'public' })),
    })
  }

  it('allows access when canDo returns true', async () => {
    const testRouter = buildRouter(true)
    const caller = testRouter.createCaller({ actorId: ACTOR_ID, tenantId: TENANT_ID } as any)
    const result = await (caller as any).readResource()
    expect(result).toEqual({ data: 'secret' })
    expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'resource:read', {
      tenantId: TENANT_ID,
    })
  })

  it('denies access when canDo returns false', async () => {
    const testRouter = buildRouter(false)
    const caller = testRouter.createCaller({ actorId: ACTOR_ID, tenantId: TENANT_ID } as any)
    await expect((caller as any).readResource()).rejects.toThrow(TRPCError)
    try {
      await (caller as any).readResource()
    } catch (error) {
      expect((error as TRPCError).code).toBe('FORBIDDEN')
    }
  })

  it('writes audit_event on denial', async () => {
    const testRouter = buildRouter(false)
    const caller = testRouter.createCaller({ actorId: ACTOR_ID, tenantId: TENANT_ID } as any)
    try {
      await (caller as any).writeResource()
    } catch {
      /* expected */
    }
    expect(auditFacade.recordEvent).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      eventType: 'permission_denied',
      module: 'kernel',
      subjectId: ACTOR_ID,
      payload: { permission: 'resource:write', path: 'writeResource', result: 'denied' },
    })
  })

  it('does not write audit_event on success', async () => {
    const testRouter = buildRouter(true)
    const caller = testRouter.createCaller({ actorId: ACTOR_ID, tenantId: TENANT_ID } as any)
    await (caller as any).readResource()
    expect(auditFacade.recordEvent).not.toHaveBeenCalled()
  })

  it('allows access to procedures with no permission meta', async () => {
    const testRouter = buildRouter(false) // canDo=false but no meta on publicResource
    const caller = testRouter.createCaller({ actorId: ACTOR_ID, tenantId: TENANT_ID } as any)
    const result = await (caller as any).publicResource()
    expect(result).toEqual({ data: 'public' })
    expect(kernelFacade.canDo).not.toHaveBeenCalled()
  })

  it('does not call canDo for procedures without permission meta', async () => {
    const testRouter = buildRouter(true)
    const caller = testRouter.createCaller({ actorId: ACTOR_ID, tenantId: TENANT_ID } as any)
    await (caller as any).publicResource()
    expect(kernelFacade.canDo).not.toHaveBeenCalled()
  })
})
