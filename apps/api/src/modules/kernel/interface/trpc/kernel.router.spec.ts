/* eslint-disable @typescript-eslint/no-explicit-any */
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
    const auditRepo = { insert: vi.fn().mockResolvedValue(undefined) }
    const { permissionProtectedProcedure } = createProtectedProcedures(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo as unknown as IAuditEventRepository,
    )
    const kernelRouter = createKernelRouter(
      permissionProtectedProcedure,
      kernelFacade as unknown as KernelQueryFacade,
    )
    return { kernelRouter, kernelFacade, auditRepo }
  }

  it('should have a health endpoint that works without auth', async () => {
    const { kernelRouter } = setup(false)
    const caller = router({ kernel: kernelRouter }).createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    } as any)
    const result = await (caller.kernel as any).health()
    expect(result).toEqual({ status: 'ok' })
  })

  it('should have a getRoleGrants endpoint that requires admin:role:read', async () => {
    const { kernelRouter, kernelFacade } = setup(true)
    const caller = router({ kernel: kernelRouter }).createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    } as any)
    const result = await (caller.kernel as any).getRoleGrants({ actorId: ACTOR_ID })
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
    } as any)
    await expect((caller.kernel as any).getRoleGrants({ actorId: ACTOR_ID })).rejects.toThrow(
      TRPCError,
    )
  })
})
