import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { CommandBus } from '@nestjs/cqrs'
import {
  ResolveLoginCommand,
  type ResolveLoginResult,
} from '../../application/commands/resolve-login.command'

// Input schemas
const resolveLoginInput = z.object({
  provider: z.enum(['microsoft', 'google', 'magic_link']),
  ssoSubject: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  tenantId: z.string().uuid(),
})

const requestMagicLinkInput = z.object({
  email: z.string().email(),
  tenantId: z.string().uuid(),
})

const validateMagicLinkInput = z.object({
  token: z.string().min(1),
  tenantId: z.string().uuid(),
})

/**
 * Identity router — all procedures are public because they are called
 * during the authentication flow, before a session exists.
 *
 * The CommandBus is injected at module bootstrap time via setIdentityCommandBus().
 */
let commandBus: CommandBus | null = null

export function setIdentityCommandBus(bus: CommandBus): void {
  commandBus = bus
}

function getCommandBus(): CommandBus {
  if (!commandBus) {
    throw new Error('Identity router CommandBus not initialized')
  }
  return commandBus
}

export const identityRouter = router({
  resolveLogin: publicProcedure
    .input(resolveLoginInput)
    .mutation(async ({ input }): Promise<ResolveLoginResult> => {
      try {
        return await getCommandBus().execute(
          new ResolveLoginCommand(
            input.provider,
            input.ssoSubject,
            input.email,
            input.displayName,
            input.tenantId,
          ),
        )
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Login failed'
        if (message.includes('suspended')) {
          throw new TRPCError({ code: 'FORBIDDEN', message })
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
      }
    }),

  requestMagicLink: publicProcedure.input(requestMagicLinkInput).mutation(async () => {
    // TODO(Plan 02): Replace with RequestMagicLinkCommand once Plan 02 is implemented
    throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Magic link not yet implemented' })
  }),

  validateMagicLink: publicProcedure.input(validateMagicLinkInput).mutation(async () => {
    // TODO(Plan 02): Replace with ValidateMagicLinkCommand once Plan 02 is implemented
    throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Magic link not yet implemented' })
  }),
})
