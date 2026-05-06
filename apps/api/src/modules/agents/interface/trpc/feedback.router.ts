import * as z from 'zod'
import { TRPCError } from '@trpc/server'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import { publicProcedure, router } from '../../../../common/trpc/trpc-init'
import { SubmitFeedbackCommand } from '../../application/commands/submit-feedback.command'
import type { SubmitFeedbackHandler } from '../../application/commands/submit-feedback.handler'

let submitFeedbackHandler: SubmitFeedbackHandler | undefined

export function setSubmitFeedbackHandler(handler: SubmitFeedbackHandler): void {
  submitFeedbackHandler = handler
}

function getHandler(): SubmitFeedbackHandler {
  if (!submitFeedbackHandler) throw new Error('submitFeedbackHandler not wired — boot failure')
  return submitFeedbackHandler
}

export const feedbackRouter = router({
  submit: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_CONVERSATION_WRITE })
    .input(
      z.object({
        messageId: z.string().uuid(),
        rating: z.enum(['up', 'down']),
        note: z.string().trim().min(1).max(500).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
      }
      if (!ctx.actorId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing actor context' })
      }

      await getHandler().execute(
        new SubmitFeedbackCommand(
          ctx.tenantId,
          input.messageId,
          ctx.actorId,
          input.rating,
          input.note,
        ),
      )
    }),
})
