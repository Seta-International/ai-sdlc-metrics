import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { KernelQueryFacade } from '../../application/facades/kernel-query.facade'

export function createKernelRouter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  permissionProtectedProcedure: any,
  kernelFacade?: KernelQueryFacade,
) {
  return router({
    health: publicProcedure.query(() => ({ status: 'ok' })),
    getRoleGrants: permissionProtectedProcedure
      .meta({ permission: 'admin:role:read' })
      .input(z.object({ actorId: z.string().uuid() }))
      .query(async ({ input, ctx }: { input: { actorId: string }; ctx: { tenantId: string } }) => {
        if (!kernelFacade) return []
        return kernelFacade.getRoleGrants(input.actorId, ctx.tenantId)
      }),
    getMyPermissions: permissionProtectedProcedure.query(
      async ({ ctx }: { ctx: { actorId: string; tenantId: string } }) => {
        if (!kernelFacade) return []
        return kernelFacade.getEffectivePermissions(ctx.actorId, ctx.tenantId)
      },
    ),
  })
}

// Keep existing backward-compatible export used by app-router.ts
export const kernelRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' })),
})
