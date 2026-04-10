import { router, publicProcedure } from '../../../../common/trpc/app-router.js'

export const kernelRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' })),
})
