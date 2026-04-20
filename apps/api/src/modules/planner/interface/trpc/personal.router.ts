import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PlannerRouterService } from './planner-router.service'
import { ListPlansForActorQuery } from '../../application/queries/plans/list-plans-for-actor.query'
import { ListTasksForActorQuery } from '../../application/queries/personal/list-tasks-for-actor.query'
import { GetPersonalChartsQuery } from '../../application/queries/personal/get-personal-charts.query'
import { GetMyDayQuery } from '../../application/queries/personal/get-my-day.query'
import { AddToMyDayCommand } from '../../application/commands/my-day/add-to-my-day.command'
import { RemoveFromMyDayCommand } from '../../application/commands/my-day/remove-from-my-day.command'
import { toPlannerTrpcError } from './planner-trpc-error'

function svc() {
  return PlannerRouterService.getInstance()
}

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })

const myDayRouter = router({
  get: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        date: dateOnly,
      }),
    )
    .query(async ({ input }) => {
      await svc().assertPersonalEnabled(input.tenantId)
      return svc()
        .query(new GetMyDayQuery(input.actorId, input.tenantId, input.date))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  add: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        taskId: z.string().uuid(),
        date: dateOnly,
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPersonalEnabled(input.tenantId)
      await svc()
        .command(new AddToMyDayCommand(input.actorId, input.tenantId, input.taskId, input.date))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  remove: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        taskId: z.string().uuid(),
        date: dateOnly,
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPersonalEnabled(input.tenantId)
      await svc()
        .command(
          new RemoveFromMyDayCommand(input.actorId, input.tenantId, input.taskId, input.date),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
})

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

  listTasks: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        includeCompleted: z.boolean().default(false),
      }),
    )
    .query(async ({ input }) => {
      await svc().assertPersonalEnabled(input.tenantId)
      return svc()
        .query(
          new ListTasksForActorQuery(input.actorId, input.tenantId, {
            includeCompleted: input.includeCompleted,
          }),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  getCharts: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
      }),
    )
    .query(async ({ input }) => {
      await svc().assertPersonalEnabled(input.tenantId)
      return svc()
        .query(new GetPersonalChartsQuery(input.actorId, input.tenantId))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  myDay: myDayRouter,
})
