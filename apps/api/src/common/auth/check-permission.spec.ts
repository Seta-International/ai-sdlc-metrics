import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { checkPermission } from './check-permission'
import type { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import type { IAuditLogger } from './audit-logger.interface'

const ACTOR_ID = '01900000-0000-7000-8000-000000000001'
const TENANT_ID = '01900000-0000-7000-8000-000000000002'
const DEPARTMENT_ID = '01900000-0000-7000-8000-000000000003'

describe('checkPermission', () => {
  let kernelFacade: { canDo: ReturnType<typeof vi.fn> }
  let auditRepo: IAuditLogger & { insert: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    kernelFacade = { canDo: vi.fn() }
    auditRepo = { insert: vi.fn().mockResolvedValue(undefined) }
  })

  it('should resolve when permission is granted', async () => {
    kernelFacade.canDo.mockResolvedValue(true)
    await expect(
      checkPermission(kernelFacade as unknown as KernelQueryFacade, auditRepo, {
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        permission: 'people:profile:update',
        scopeType: 'department',
        scopeId: DEPARTMENT_ID,
      }),
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
      checkPermission(kernelFacade as unknown as KernelQueryFacade, auditRepo, {
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        permission: 'people:profile:update',
        scopeType: 'department',
        scopeId: DEPARTMENT_ID,
      }),
    ).rejects.toThrow(TRPCError)
  })

  it('should throw with FORBIDDEN code', async () => {
    kernelFacade.canDo.mockResolvedValue(false)
    try {
      await checkPermission(kernelFacade as unknown as KernelQueryFacade, auditRepo, {
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        permission: 'people:profile:update',
      })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as TRPCError).code).toBe('FORBIDDEN')
    }
  })

  it('should write audit_event on denial', async () => {
    kernelFacade.canDo.mockResolvedValue(false)
    try {
      await checkPermission(kernelFacade as unknown as KernelQueryFacade, auditRepo, {
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        permission: 'time:leave:approve',
        scopeType: 'department',
        scopeId: DEPARTMENT_ID,
      })
    } catch {
      /* expected */
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
    await checkPermission(kernelFacade as unknown as KernelQueryFacade, auditRepo, {
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
      permission: 'people:profile:read',
    })
    expect(auditRepo.insert).not.toHaveBeenCalled()
  })

  it('should pass resourceOwnerId for self-permission checks', async () => {
    kernelFacade.canDo.mockResolvedValue(true)
    await checkPermission(kernelFacade as unknown as KernelQueryFacade, auditRepo, {
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
      permission: 'people:profile:self:read',
      resourceOwnerId: ACTOR_ID,
    })
    expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'people:profile:self:read', {
      tenantId: TENANT_ID,
      resourceOwnerId: ACTOR_ID,
    })
  })

  it('should work with minimal context (no scope)', async () => {
    kernelFacade.canDo.mockResolvedValue(true)
    await checkPermission(kernelFacade as unknown as KernelQueryFacade, auditRepo, {
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
      permission: 'admin:role:manage',
    })
    expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'admin:role:manage', {
      tenantId: TENANT_ID,
    })
  })
})
