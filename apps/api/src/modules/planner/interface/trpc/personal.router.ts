import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PlannerRouterService } from './planner-router.service'
import { ListPlansForActorQuery } from '../../application/queries/plans/list-plans-for-actor.query'
import { toPlannerTrpcError } from './planner-trpc-error'

function svc() {
  return PlannerRouterService.getInstance()
}

export const personalRouter = router({
  listPlans: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
      }),
    )
    .query(async ({ input }) => {
      await svc().assertPersonalEnabled(input.tenantId)
      return svc()
        .query(new ListPlansForActorQuery(input.actorId, input.tenantId))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
})
