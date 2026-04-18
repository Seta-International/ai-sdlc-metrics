import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PlannerRouterService } from './planner-router.service'
import { GetBoardQuery } from '../../application/queries/tasks/get-board.query'
import { toPlannerTrpcError } from './planner-trpc-error'

function svc() {
  return PlannerRouterService.getInstance()
}

export const taskRouter = router({
  getBoard: publicProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
      }),
    )
    .query(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .query(new GetBoardQuery(input.planId, input.actorId, input.tenantId))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  /**
   * Stub — Plan 03 will add full task detail with checklist, attachments, comments, evidence.
   */
  getDetail: publicProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
      }),
    )
    .query(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      // Plan 03 implementation
      void input
      return null
    }),
})
