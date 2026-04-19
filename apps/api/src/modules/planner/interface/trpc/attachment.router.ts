import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PlannerRouterService } from './planner-router.service'
import { RequestUploadCommand } from '../../application/commands/attachments/request-upload.command'
import { FinalizeUploadCommand } from '../../application/commands/attachments/finalize-upload.command'
import { AddLinkCommand } from '../../application/commands/attachments/add-link.command'
import { SetCoverCommand } from '../../application/commands/attachments/set-cover.command'
import { RemoveAttachmentCommand } from '../../application/commands/attachments/remove.command'
import { toPlannerTrpcError } from './planner-trpc-error'

function svc() {
  return PlannerRouterService.getInstance()
}

export const attachmentRouter = router({
  requestUpload: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1),
        sizeBytes: z.number().int().positive(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new RequestUploadCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.actorId,
            input.filename,
            input.contentType,
            input.sizeBytes,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  finalizeUpload: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        attachmentId: z.string().uuid(),
        actorId: z.string().uuid(),
        storageKey: z.string().min(1),
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1),
        sizeBytes: z.number().int().positive(),
        setAsCover: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new FinalizeUploadCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.attachmentId,
            input.actorId,
            input.storageKey,
            input.filename,
            input.contentType,
            input.sizeBytes,
            input.setAsCover,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  addLink: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        attachmentId: z.string().uuid(),
        actorId: z.string().uuid(),
        url: z.string().url(),
        linkTitle: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new AddLinkCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.attachmentId,
            input.actorId,
            input.url,
            input.linkTitle,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  setCover: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
        attachmentId: z.string().uuid().optional(),
        expectedVersion: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new SetCoverCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.actorId,
            input.expectedVersion,
            input.attachmentId,
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
        attachmentId: z.string().uuid(),
        actorId: z.string().uuid(),
        expectedVersion: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new RemoveAttachmentCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.attachmentId,
            input.actorId,
            input.expectedVersion,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
})
