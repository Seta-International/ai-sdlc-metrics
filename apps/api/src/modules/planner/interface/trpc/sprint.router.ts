import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PlannerRouterService } from './planner-router.service'
import { CreateSprintCommand } from '../../application/commands/sprints/create-sprint.command'
import { CompleteSprintCommand } from '../../application/commands/sprints/complete-sprint.command'
import { AssignTaskToSprintCommand } from '../../application/commands/sprints/assign-task-to-sprint.command'
import { UnassignTaskFromSprintCommand } from '../../application/commands/sprints/unassign-task-from-sprint.command'
import { ListSprintsQuery } from '../../application/queries/sprints/list-sprints.query'
import { toPlannerTrpcError } from './planner-trpc-error'

function svc() {
  return PlannerRouterService.getInstance()
}

export const sprintRouter = router({
  list: publicProcedure
    .input(z.object({ tenantId: z.string().uuid(), planId: z.string().uuid() }))
    .query(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .query(new ListSprintsQuery(input.planId, input.tenantId))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  create: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        actorId: z.string().uuid(),
        name: z.string().min(1).max(100),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new CreateSprintCommand(
            input.tenantId,
            input.planId,
            input.actorId,
            input.name,
            input.startDate,
            input.endDate,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  complete: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        actorId: z.string().uuid(),
        sprintId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new CompleteSprintCommand(input.tenantId, input.planId, input.actorId, input.sprintId),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  assignTask: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        actorId: z.string().uuid(),
        taskId: z.string().uuid(),
        sprintId: z.string().uuid(),
        expectedVersion: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new AssignTaskToSprintCommand(
            input.tenantId,
            input.planId,
            input.actorId,
            input.taskId,
            input.sprintId,
            input.expectedVersion,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  unassignTask: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        actorId: z.string().uuid(),
        taskId: z.string().uuid(),
        expectedVersion: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new UnassignTaskFromSprintCommand(
            input.tenantId,
            input.planId,
            input.actorId,
            input.taskId,
            input.expectedVersion,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
})
