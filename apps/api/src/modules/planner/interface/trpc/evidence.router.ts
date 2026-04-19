import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PlannerRouterService } from './planner-router.service'
import { RequestEvidenceUploadCommand } from '../../application/commands/evidence/request-upload.command'
import { FinalizeEvidenceUploadCommand } from '../../application/commands/evidence/finalize-upload.command'
import { CreateEvidenceLinkCommand } from '../../application/commands/evidence/create-link.command'
import { CreateEvidenceNoteCommand } from '../../application/commands/evidence/create-note.command'
import { RemoveEvidenceCommand } from '../../application/commands/evidence/remove-evidence.command'
import { ListTaskEvidenceQuery } from '../../application/queries/evidence/list-task-evidence.query'
import { toPlannerTrpcError } from './planner-trpc-error'

function svc() {
  return PlannerRouterService.getInstance()
}

export const evidenceRouter = router({
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
          new RequestEvidenceUploadCommand(
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
        evidenceId: z.string().uuid(),
        actorId: z.string().uuid(),
        storageKey: z.string().min(1),
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1),
        sizeBytes: z.number().int().positive(),
        caption: z.string().min(1).max(500),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new FinalizeEvidenceUploadCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.evidenceId,
            input.actorId,
            input.storageKey,
            input.filename,
            input.contentType,
            input.sizeBytes,
            input.caption,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  createLink: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        evidenceId: z.string().uuid(),
        actorId: z.string().uuid(),
        url: z.string().url(),
        caption: z.string().min(1).max(500),
        linkTitle: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new CreateEvidenceLinkCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.evidenceId,
            input.actorId,
            input.url,
            input.caption,
            input.linkTitle,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  createNote: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        evidenceId: z.string().uuid(),
        actorId: z.string().uuid(),
        caption: z.string().min(1).max(500),
        body: z.string().min(1).max(4000),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new CreateEvidenceNoteCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.evidenceId,
            input.actorId,
            input.caption,
            input.body,
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
        evidenceId: z.string().uuid(),
        actorId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new RemoveEvidenceCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.evidenceId,
            input.actorId,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  list: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
      }),
    )
    .query(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .query(new ListTaskEvidenceQuery(input.tenantId, input.planId, input.taskId, input.actorId))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
})
