import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { CreateSessionCommand } from '../../application/commands/create-session.command'
import { SendMessageCommand } from '../../application/commands/send-message.command'
import { ListSessionsQuery } from '../../application/queries/list-sessions.query'
import type { CreateSessionHandler } from '../../application/commands/create-session.handler'
import type { SendMessageHandler } from '../../application/commands/send-message.handler'
import type { ListSessionsHandler } from '../../application/queries/list-sessions.handler'

let createSessionHandler: CreateSessionHandler | undefined
let listSessionsHandler: ListSessionsHandler | undefined
let sendMessageHandler: SendMessageHandler | undefined

export function setAgentSessionHandlers(handlers: {
  createSession: CreateSessionHandler
  listSessions: ListSessionsHandler
  sendMessage: SendMessageHandler
}) {
  createSessionHandler = handlers.createSession
  listSessionsHandler = handlers.listSessions
  sendMessageHandler = handlers.sendMessage
}

export const sessionRouter = router({
  create: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid(),
        contextModule: z.string().optional(),
        contextEntity: z.string().optional(),
        contextEntityId: z.string().optional(),
        contextMetadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(({ input }) => {
      if (!createSessionHandler) throw new Error('createSessionHandler not wired — boot failure')
      return createSessionHandler.execute(
        new CreateSessionCommand(
          input.tenantId,
          input.actorId,
          input.contextModule,
          input.contextEntity,
          input.contextEntityId,
          input.contextMetadata,
        ),
      )
    }),

  list: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(({ input }) => {
      if (!listSessionsHandler) throw new Error('listSessionsHandler not wired — boot failure')
      return listSessionsHandler.execute(
        new ListSessionsQuery(input.actorId, input.tenantId, input.limit),
      )
    }),

  sendMessage: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        sessionId: z.string().uuid(),
        role: z.enum(['user', 'assistant', 'tool_call', 'tool_result']),
        content: z.string(),
        toolName: z.string().optional(),
        toolArgs: z.record(z.string(), z.unknown()).optional(),
        modelUsed: z.string().optional(),
        tokensUsed: z.number().int().optional(),
        isError: z.boolean().optional(),
      }),
    )
    .mutation(({ input }) => {
      if (!sendMessageHandler) throw new Error('sendMessageHandler not wired — boot failure')
      return sendMessageHandler.execute(
        new SendMessageCommand(
          input.tenantId,
          input.sessionId,
          input.role,
          input.content,
          input.toolName,
          input.toolArgs,
          input.modelUsed,
          input.tokensUsed,
          input.isError,
        ),
      )
    }),
})
