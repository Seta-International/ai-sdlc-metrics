import { router, publicProcedure } from '../../../../common/trpc/app-router'

export const kernelRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' })),
})
