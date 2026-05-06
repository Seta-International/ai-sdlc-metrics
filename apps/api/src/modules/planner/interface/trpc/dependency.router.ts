import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PlannerRouterService } from './planner-router.service'
import { AddDependencyCommand } from '../../application/commands/dependencies/add-dependency.command'
import { RemoveDependencyCommand } from '../../application/commands/dependencies/remove-dependency.command'
import { toPlannerTrpcError } from './planner-trpc-error'
import type { DependencyKind } from '../../domain/repositories/task-dependency.repository'

function svc() {
  return PlannerRouterService.getInstance()
}

export const dependencyRouter = router({
  add: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        actorId: z.string().uuid(),
        fromTaskId: z.string().uuid(),
        toTaskId: z.string().uuid(),
        kind: z.enum(['finish_to_start', 'start_to_start', 'finish_to_finish']),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new AddDependencyCommand(
            input.tenantId,
            input.planId,
            input.actorId,
            input.fromTaskId,
            input.toTaskId,
            input.kind as DependencyKind,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  remove: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        actorId: z.string().uuid(),
        fromTaskId: z.string().uuid(),
        toTaskId: z.string().uuid(),
        kind: z.enum(['finish_to_start', 'start_to_start', 'finish_to_finish']),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new RemoveDependencyCommand(
            input.tenantId,
            input.planId,
            input.actorId,
            input.fromTaskId,
            input.toTaskId,
            input.kind as DependencyKind,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
})
