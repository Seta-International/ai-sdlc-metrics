import { router, publicProcedure } from '../../../../common/trpc/trpc-init'

export const kernelRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' })),
})
