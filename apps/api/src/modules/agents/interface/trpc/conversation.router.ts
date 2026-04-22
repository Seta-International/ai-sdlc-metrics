import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import type { ConversationRepository } from '../../domain/repositories/conversation.repository'

let conversationRepository: ConversationRepository | undefined

export function setConversationRepository(repo: ConversationRepository): void {
  conversationRepository = repo
}

function repo(): ConversationRepository {
  if (!conversationRepository) throw new Error('conversationRepository not wired — boot failure')
  return conversationRepository
}

export const conversationRouter = router({
  listGlobal: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_CONVERSATION_READ })
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(({ input, ctx }) => {
      return repo().listGlobal({
        tenantId: ctx.tenantId ?? '',
        userId: ctx.actorId ?? '',
        limit: input.limit,
        cursor: input.cursor,
      })
    }),

  listBySurface: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_CONVERSATION_READ })
    .input(z.object({ surface: z.string() }))
    .query(({ input, ctx }) => {
      return repo().listBySurface({
        tenantId: ctx.tenantId ?? '',
        userId: ctx.actorId ?? '',
        surface: input.surface,
      })
    }),

  getById: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_CONVERSATION_READ })
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const conv = await repo().loadById({ id: input.id, tenantId: ctx.tenantId ?? '' })
      return conv ?? null
    }),

  archive: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_CONVERSATION_ARCHIVE })
    .input(z.object({ id: z.string() }))
    .mutation(({ input, ctx }) => {
      return repo().archive({ id: input.id, tenantId: ctx.tenantId ?? '' })
    }),
})
