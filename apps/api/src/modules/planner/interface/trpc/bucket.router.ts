import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PlannerRouterService } from './planner-router.service'
import { CreateBucketCommand } from '../../application/commands/buckets/create-bucket.command'
import { RenameBucketCommand } from '../../application/commands/buckets/rename-bucket.command'
import { ReorderBucketCommand } from '../../application/commands/buckets/reorder-bucket.command'
import { DeleteBucketCommand } from '../../application/commands/buckets/delete-bucket.command'
import { toPlannerTrpcError } from './planner-trpc-error'

function svc() {
  return PlannerRouterService.getInstance()
}

export const bucketRouter = router({
  create: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        bucketId: z.string().uuid(),
        name: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new CreateBucketCommand(
            input.tenantId,
            input.planId,
            input.bucketId,
            input.name,
            input.actorId,
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
        bucketId: z.string().uuid(),
        name: z.string().min(1).max(255),
        expectedVersion: z.date().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new RenameBucketCommand(
            input.tenantId,
            input.planId,
            input.bucketId,
            input.name,
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
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        bucketId: z.string().uuid(),
        orderHintAfter: z.string().optional(),
        orderHintBefore: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new ReorderBucketCommand(
            input.tenantId,
            input.planId,
            input.bucketId,
            input.actorId,
            input.orderHintAfter,
            input.orderHintBefore,
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
        bucketId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new DeleteBucketCommand(input.tenantId, input.planId, input.bucketId, input.actorId),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
})
