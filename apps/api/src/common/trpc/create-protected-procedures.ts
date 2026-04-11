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

// ── Global lazy singleton ───────────────────────────────────────────────────
// Initialized at app bootstrap by KernelModule.onModuleInit() so that static
// router exports (identity admin, admin) can use permission-protected procedures
// without depending on NestJS DI at module-load time.

let _globalKernelFacade: KernelQueryFacade | null = null
let _globalAuditLogger: IAuditLogger | null = null

/**
 * Called once by KernelModule.onModuleInit() after DI is ready.
 * Must be called before any permission-protected procedure is invoked.
 */
export function initGlobalPermissionProcedure(
  kernelFacade: KernelQueryFacade,
  auditLogger: IAuditLogger,
): void {
  _globalKernelFacade = kernelFacade
  _globalAuditLogger = auditLogger
}

/**
 * A tRPC procedure that lazily checks permissions on every call.
 * The KernelQueryFacade and audit logger are resolved at call time (not at build time),
 * allowing this to be used in static router exports that are evaluated before NestJS DI.
 */
export const globalPermissionProtectedProcedure = publicProcedure.use(
  middleware(async (opts) => {
    if (!_globalKernelFacade || !_globalAuditLogger) {
      throw new Error(
        'Permission middleware not initialized. initGlobalPermissionProcedure() must be called at bootstrap.',
      )
    }
    const mw = createPermissionMiddleware(_globalKernelFacade, _globalAuditLogger)
    const result = await mw(
      opts as unknown as Parameters<ReturnType<typeof createPermissionMiddleware>>[0],
    )
    return result as Awaited<ReturnType<typeof opts.next>>
  }),
)
