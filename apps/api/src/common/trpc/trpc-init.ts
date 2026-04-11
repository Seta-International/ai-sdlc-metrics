import { initTRPC } from '@trpc/server'
import { createAuthMiddleware } from './auth-middleware'
import type { JwtService } from '../auth/jwt.service'

export interface TrpcContext {
  req: { headers: { cookie?: string } }
}

export interface TrpcMeta {
  permission?: string
}

const t = initTRPC.meta<TrpcMeta>().context<TrpcContext>().create()

export const router = t.router
export const publicProcedure = t.procedure
export const createCallerFactory = t.createCallerFactory
export const middleware = t.middleware

/**
 * Create a protectedProcedure that requires a valid session JWT.
 * Must be initialized with the JwtService at app bootstrap.
 */
let _protectedProcedure: ReturnType<typeof t.procedure.use> | null = null

export function initProtectedProcedure(jwtService: JwtService): void {
  const authMiddleware = createAuthMiddleware(jwtService)
  _protectedProcedure = t.procedure.use(authMiddleware as Parameters<typeof t.procedure.use>[0])
}

export function getProtectedProcedure(): ReturnType<typeof t.procedure.use> {
  if (!_protectedProcedure) {
    throw new Error('protectedProcedure not initialized. Call initProtectedProcedure() at startup.')
  }
  return _protectedProcedure
}
