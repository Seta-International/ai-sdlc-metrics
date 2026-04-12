import { initTRPC } from '@trpc/server'
import { createAuthMiddleware, type AuthContext } from './auth-middleware'
import type { JwtService } from '../auth/jwt.service'

export interface TrpcMeta {
  permission?: string
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

let _protectedProcedure: typeof t.procedure | null = null

export function initProtectedProcedure(jwtService: JwtService): void {
  const authMiddleware = createAuthMiddleware(jwtService)
  _protectedProcedure = t.procedure.use(authMiddleware as Parameters<typeof t.procedure.use>[0])
}

export function getProtectedProcedure() {
  if (!_protectedProcedure) {
    throw new Error('protectedProcedure not initialized. Call initProtectedProcedure() at startup.')
  }
  return _protectedProcedure
}

export type { AuthContext }
