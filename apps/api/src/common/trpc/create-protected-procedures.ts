import type { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import type { IAuditEventRepository } from '../../modules/kernel/domain/repositories/audit-event.repository.port'
import { createPermissionMiddleware } from './permission.middleware'
import { middleware, publicProcedure } from './trpc-init'

export function createProtectedProcedures(
  kernelFacade: KernelQueryFacade,
  auditRepo: IAuditEventRepository,
) {
  const permMwFn = createPermissionMiddleware(kernelFacade, auditRepo)

  const permissionMw = middleware(async (opts) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return permMwFn(opts as unknown as Parameters<typeof permMwFn>[0]) as ReturnType<
      typeof opts.next
    >
  })

  // Uses publicProcedure here because in unit tests there's no JwtService available.
  // In production, the TrpcModule wires getProtectedProcedure().use(permissionMw)
  // so the chain is: auth -> permission -> handler.
  // The createProtectedProcedures factory is for DI-independent testing.
  const permissionProtectedProcedure = publicProcedure.use(permissionMw)

  return { permissionProtectedProcedure }
}
