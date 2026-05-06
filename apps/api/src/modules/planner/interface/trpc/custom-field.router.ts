import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PlannerRouterService } from './planner-router.service'
import { DefineCustomFieldCommand } from '../../application/commands/custom-fields/define-custom-field.command'
import { UpdateCustomFieldDefCommand } from '../../application/commands/custom-fields/update-custom-field-def.command'
import { DeleteCustomFieldDefCommand } from '../../application/commands/custom-fields/delete-custom-field-def.command'
import { SetCustomFieldValueCommand } from '../../application/commands/custom-fields/set-custom-field-value.command'
import { toPlannerTrpcError } from './planner-trpc-error'
import type { CustomFieldKind } from '../../domain/repositories/custom-field-def.repository'
import type { CustomFieldValuePayload } from '../../domain/repositories/task-custom-field-value.repository'

function svc() {
  return PlannerRouterService.getInstance()
}

const customFieldValueSchema = z.union([
  z.object({ text: z.string() }),
  z.object({ number: z.number() }),
  z.object({ date: z.string() }),
  z.object({ yesNo: z.boolean() }),
  z.object({ choice: z.string() }),
])

export const customFieldRouter = router({
  defineField: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        actorId: z.string().uuid(),
        name: z.string().min(1).max(100),
        kind: z.enum(['text', 'number', 'date', 'yes_no', 'choice']),
        choiceOptions: z.array(z.string()).nullable(),
        position: z.number().int().min(0),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new DefineCustomFieldCommand(
            input.tenantId,
            input.planId,
            input.actorId,
            input.name,
            input.kind as CustomFieldKind,
            input.choiceOptions,
            input.position,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  updateFieldDef: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        actorId: z.string().uuid(),
        defId: z.string().uuid(),
        name: z.string().min(1).max(100),
        choiceOptions: z.array(z.string()).nullable(),
        position: z.number().int().min(0),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new UpdateCustomFieldDefCommand(
            input.tenantId,
            input.planId,
            input.actorId,
            input.defId,
            input.name,
            input.choiceOptions,
            input.position,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  deleteFieldDef: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        actorId: z.string().uuid(),
        defId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new DeleteCustomFieldDefCommand(input.tenantId, input.planId, input.actorId, input.defId),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  setValue: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
        fieldDefId: z.string().uuid(),
        value: customFieldValueSchema,
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new SetCustomFieldValueCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.actorId,
            input.fieldDefId,
            input.value as CustomFieldValuePayload,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
})
