import * as z from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import type { DraftApprovalService } from '../../application/services/draft-approval.service'

let draftApprovalService: DraftApprovalService | undefined

export function setDraftApprovalService(service: DraftApprovalService): void {
  draftApprovalService = service
}

function service(): DraftApprovalService {
  if (!draftApprovalService) throw new Error('draftApprovalService not wired — boot failure')
  return draftApprovalService
}

/**
 * Plan 08 — Agent draft approve/reject mutations.
 *
 * These are tenant-scoped admin actions executed by a human approver via the
 * notifications-module inbox UI.  They are NOT part of an agent turn so there is
 * no obsCtx; flowId is inherited from the draft row.
 *
 * Permissions:
 *   approve: AGENT_DRAFT_APPROVE — granted to approvers (manager-level role).
 *   reject:  AGENT_DRAFT_REJECT  — granted to approvers (manager-level role).
 */
export const draftApprovalRouter = router({
  approve: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_DRAFT_APPROVE })
    .input(z.object({ draftId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
      }
      if (!ctx.actorId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing actor context' })
      }
      await service().approveDraft({
        tenantId: ctx.tenantId,
        draftId: input.draftId,
        approverId: ctx.actorId,
      })
    }),

  reject: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_DRAFT_REJECT })
    .input(
      z.object({
        draftId: z.string().uuid(),
        reason: z.enum(['not_needed', 'wrong_entity', 'wrong_value', 'other_with_note']),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
      }
      if (!ctx.actorId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing actor context' })
      }
      if (input.reason === 'other_with_note' && !input.note?.trim()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'note is required when reason is other_with_note',
        })
      }
      await service().rejectDraft({
        tenantId: ctx.tenantId,
        draftId: input.draftId,
        rejecterId: ctx.actorId,
        reason: input.reason,
        note: input.note,
      })
    }),
})
