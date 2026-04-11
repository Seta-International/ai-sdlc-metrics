import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { TrpcContext } from '../../../../common/trpc/trpc-init'
import { globalPermissionProtectedProcedure } from '../../../../common/trpc/create-protected-procedures'
import type { KernelQueryFacade } from '../../application/facades/kernel-query.facade'

type AuthCtx = TrpcContext & { actorId: string; tenantId: string }

// Lazy singleton — set by initKernelRouterFacade() in KernelModule.onModuleInit()
let _kernelFacade: KernelQueryFacade | null = null

/**
 * Called once by KernelModule.onModuleInit() after DI is ready.
 * Must be called before any kernel router procedure is invoked.
 */
export function initKernelRouterFacade(facade: KernelQueryFacade): void {
  _kernelFacade = facade
}

function getFacade(): KernelQueryFacade {
  if (!_kernelFacade) {
    throw new Error('KernelQueryFacade not initialized. Call initKernelRouterFacade() at startup.')
  }
  return _kernelFacade
}

/**
 * Creates the kernel router with permission-protected procedures.
 * Health endpoint is public. Role management endpoints require permissions.
 */
export function createKernelRouter(
  permissionProtectedProcedure: ReturnType<typeof publicProcedure.use>,
) {
  return router({
    health: publicProcedure.query(() => ({ status: 'ok' })),

    getRoleGrants: permissionProtectedProcedure
      .meta({ permission: 'admin:role:read' })
      .input(z.object({ actorId: z.uuid() }))
      .query(({ ctx, input }) => {
        const { tenantId } = ctx as unknown as AuthCtx
        return getFacade().getRoleGrants(input.actorId, tenantId)
      }),
  })
}

// Kernel router — uses globalPermissionProtectedProcedure which is lazily
// initialized by KernelModule.onModuleInit() before any request is handled.
export const kernelRouter = createKernelRouter(globalPermissionProtectedProcedure)
