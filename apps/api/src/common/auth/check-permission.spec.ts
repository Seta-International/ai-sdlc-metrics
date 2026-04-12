import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { checkPermission } from './check-permission'
import type { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import type { IAuditEventRepository } from '../../modules/kernel/domain/repositories/audit-event.repository.port'

const ACTOR_ID = '01900000-0000-7000-8000-000000000001'
const TENANT_ID = '01900000-0000-7000-8000-000000000002'
const DEPT_ID = '01900000-0000-7000-8000-000000000003'

describe('checkPermission', () => {
  let kernelFacade: { canDo: ReturnType<typeof vi.fn> }
  let auditRepo: { insert: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    kernelFacade = { canDo: vi.fn() }
    auditRepo = { insert: vi.fn().mockResolvedValue(undefined) }
  })

  it('resolves when permission is granted (with scopeType/scopeId in canDo call)', async () => {
    kernelFacade.canDo.mockResolvedValue(true)
    await expect(
      checkPermission(
        kernelFacade as unknown as KernelQueryFacade,
        auditRepo as unknown as IAuditEventRepository,
        {
          actorId: ACTOR_ID,
          tenantId: TENANT_ID,
          permission: 'people:profile:read',
          scopeType: 'department',
          scopeId: DEPT_ID,
        },
      ),
    ).resolves.toBeUndefined()
    expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'people:profile:read', {
      tenantId: TENANT_ID,
      scopeType: 'department',
      scopeId: DEPT_ID,
    })
  })

  it('throws FORBIDDEN when denied', async () => {
    kernelFacade.canDo.mockResolvedValue(false)
    await expect(
      checkPermission(
        kernelFacade as unknown as KernelQueryFacade,
        auditRepo as unknown as IAuditEventRepository,
        { actorId: ACTOR_ID, tenantId: TENANT_ID, permission: 'people:profile:update' },
      ),
    ).rejects.toThrow(TRPCError)
  })

  it('throws with FORBIDDEN code', async () => {
    kernelFacade.canDo.mockResolvedValue(false)
    try {
      await checkPermission(
        kernelFacade as unknown as KernelQueryFacade,
        auditRepo as unknown as IAuditEventRepository,
        { actorId: ACTOR_ID, tenantId: TENANT_ID, permission: 'people:profile:update' },
      )
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError)
      expect((error as TRPCError).code).toBe('FORBIDDEN')
    }
  })

  it('writes audit_event on denial (with scopeType/scopeId in payload)', async () => {
    kernelFacade.canDo.mockResolvedValue(false)
    try {
      await checkPermission(
        kernelFacade as unknown as KernelQueryFacade,
        auditRepo as unknown as IAuditEventRepository,
        {
          actorId: ACTOR_ID,
          tenantId: TENANT_ID,
          permission: 'admin:role:manage',
          scopeType: 'department',
          scopeId: DEPT_ID,
        },
      )
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
        permission: 'admin:role:manage',
        scopeType: 'department',
        scopeId: DEPT_ID,
        result: 'denied',
      },
    })
  })

  it('does not write audit_event on success', async () => {
    kernelFacade.canDo.mockResolvedValue(true)
    await checkPermission(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo as unknown as IAuditEventRepository,
      { actorId: ACTOR_ID, tenantId: TENANT_ID, permission: 'people:profile:read' },
    )
    expect(auditRepo.insert).not.toHaveBeenCalled()
  })

  it('passes resourceOwnerId for self-permission checks', async () => {
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

  it('works with minimal context (no scope)', async () => {
    kernelFacade.canDo.mockResolvedValue(true)
    await expect(
      checkPermission(
        kernelFacade as unknown as KernelQueryFacade,
        auditRepo as unknown as IAuditEventRepository,
        { actorId: ACTOR_ID, tenantId: TENANT_ID, permission: 'people:profile:read' },
      ),
    ).resolves.toBeUndefined()
    expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'people:profile:read', {
      tenantId: TENANT_ID,
    })
  })
})
