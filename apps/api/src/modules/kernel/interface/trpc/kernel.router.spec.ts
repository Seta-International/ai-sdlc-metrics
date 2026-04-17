/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest'
import { TRPCError } from '@trpc/server'
import { createKernelRouter } from './kernel.router'
import { publicProcedure, router } from '../../../../common/trpc/trpc-init'
import type { KernelQueryFacade } from '../../application/facades/kernel-query.facade'
import type { KernelAuditFacade } from '../../application/facades/kernel-audit.facade'
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
    const auditFacade = { recordEvent: vi.fn().mockResolvedValue(undefined) }
    const { permissionProtectedProcedure } = createProtectedProcedures(
      publicProcedure,
      kernelFacade as unknown as KernelQueryFacade,
      auditFacade as unknown as KernelAuditFacade,
    )
    const kernelRouter = createKernelRouter(
      permissionProtectedProcedure,
      kernelFacade as unknown as KernelQueryFacade,
    )
    return { kernelRouter, kernelFacade, auditFacade }
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

  describe('getMyPermissions', () => {
    it('returns effective permissions for the calling actor', async () => {
      const mockFacade = {
        canDo: vi.fn().mockResolvedValue(true),
        getRoleGrants: vi.fn().mockResolvedValue([]),
        getActor: vi.fn().mockResolvedValue(null),
        getEffectivePermissions: vi
          .fn()
          .mockResolvedValue(['people:profile:read', 'time:leave:self:submit']),
      } as unknown as KernelQueryFacade
      const auditFacade = { recordEvent: vi.fn().mockResolvedValue(undefined) }
      const { permissionProtectedProcedure } = createProtectedProcedures(
        publicProcedure,
        mockFacade,
        auditFacade as unknown as KernelAuditFacade,
      )
      const kernelRouter = createKernelRouter(permissionProtectedProcedure, mockFacade)
      const caller = router({ kernel: kernelRouter }).createCaller({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
      } as any)

      const result = await (caller.kernel as any).getMyPermissions()

      expect(result).toEqual(['people:profile:read', 'time:leave:self:submit'])
      expect(mockFacade.getEffectivePermissions).toHaveBeenCalledWith(ACTOR_ID, TENANT_ID)
    })

    it('returns empty array when no facade is provided', async () => {
      const mockFacade = {
        canDo: vi.fn().mockResolvedValue(true),
        getRoleGrants: vi.fn().mockResolvedValue([]),
        getActor: vi.fn().mockResolvedValue(null),
      } as unknown as KernelQueryFacade
      const auditFacade = { recordEvent: vi.fn().mockResolvedValue(undefined) }
      const { permissionProtectedProcedure } = createProtectedProcedures(
        publicProcedure,
        mockFacade,
        auditFacade as unknown as KernelAuditFacade,
      )
      const kernelRouter = createKernelRouter(permissionProtectedProcedure, undefined)
      const caller = router({ kernel: kernelRouter }).createCaller({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
      } as any)

      const result = await (caller.kernel as any).getMyPermissions()

      expect(result).toEqual([])
    })
  })
})
