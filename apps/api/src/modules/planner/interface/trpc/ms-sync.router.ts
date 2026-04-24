import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { GetGraphCredentialQuery } from '../../../identity/application/queries/get-graph-credential.query'
import { ConnectMsSyncCommand } from '../../application/commands/ms-sync/connect-ms-sync.command'
import { DisconnectMsSyncCommand } from '../../application/commands/ms-sync/disconnect-ms-sync.command'
import { PlannerRouterService } from './planner-router.service'
import { toPlannerTrpcError } from './planner-trpc-error'

function svc() {
  return PlannerRouterService.getInstance()
}

const msSyncBaseInput = z.object({
  tenantId: z.string().uuid(),
  actorId: z.string().uuid(),
})

export const msSyncRouter = router({
  connect: publicProcedure
    .input(
      msSyncBaseInput.extend({
        tenantAdId: z.string().uuid('Tenant (directory) ID must be a UUID'),
        clientId: z.string().uuid('Application (client) ID must be a UUID'),
        clientSecret: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      await svc()
        .command(
          new ConnectMsSyncCommand(input.tenantId, input.actorId, {
            tenantAdId: input.tenantAdId,
            clientId: input.clientId,
            clientSecret: input.clientSecret,
          }),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  disconnect: router({
    pause: publicProcedure.input(msSyncBaseInput).mutation(async ({ input }) => {
      await svc()
        .command(new DisconnectMsSyncCommand(input.tenantId, input.actorId, 'pause'))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

    destroy: publicProcedure.input(msSyncBaseInput).mutation(async ({ input }) => {
      await svc()
        .command(new DisconnectMsSyncCommand(input.tenantId, input.actorId, 'destroy'))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
  }),

  status: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
      }),
    )
    .query(async ({ input }) => {
      const credential = await svc()
        .query(new GetGraphCredentialQuery(input.tenantId))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })

      if (!credential) {
        return {
          connected: false,
          status: null,
          tenantAdId: null,
          clientId: null,
          connectedAt: null,
          lastError: null,
        }
      }

      const c = credential as {
        status: 'active' | 'invalid' | 'paused'
        tenantAdId: string
        clientId: string
        consentedAt: Date
        lastError: string | null
      }

      return {
        connected: true,
        status: c.status,
        tenantAdId: c.tenantAdId,
        clientId: c.clientId,
        connectedAt: c.consentedAt.toISOString(),
        lastError: c.lastError,
      }
    }),
})
