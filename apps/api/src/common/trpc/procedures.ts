import { TRPCError } from '@trpc/server'
import { publicProcedure } from './trpc-init'

/**
 * A procedure for dev/test routes that require a resolved tenantId and actorId.
 * These are populated from `x-future-tenant-id` / `x-future-actor-id` headers
 * in development and test environments only.
 *
 * Do NOT use this for production auth flows — use `getProtectedProcedure()` instead.
 */
export const devProtectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (ctx.tenantId === null || ctx.actorId === null) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message:
        'devProtectedProcedure requires x-future-tenant-id and x-future-actor-id headers (dev/test only)',
    })
  }

  return next({
    ctx: {
      ...ctx,
      tenantId: ctx.tenantId,
      actorId: ctx.actorId,
    },
  })
})
