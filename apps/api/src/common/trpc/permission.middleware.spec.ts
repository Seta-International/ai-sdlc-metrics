/* eslint-disable @typescript-eslint/no-explicit-any */
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
    kernelFacade = { canDo: vi.fn() }
    auditRepo = { insert: vi.fn().mockResolvedValue(undefined) }
    nextFn = vi.fn().mockResolvedValue({ ok: true })
  })

  function callMiddleware(meta: { permission?: string } | undefined) {
    const mw = createPermissionMiddleware(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo as unknown as IAuditEventRepository,
    )
    return mw({
      ctx: { actorId: ACTOR_ID, tenantId: TENANT_ID, roles: [] },
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
      /* expected */
    }
    expect(auditRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      eventType: 'permission_denied',
      module: 'kernel',
      subjectId: ACTOR_ID,
      payload: { permission: 'admin:role:manage', path: 'people.getProfile', result: 'denied' },
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
      /* expected */
    }
    expect(nextFn).not.toHaveBeenCalled()
  })
})
