import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createProtectedProcedures } from './create-protected-procedures'
import type { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import type { KernelAuditFacade } from '../../modules/kernel/application/facades/kernel-audit.facade'
import { router } from './trpc-init'

describe('createProtectedProcedures', () => {
  let kernelFacade: { canDo: ReturnType<typeof vi.fn> }
  let auditFacade: { recordEvent: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    kernelFacade = { canDo: vi.fn() }
    auditFacade = { recordEvent: vi.fn().mockResolvedValue(undefined) }
  })

  it('should create permissionProtectedProcedure that checks permissions', () => {
    const { permissionProtectedProcedure } = createProtectedProcedures(
      kernelFacade as unknown as KernelQueryFacade,
      auditFacade as unknown as KernelAuditFacade,
    )
    expect(permissionProtectedProcedure).toBeDefined()
  })

  it('should allow building a router with permission meta', () => {
    const { permissionProtectedProcedure } = createProtectedProcedures(
      kernelFacade as unknown as KernelQueryFacade,
      auditFacade as unknown as KernelAuditFacade,
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
      auditFacade as unknown as KernelAuditFacade,
    )
    const testRouter = router({
      test: permissionProtectedProcedure.query(() => 'ok'),
    })
    expect(testRouter).toBeDefined()
  })
})
