import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { TrpcContext } from '../../../../common/trpc/trpc-init'
import { IdentityTrpcService } from './identity-trpc.service'
import { ConfigureIdentityProviderCommand } from '../../application/commands/configure-identity-provider.command'
import { TestIdpConnectionCommand } from '../../application/commands/test-idp-connection.command'
import { GetIdentityProviderQuery } from '../../application/queries/get-identity-provider.query'

type AuthCtx = TrpcContext & { actorId: string; tenantId: string }
const svc = () => IdentityTrpcService.getInstance()

// Factory for permission-aware router
export function createIdentityRouter(
  permissionProtectedProcedure: ReturnType<typeof publicProcedure.use>,
) {
  return router({
    configureProvider: permissionProtectedProcedure
      .meta({ permission: 'admin:tenant:manage' })
      .input(
        z.object({
          providerType: z.enum(['microsoft', 'google']),
          displayName: z.string().min(1).max(100),
          clientId: z.string().min(1).max(255),
          clientSecretRef: z.string().min(1).max(512),
          directoryId: z.string().min(1).max(255).optional(),
          isPrimary: z.boolean(),
          syncEnabled: z.boolean(),
          existingProviderId: z.string().uuid().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { actorId, tenantId } = ctx as unknown as AuthCtx
        return svc().command(
          new ConfigureIdentityProviderCommand(
            tenantId,
            input.providerType,
            input.displayName,
            input.clientId,
            input.clientSecretRef,
            input.directoryId ?? null,
            input.isPrimary,
            input.syncEnabled,
            actorId,
            input.existingProviderId,
          ),
        )
      }),

    getProvider: permissionProtectedProcedure
      .meta({ permission: 'admin:tenant:manage' })
      .query(async ({ ctx }) => {
        const { tenantId } = ctx as unknown as AuthCtx
        return svc().query(new GetIdentityProviderQuery(tenantId))
      }),

    testConnection: permissionProtectedProcedure
      .meta({ permission: 'admin:tenant:manage' })
      .input(z.object({ providerId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { actorId, tenantId } = ctx as unknown as AuthCtx
        return svc().command(new TestIdpConnectionCommand(tenantId, input.providerId, actorId))
      }),
  })
}

// Backward-compatible export (used in app-router)
export const identityRouter = router({})
