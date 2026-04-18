import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PlannerRouterService } from './planner-router.service'
import { RenamePlanLabelCommand } from '../../application/commands/plans/rename-plan-label.command'
import { RecolorPlanLabelCommand } from '../../application/commands/plans/recolor-plan-label.command'
import { LabelSlot } from '../../domain/value-objects/label-slot.vo'
import { toPlannerTrpcError } from './planner-trpc-error'

function svc() {
  return PlannerRouterService.getInstance()
}

export const labelRouter = router({
  rename: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        slot: z.string().regex(/^category([1-9]|1[0-9]|2[0-5])$/),
        name: z.string().min(1).max(50),
      }),
    )
    .mutation(({ input }) =>
      svc()
        .command(
          new RenamePlanLabelCommand(
            input.tenantId,
            input.planId,
            input.actorId,
            LabelSlot.of(input.slot),
            input.name,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        }),
    ),

  recolor: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        slot: z.string().regex(/^category([1-9]|1[0-9]|2[0-5])$/),
        name: z.string().min(1).max(50),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      }),
    )
    .mutation(({ input }) =>
      svc()
        .command(
          new RecolorPlanLabelCommand(
            input.tenantId,
            input.planId,
            input.actorId,
            LabelSlot.of(input.slot),
            input.name,
            input.color,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        }),
    ),
})
