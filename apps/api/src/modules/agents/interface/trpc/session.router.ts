import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createSessionHandler: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let listSessionsHandler: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sendMessageHandler: any

export function setAgentSessionHandlers(handlers: {
  createSession: any
  listSessions: any
  sendMessage: any
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
      const { CreateSessionCommand } = require('../../application/commands/create-session.command')
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
      const { ListSessionsQuery } = require('../../application/queries/list-sessions.query')
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
      const { SendMessageCommand } = require('../../application/commands/send-message.command')
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
