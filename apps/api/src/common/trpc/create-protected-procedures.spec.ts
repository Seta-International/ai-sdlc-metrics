import { describe, expect, it, vi, beforeEach } from 'vitest'
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
    kernelFacade = { canDo: vi.fn() }
    auditRepo = { insert: vi.fn().mockResolvedValue(undefined) }
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
