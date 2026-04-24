import * as z from 'zod'
import { router } from '../../../../common/trpc/trpc-init'
import type { GetLoginOptionsHandler } from '../../application/queries/get-login-options.handler'
import { GetLoginOptionsQuery } from '../../application/queries/get-login-options.query'

/**
 * Auth gateway router — all procedures use publicProcedure (no Future session required).
 * Handles tenant discovery and SSO flow initiation/completion.
 *
 * Factory function receives the base procedure so tests can pass publicProcedure directly.
 */
export function createAuthGatewayRouter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baseProcedure: any,
  getLoginOptionsHandler: GetLoginOptionsHandler,
) {
  return router({
    /**
     * Resolve public login options for a tenant identified by slug or email domain.
     * Returns tenant metadata and available SSO methods — no session required.
     */
    getLoginOptions: baseProcedure
      .input(
        z.object({
          slug: z.string().min(1).max(100).nullable(),
          emailDomain: z.string().min(1).max(253).nullable(),
        }),
      )
      .query(({ input }: { input: { slug: string | null; emailDomain: string | null } }) =>
        getLoginOptionsHandler.execute(new GetLoginOptionsQuery(input.slug, input.emailDomain)),
      ),
  })
}

// Static default export — replaced at runtime by TrpcModule with injected handler
// Placeholder mirrors the shape so AppRouter type inference is stable
import { publicProcedure } from '../../../../common/trpc/trpc-init'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noopHandler = { execute: () => Promise.resolve(null) } as any

export const authGatewayRouter = createAuthGatewayRouter(publicProcedure, noopHandler)
