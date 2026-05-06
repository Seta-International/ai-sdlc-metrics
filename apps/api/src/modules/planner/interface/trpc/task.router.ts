import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PlannerRouterService } from './planner-router.service'
import { GetBoardQuery } from '../../application/queries/tasks/get-board.query'
import { GetFlatTasksQuery } from '../../application/queries/tasks/get-flat.query'
import { GetTaskDetailQuery } from '../../application/queries/tasks/get-task-detail.query'
import { GetTaskTrendsQuery } from '../../application/queries/tasks/get-trends.query'
import { CreateTaskCommand } from '../../application/commands/tasks/create-task.command'
import { UpdateTaskCommand } from '../../application/commands/tasks/update-task.command'
import { MoveTaskCommand } from '../../application/commands/tasks/move-task.command'
import { SetTaskProgressCommand } from '../../application/commands/tasks/set-task-progress.command'
import { SetTaskPriorityCommand } from '../../application/commands/tasks/set-task-priority.command'
import { SetTaskDatesCommand } from '../../application/commands/tasks/set-task-dates.command'
import { AssignTaskCommand } from '../../application/commands/tasks/assign-task.command'
import { UnassignTaskCommand } from '../../application/commands/tasks/unassign-task.command'
import { ApplyLabelCommand } from '../../application/commands/tasks/apply-label.command'
import { RemoveLabelCommand } from '../../application/commands/tasks/remove-label.command'
import { DeleteTaskCommand } from '../../application/commands/tasks/delete-task.command'
import { GetTaskHistoryQuery } from '../../application/queries/tasks/get-task-history.query'
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

  getFlat: publicProcedure
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
        .query(new GetFlatTasksQuery(input.planId, input.actorId, input.tenantId))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  getTrends: publicProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        range: z.enum(['7d', '30d', '90d']),
      }),
    )
    .query(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .query(new GetTaskTrendsQuery(input.planId, input.actorId, input.tenantId, input.range))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

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
      return svc()
        .query(new GetTaskDetailQuery(input.planId, input.taskId, input.actorId, input.tenantId))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  create: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        bucketId: z.string().uuid(),
        taskId: z.string().uuid(),
        title: z.string().min(1).max(255),
        actorId: z.string().uuid(),
        description: z.string().optional(),
        priority: z.number().int().optional(),
        orderHintAfter: z.string().optional(),
        orderHintBefore: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new CreateTaskCommand(
            input.tenantId,
            input.planId,
            input.bucketId,
            input.taskId,
            input.title,
            input.actorId,
            input.description,
            input.priority,
            input.orderHintAfter,
            input.orderHintBefore,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  update: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
        expectedVersion: z.string(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        progress: z.union([z.literal(0), z.literal(50), z.literal(100)]).optional(),
        priority: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(9)]).optional(),
        startDate: z.date().nullable().optional(),
        dueDate: z.date().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new UpdateTaskCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.actorId,
            input.expectedVersion,
            input.title,
            input.description,
            input.progress,
            input.priority,
            input.startDate,
            input.dueDate,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  move: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
        expectedVersion: z.string(),
        toBucketId: z.string().uuid(),
        orderHintAfter: z.string().optional(),
        orderHintBefore: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new MoveTaskCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.actorId,
            input.expectedVersion,
            input.toBucketId,
            input.orderHintAfter,
            input.orderHintBefore,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  setProgress: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
        expectedVersion: z.string(),
        progress: z.union([z.literal(0), z.literal(50), z.literal(100)]),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new SetTaskProgressCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.actorId,
            input.expectedVersion,
            input.progress,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  setPriority: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
        expectedVersion: z.string(),
        priority: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(9)]),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new SetTaskPriorityCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.actorId,
            input.expectedVersion,
            input.priority,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  setDates: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
        expectedVersion: z.string(),
        startDate: z.date().nullable(),
        dueDate: z.date().nullable(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new SetTaskDatesCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.actorId,
            input.expectedVersion,
            input.startDate,
            input.dueDate,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  assign: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
        expectedVersion: z.string(),
        assigneeId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new AssignTaskCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.actorId,
            input.expectedVersion,
            input.assigneeId,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  unassign: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
        expectedVersion: z.string(),
        assigneeId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new UnassignTaskCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.actorId,
            input.expectedVersion,
            input.assigneeId,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  applyLabel: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
        expectedVersion: z.string(),
        slot: z.string().regex(/^category([1-9]|1[0-9]|2[0-5])$/),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new ApplyLabelCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.actorId,
            input.expectedVersion,
            input.slot,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  removeLabel: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
        expectedVersion: z.string(),
        slot: z.string().regex(/^category([1-9]|1[0-9]|2[0-5])$/),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new RemoveLabelCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.actorId,
            input.expectedVersion,
            input.slot,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  delete: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(new DeleteTaskCommand(input.tenantId, input.planId, input.taskId, input.actorId))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  getHistory: publicProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .query(new GetTaskHistoryQuery(input.taskId, input.tenantId, input.cursor, input.limit))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
})
