import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { CommandBus } from '@nestjs/cqrs'
import {
  ResolveLoginCommand,
  type ResolveLoginResult,
} from '../../application/commands/resolve-login.command'
import { RequestMagicLinkCommand } from '../../../identity/application/commands/request-magic-link.command'
import { ValidateMagicLinkCommand } from '../../../identity/application/commands/validate-magic-link.command'
import { DevLoginCommand } from '../../application/commands/dev-login.command'
import type { JwtService } from '../../../../common/auth/jwt.service'

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

let commandBus: CommandBus | null = null

export function setIdentityCommandBus(bus: CommandBus): void {
  commandBus = bus
}

function getCommandBus(): CommandBus {
  if (!commandBus) throw new Error('Identity router CommandBus not initialized')
  return commandBus
}

let jwtService: JwtService | null = null

export function setIdentityJwtService(svc: JwtService): void {
  jwtService = svc
}

function getJwtService(): JwtService {
  if (!jwtService) throw new Error('Identity router JwtService not initialized')
  return jwtService
}

export const identityRouter = router({
  resolveLogin: publicProcedure.input(resolveLoginInput).mutation(async ({ input }) => {
    try {
      const result: ResolveLoginResult = await getCommandBus().execute(
        new ResolveLoginCommand(
          input.provider,
          input.ssoSubject,
          input.email,
          input.displayName,
          input.tenantId,
        ),
      )
      const token = await getJwtService().sign({
        sub: result.actorId,
        tid: result.tenantId,
        tenantName: result.tenantName,
        displayName: result.displayName,
        email: result.email,
        roles: result.roles,
        provider: result.provider,
      })
      return { token }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Login failed'
      if (message.includes('suspended')) throw new TRPCError({ code: 'FORBIDDEN', message })
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
    }
  }),

  requestMagicLink: publicProcedure.input(requestMagicLinkInput).mutation(async ({ input }) => {
    await getCommandBus().execute(new RequestMagicLinkCommand(input.tenantId, input.email))
    return { sent: true }
  }),

  validateMagicLink: publicProcedure.input(validateMagicLinkInput).mutation(async ({ input }) => {
    const { email, tenantId } = await getCommandBus().execute(
      new ValidateMagicLinkCommand(input.token),
    )
    const result: ResolveLoginResult = await getCommandBus().execute(
      new ResolveLoginCommand('magic_link', email, email, email, tenantId),
    )
    const token = await getJwtService().sign({
      sub: result.actorId,
      tid: result.tenantId,
      tenantName: result.tenantName,
      displayName: result.displayName,
      email: result.email,
      roles: result.roles,
      provider: result.provider,
    })
    return { token }
  }),

  ...(process.env['LOCAL_DEV'] === '1'
    ? {
        devLogin: publicProcedure
          .input(z.object({ email: requestMagicLinkInput.shape.email }))
          .mutation(async ({ input }) => {
            const result: ResolveLoginResult = await getCommandBus().execute(
              new DevLoginCommand(input.email),
            )
            const token = await getJwtService().sign({
              sub: result.actorId,
              tid: result.tenantId,
              tenantName: result.tenantName,
              displayName: result.displayName,
              email: result.email,
              roles: result.roles,
              provider: result.provider,
            })
            return { token }
          }),
      }
    : {}),
})
