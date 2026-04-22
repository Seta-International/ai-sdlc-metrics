import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PlannerRouterService } from './planner-router.service'
import { AddChecklistItemCommand } from '../../application/commands/checklist/add-checklist-item.command'
import { ToggleChecklistItemCommand } from '../../application/commands/checklist/toggle-checklist-item.command'
import { UpdateChecklistItemCommand } from '../../application/commands/checklist/update-checklist-item.command'
import { RemoveChecklistItemCommand } from '../../application/commands/checklist/remove-checklist-item.command'
import { ReorderChecklistItemCommand } from '../../application/commands/checklist/reorder-checklist-item.command'
import { toPlannerTrpcError } from './planner-trpc-error'

function svc() {
  return PlannerRouterService.getInstance()
}

export const checklistRouter = router({
  add: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        itemId: z.string().uuid(),
        actorId: z.string().uuid(),
        expectedVersion: z.string(),
        title: z.string().min(1).max(255),
        orderHintAfter: z.string().optional(),
        orderHintBefore: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new AddChecklistItemCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.itemId,
            input.actorId,
            input.expectedVersion,
            input.title,
            input.orderHintAfter,
            input.orderHintBefore,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  toggle: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        itemId: z.string().uuid(),
        actorId: z.string().uuid(),
        expectedVersion: z.string(),
        isChecked: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new ToggleChecklistItemCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.itemId,
            input.actorId,
            input.expectedVersion,
            input.isChecked,
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
        itemId: z.string().uuid(),
        actorId: z.string().uuid(),
        expectedVersion: z.string(),
        title: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new UpdateChecklistItemCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.itemId,
            input.actorId,
            input.expectedVersion,
            input.title,
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
        taskId: z.string().uuid(),
        itemId: z.string().uuid(),
        actorId: z.string().uuid(),
        expectedVersion: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new RemoveChecklistItemCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.itemId,
            input.actorId,
            input.expectedVersion,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  reorder: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        itemId: z.string().uuid(),
        actorId: z.string().uuid(),
        orderHintAfter: z.string().optional(),
        orderHintBefore: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new ReorderChecklistItemCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.itemId,
            input.actorId,
            input.orderHintAfter,
            input.orderHintBefore,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
})
