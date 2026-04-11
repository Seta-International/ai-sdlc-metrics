import type { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import type { IAuditLogger } from '../auth/audit-logger.interface'
import { createPermissionMiddleware } from './permission.middleware'
import { publicProcedure, middleware } from './trpc-init'

/**
 * Factory creating permission-aware tRPC procedures.
 * Uses publicProcedure as base — auth is handled separately via initProtectedProcedure().
 * In production, wire via NestJS DI at bootstrap.
 * In tests, call createCaller() with { actorId, tenantId } directly to simulate authenticated context.
 */
export function createProtectedProcedures(
  kernelFacade: KernelQueryFacade,
  auditRepo: IAuditLogger,
) {
  const permissionMw = middleware(async (opts) => {
    const mw = createPermissionMiddleware(kernelFacade, auditRepo)
    const result = await mw(
      opts as unknown as Parameters<ReturnType<typeof createPermissionMiddleware>>[0],
    )
    return result as Awaited<ReturnType<typeof opts.next>>
  })

  const permissionProtectedProcedure = publicProcedure.use(permissionMw)

  return { permissionProtectedProcedure }
}
