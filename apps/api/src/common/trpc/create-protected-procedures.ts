import type { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import type { KernelAuditFacade } from '../../modules/kernel/application/facades/kernel-audit.facade'
import { createPermissionMiddleware } from './permission.middleware'
import { middleware, publicProcedure } from './trpc-init'

/**
 * Composes the permission middleware on top of a base procedure.
 *
 * Production wiring (via TrpcModule):
 *   publicProcedure -> createAuthenticatedProcedure(jwt) -> createProtectedProcedures(...)
 * Final chain on each request:
 *   auth (verify JWT cookie, populate ctx.actorId/tenantId) -> permission (canDo) -> handler
 *
 * Tests can pass `publicProcedure` as the base and supply ctx directly via createCaller.
 */
export function createProtectedProcedures(
  baseProcedure: typeof publicProcedure,
  kernelFacade: KernelQueryFacade,
  auditFacade: KernelAuditFacade,
) {
  const permMwFn = createPermissionMiddleware(kernelFacade, auditFacade)

  const permissionMw = middleware(async (opts) => {
    return permMwFn(opts as unknown as Parameters<typeof permMwFn>[0]) as ReturnType<
      typeof opts.next
    >
  })

  const permissionProtectedProcedure = baseProcedure.use(permissionMw)

  return { permissionProtectedProcedure }
}
