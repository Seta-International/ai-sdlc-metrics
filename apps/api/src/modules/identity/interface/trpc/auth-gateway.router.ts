import * as z from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { IdentityQueryFacade } from '../../application/facades/identity-query.facade'

/**
 * Auth gateway router — all procedures use publicProcedure (no Future session required).
 * Handles tenant discovery and SSO flow initiation/completion.
 *
 * Factory function receives the base procedure so tests can pass publicProcedure directly.
 */
export function createAuthGatewayRouter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baseProcedure: any,
  identityFacade: IdentityQueryFacade,
) {
  return router({
    /**
     * Resolve public login options for a tenant identified by slug or email domain.
     * Returns tenant metadata and available SSO methods — no session required.
     */
    getLoginOptions: baseProcedure
      .input(
        z
          .object({
            slug: z.string().min(1).max(100).nullable(),
            emailDomain: z.string().min(1).max(253).nullable(),
          })
          .refine((v) => v.slug !== null || v.emailDomain !== null, {
            message: 'Provide at least one of slug or emailDomain',
          }),
      )
      .query(({ input }: { input: { slug: string | null; emailDomain: string | null } }) =>
        identityFacade.getLoginOptions(input.slug, input.emailDomain),
      ),

    /**
     * Placeholder — Task 5 will implement OAuth flow initiation.
     * Starts an OAuth authorization code flow for the given tenant IdP.
     */
    startOAuth: baseProcedure
      .input(
        z.object({
          tenantId: z.string().uuid(),
          providerId: z.string().uuid(),
        }),
      )
      .mutation(() => {
        throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'startOAuth: not yet implemented' })
      }),

    /**
     * Placeholder — Task 5 will implement OAuth callback handling.
     * Completes the OAuth authorization code flow and issues a session.
     */
    completeOAuth: baseProcedure
      .input(
        z.object({
          code: z.string().min(1),
          state: z.string().min(1),
        }),
      )
      .mutation(() => {
        throw new TRPCError({
          code: 'NOT_IMPLEMENTED',
          message: 'completeOAuth: not yet implemented',
        })
      }),
  })
}

// Static default export — replaced at runtime by TrpcModule with injected facade
// Placeholder mirrors the shape so AppRouter type inference is stable
const noopFacade = {
  getLoginOptions: () => Promise.resolve(null),
} as unknown as IdentityQueryFacade

export const authGatewayRouter = createAuthGatewayRouter(publicProcedure, noopFacade)
