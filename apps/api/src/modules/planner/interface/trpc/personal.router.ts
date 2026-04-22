import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import { PlannerRouterService } from './planner-router.service'
import { ListPlansForActorQuery } from '../../application/queries/plans/list-plans-for-actor.query'
import { ListTasksForActorQuery } from '../../application/queries/personal/list-tasks-for-actor.query'
import { GetPersonalChartsQuery } from '../../application/queries/personal/get-personal-charts.query'
import { GetMyDayQuery } from '../../application/queries/personal/get-my-day.query'
import { GetCarryOverCandidatesQuery } from '../../application/queries/personal/get-carry-over-candidates.query'
import { AddToMyDayCommand } from '../../application/commands/my-day/add-to-my-day.command'
import { RemoveFromMyDayCommand } from '../../application/commands/my-day/remove-from-my-day.command'
import { CarryOverMyDayCommand } from '../../application/commands/my-day/carry-over.command'
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

  getCarryOverCandidates: publicProcedure
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
        .query(new GetCarryOverCandidatesQuery(input.actorId, input.tenantId, input.date))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  carryOver: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        fromDate: dateOnly,
        toDate: dateOnly,
        taskIds: z.array(z.string().uuid()).max(200),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPersonalEnabled(input.tenantId)
      return svc()
        .command(
          new CarryOverMyDayCommand(
            input.actorId,
            input.tenantId,
            input.fromDate,
            input.toDate,
            input.taskIds,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
})

export const personalRouter = router({
  listPlans: publicProcedure
    .meta({
      permission: PERMISSIONS.PLANNER_AGENT_LIST_MY_PLANS,
      agent: {
        whenToUse:
          'Use when the user asks to see the plans (projects/boards) they are a member of or own.',
        whenNotToUse:
          'Do not use to create, rename, or delete plans. Do not use to list tasks within a plan.',
        examples: [
          {
            input: 'Show me my plans',
            callArgs: {
              actorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
              tenantId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
            },
          },
          {
            input: 'What plans am I part of?',
            callArgs: {
              actorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
              tenantId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
            },
          },
        ],
        collectionContract: { pageSize: 50, cursorStyle: 'forward' },
      },
    })
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
    .meta({
      permission: PERMISSIONS.PLANNER_AGENT_LIST_MY_TASKS,
      agent: {
        whenToUse:
          'Use when the user asks about their assigned tasks, open work items, or upcoming tasks.',
        whenNotToUse:
          'Do not use to create, update, or delete tasks. Do not use to list tasks that belong to other users.',
        examples: [
          {
            input: 'What tasks do I have open?',
            callArgs: {
              actorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
              tenantId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
              includeCompleted: false,
            },
          },
          {
            input: 'Show me all my tasks including done ones',
            callArgs: {
              actorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
              tenantId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
              includeCompleted: true,
            },
          },
        ],
        collectionContract: { pageSize: 50, cursorStyle: 'forward' },
      },
    })
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
