import { initTRPC } from '@trpc/server'
import { createAuthMiddleware, type AuthContext } from './auth-middleware'
import type { JwtService } from '../auth/jwt.service'
import type { PermissionKey } from '../auth/permissions'
import type { AgentToolMeta } from '../../modules/agents/infrastructure/tool-registry/agent-tool-meta'

export interface TrpcMeta {
  /**
   * Typed against the central PERMISSIONS registry: any new route literal
   * here must exist in `apps/api/src/common/auth/permissions.ts`. TypeScript
   * fails the build on drift, so admins never silently lose access to a
   * freshly-added route.
   */
  permission?: PermissionKey
  /**
   * Optional agent tool metadata. When present, the procedure is registered
   * in the ToolRegistry and exposed to sub-agent runners.
   * Per plan 01 §3 — R-01.11: a tRPC procedure is an agent tool iff
   * `.meta({ agent: {...} })` is present.
   */
  agent?: AgentToolMeta
}

export interface TrpcContext {
  req: { headers: { cookie?: string } }
  tenantId: string | null
  actorId: string | null
}

const t = initTRPC.meta<TrpcMeta>().context<TrpcContext>().create()

export const router = t.router
export const publicProcedure = t.procedure
export const middleware = t.middleware

/**
 * Wraps publicProcedure with the JWT auth middleware. Downstream handlers
 * receive a non-null `actorId` / `tenantId` resolved from the session cookie.
 *
 * Pure factory — no module-global state. The TrpcModule constructs this once
 * at startup and composes it with createProtectedProcedures.
 */
export function createAuthenticatedProcedure(jwtService: JwtService) {
  const authMw = createAuthMiddleware(jwtService)
  return publicProcedure.use(authMw as Parameters<typeof publicProcedure.use>[0])
}

export type { AuthContext }
