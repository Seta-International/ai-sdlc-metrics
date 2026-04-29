import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PlannerRouterService } from './planner-router.service'
import { CreatePlanCommand } from '../../application/commands/plans/create-plan.command'
import { RenamePlanCommand } from '../../application/commands/plans/rename-plan.command'
import { DeletePlanCommand } from '../../application/commands/plans/delete-plan.command'
import { AddPlanMemberCommand } from '../../application/commands/plans/add-plan-member.command'
import { RemovePlanMemberCommand } from '../../application/commands/plans/remove-plan-member.command'
import { ListPlansForActorQuery } from '../../application/queries/plans/list-plans-for-actor.query'
import { GetPlanQuery } from '../../application/queries/plans/get-plan.query'
import { PlanContainer } from '../../domain/value-objects/plan-container.vo'
import { toPlannerTrpcError } from './planner-trpc-error'

function svc() {
  return PlannerRouterService.getInstance()
}

export const planRouter = router({
  list: publicProcedure
    .input(z.object({ actorId: z.string().uuid(), tenantId: z.string().uuid() }))
    .query(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .query(new ListPlansForActorQuery(input.actorId, input.tenantId))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  get: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
      }),
    )
    .query(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .query(new GetPlanQuery(input.actorId, input.planId, input.tenantId))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  create: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        id: z.string().uuid(),
        bucketId: z.string().uuid(),
        name: z.string().min(1).max(255),
        description: z.string().max(32000).nullable().default(null),
        containerType: z.enum(['future_only', 'ms_group', 'ms_roster']).default('future_only'),
        containerRef: z.string().min(1).nullable().default(null),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      const container =
        (input.containerType === 'ms_group' || input.containerType === 'ms_roster') &&
        input.containerRef
          ? PlanContainer.of({ type: input.containerType, externalId: input.containerRef })
          : PlanContainer.of({ type: 'future_only' })
      return svc()
        .command(
          new CreatePlanCommand(
            input.tenantId,
            input.id,
            input.name,
            input.description,
            container,
            input.actorId,
            input.bucketId,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  rename: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        name: z.string().min(1).max(255),
        expectedVersion: z.date().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new RenamePlanCommand(
            input.tenantId,
            input.planId,
            input.name,
            input.actorId,
            input.expectedVersion,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  delete: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(new DeletePlanCommand(input.tenantId, input.planId, input.actorId))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  addMember: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        targetActorId: z.string().uuid(),
        role: z.enum(['owner', 'editor', 'viewer']),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new AddPlanMemberCommand(
            input.tenantId,
            input.planId,
            input.actorId,
            input.targetActorId,
            input.role,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  removeMember: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        targetActorId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new RemovePlanMemberCommand(
            input.tenantId,
            input.planId,
            input.actorId,
            input.targetActorId,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  // No assertPlannerEnabled guard — flags are needed before planner feature-gate is known
  getViewFlags: publicProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(({ input }) => svc().getPlannerViewFlags(input.tenantId)),
})
