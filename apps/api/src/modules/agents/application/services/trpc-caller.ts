/**
 * TrpcCallerImpl — server-side tRPC caller for the ToolGateway pipeline.
 * Task 5, Plan 01.
 *
 * Wraps `getAppRouter().createCaller(ctx)` and resolves dot-path tool names
 * (e.g. `planner.task.getBoard`) to nested router procedures.
 *
 * Context shape:
 *   The live `TrpcContext` (from trpc-init.ts) expects `{ req, tenantId, actorId }`.
 *   When the gateway calls tools server-side within an already-authenticated request,
 *   we build an adapter ctx from `RequestContext`: tenantId + userId (= actorId) +
 *   a synthetic `req` with an empty cookie header. The cookie header is only consumed
 *   at the HTTP boundary for JWT extraction; in server-side callers the `actorId` and
 *   `tenantId` are already resolved by `RlsMiddleware` and flow directly via ctx — so
 *   the synthetic cookie is safe and intentional.
 *
 * Dry-run:
 *   Interface accepts `mode: 'dry-run'` for Plan 14 compatibility, but MVP does not
 *   implement it. An explicit Error is thrown so callers fail loud rather than silently.
 */

import { Injectable, Optional } from '@nestjs/common'
import type { TrpcCaller } from '../pipeline/pipeline-steps'
import type { RequestContext } from './tool-gateway-contracts'
import type { TrpcContext } from '../../../../common/trpc/trpc-init'
import { getAppRouter } from '../../../../common/trpc/app-router'

// ─── Router shape (minimal for navigation) ────────────────────────────────────

type AnyRouter = {
  createCaller: (ctx: TrpcContext) => Record<string, unknown>
  _def: { procedures: Record<string, unknown> }
}

// ─── TrpcCallerImpl ───────────────────────────────────────────────────────────

/**
 * NestJS-injectable implementation of the `TrpcCaller` interface.
 *
 * Accepts an optional `routerProvider` constructor parameter for testing —
 * tests inject a small `initTRPC`-built router instead of `getAppRouter()`.
 * Production code omits `routerProvider` and defaults to `getAppRouter`.
 */
@Injectable()
export class TrpcCallerImpl implements TrpcCaller {
  private readonly routerProvider: () => AnyRouter

  constructor(@Optional() routerProvider?: () => AnyRouter) {
    this.routerProvider = routerProvider ?? (getAppRouter as () => AnyRouter)
  }

  async call(input: {
    toolName: string
    args: unknown
    requestContext: RequestContext
    mode: 'execute' | 'dry-run'
  }): Promise<unknown> {
    const { toolName, args, requestContext, mode } = input

    if (mode === 'dry-run') {
      throw new Error(
        `TrpcCallerImpl: dry-run not supported at MVP. ` +
          `This mode is reserved for Plan 14. Received toolName="${toolName}".`,
      )
    }

    const router = this.routerProvider()

    // Build ctx — tenantId/actorId are already resolved; cookie header is synthetic
    // (not used in server-side callers; JWT extraction only occurs at HTTP boundary).
    const ctx: TrpcContext = {
      req: { headers: { cookie: '' } },
      tenantId: requestContext.tenantId,
      actorId: requestContext.userId,
    }

    const caller = router.createCaller(ctx)

    // Navigate dot-path: 'planner.task.getBoard' → caller.planner.task.getBoard(args)
    // Note: in tRPC v11, createCaller() returns a Proxy — each node (root + sub-routers)
    // is typed as `function`, not `object`. We must allow both when navigating.
    const segments = toolName.split('.')
    let node: unknown = caller

    for (const segment of segments) {
      const t = typeof node
      if (node === null || node === undefined || (t !== 'object' && t !== 'function')) {
        throw new Error(
          `TrpcCallerImpl: cannot navigate to segment "${segment}" in path "${toolName}" — ` +
            `parent is ${node === null ? 'null' : t}.`,
        )
      }
      node = (node as Record<string, unknown>)[segment]
    }

    if (typeof node !== 'function') {
      throw new Error(
        `TrpcCallerImpl: resolved path "${toolName}" is not a callable procedure ` +
          `(got ${node === null ? 'null' : typeof node}).`,
      )
    }

    return (node as (args: unknown) => Promise<unknown>)(args)
  }
}
