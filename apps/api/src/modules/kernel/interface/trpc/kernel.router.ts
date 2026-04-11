import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { KernelQueryFacade } from '../../application/facades/kernel-query.facade'

/**
 * Creates the kernel router with permission-protected procedures.
 * Health endpoint is public. Role management endpoints require permissions.
 */
export function createKernelRouter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  permissionProtectedProcedure: any,
  kernelFacade: KernelQueryFacade,
) {
  return router({
    health: publicProcedure.query(() => ({ status: 'ok' })),

    getRoleGrants: permissionProtectedProcedure
      .meta({ permission: 'admin:role:read' })
      .input(z.object({ actorId: z.string().uuid() }))
      .query(({ ctx, input }: { ctx: { tenantId: string }; input: { actorId: string } }) => {
        return kernelFacade.getRoleGrants(input.actorId, ctx.tenantId)
      }),
  })
}

// Backward-compatible export for app-router.ts
export const kernelRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' })),
})
