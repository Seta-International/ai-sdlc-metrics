import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { IdentityQueryFacade } from '../../application/facades/identity-query.facade'
import { IdentityRouterService } from './identity-router.service'
import { StartOAuthCommand } from '../../application/commands/start-oauth.command'
import { CompleteOAuthCommand } from '../../application/commands/complete-oauth.command'
import type { StartOAuthResult } from '../../application/commands/start-oauth.handler'
import type { CompleteOAuthResult } from '../../application/commands/complete-oauth.handler'

function svc() {
  return IdentityRouterService.getInstance()
}

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
     * Initiate an OAuth authorization code flow for the given tenant IdP.
     * Returns the Microsoft authorization URL to redirect the user to.
     */
    startOAuth: baseProcedure
      .input(
        z.object({
          tenantId: z.string().uuid(),
          providerId: z.string().uuid(),
          /**
           * OAuth redirect_uri — the callback URL registered on the IdP app
           * (e.g. web-shell's /auth/callback/microsoft).
           */
          callbackUri: z.string().url(),
          /**
           * Where to send the user after successful login.
           * Must be a Future zone URL.
           */
          redirectTo: z.string().url(),
        }),
      )
      .mutation(
        ({
          input,
        }: {
          input: { tenantId: string; providerId: string; callbackUri: string; redirectTo: string }
        }) =>
          svc().command(
            new StartOAuthCommand(
              input.tenantId,
              input.providerId,
              input.callbackUri,
              input.redirectTo,
            ),
          ) as Promise<StartOAuthResult>,
      ),

    /**
     * Complete the OAuth authorization code flow and issue a Future session token.
     */
    completeOAuth: baseProcedure
      .input(
        z.object({
          code: z.string().min(1),
          state: z.string().min(1),
          /**
           * OAuth redirect_uri — must match exactly what was sent in startOAuth.
           */
          callbackUri: z.string().url(),
        }),
      )
      .mutation(
        ({ input }: { input: { code: string; state: string; callbackUri: string } }) =>
          svc().command(
            new CompleteOAuthCommand(input.code, input.state, input.callbackUri),
          ) as Promise<CompleteOAuthResult>,
      ),
  })
}

// Static default export — replaced at runtime by TrpcModule with injected facade
// Placeholder mirrors the shape so AppRouter type inference is stable
const noopFacade = {
  getLoginOptions: () => Promise.resolve(null),
} as unknown as IdentityQueryFacade

export const authGatewayRouter = createAuthGatewayRouter(publicProcedure, noopFacade)
