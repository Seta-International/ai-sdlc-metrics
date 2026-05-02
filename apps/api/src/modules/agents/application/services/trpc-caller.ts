/**
 * TrpcCallerImpl — server-side tRPC caller for the ToolGateway pipeline.
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
 *   When mode is 'dry-run', the procedure is executed inside a Postgres transaction
 *   that ALWAYS rolls back after completion. Drizzle rolls back when the transaction
 *   callback throws — we throw a sentinel symbol after capturing the procedure's
 *   return value, then unwrap it in the outer catch.
 *
 *   The transaction-bound Db is published into the request CLS scope via
 *   RequestDbContextService.setDb(). Every production handler reads its `Db` via
 *   `@Inject(DB_TOKEN)` — the DB_TOKEN provider is a Proxy over BASE_DB_TOKEN that
 *   delegates each property access to whatever `requestDbContext.getDb()` returns.
 *   Pushing the tx into CLS therefore makes every DI'd repository / command handler
 *   transparently route through the rollback transaction for the duration of the
 *   dry-run, with no per-procedure opt-in. After the procedure returns (or throws),
 *   the previous CLS slot is restored so subsequent code in the same request scope
 *   is unaffected.
 *
 *   Known escape hatches that the rollback does NOT cover (intentional, out of scope):
 *     - pg-boss job enqueue (writes to pgboss schema via the boss pool, outside the tx)
 *     - external HTTP / email / S3 calls (no DB at all)
 *   A procedure that issues those side effects under shadow mode will leak them.
 *   None of the agent-invokable production tools currently do so; this is a contract
 *   that should be enforced at PR review until a "shadow-mode" CLS flag is added that
 *   the side-effect services can check.
 *
 *   For unit tests that do not need a real transaction, omit `db` and `requestDbContext`
 *   from the constructor — dry-run will fall back to the execute path.
 */

import { Inject, Injectable, Optional } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import type { TrpcCaller } from '../pipeline/pipeline-steps'
import type { RequestContext } from './tool-gateway-contracts'
import type { TrpcContext } from '../../../../common/trpc/trpc-init'
import { getAppRouter } from '../../../../common/trpc/app-router'
import { RequestDbContextService } from '../../../../common/db/request-db-context.service'

type AnyRouter = {
  createCaller: (ctx: TrpcContext) => Record<string, unknown>
}

/**
 * A unique symbol used to signal that the dry-run transaction should be rolled
 * back after capturing the procedure result. The symbol is thrown inside the
 * transaction callback; the outer handler catches it and extracts the result.
 */
const DRY_RUN_ROLLBACK = Symbol('DRY_RUN_ROLLBACK')

interface DryRunRollbackSignal {
  readonly sentinel: typeof DRY_RUN_ROLLBACK
  readonly result: unknown
}

function isDryRunRollbackSignal(v: unknown): v is DryRunRollbackSignal {
  return (
    typeof v === 'object' && v !== null && (v as DryRunRollbackSignal).sentinel === DRY_RUN_ROLLBACK
  )
}

@Injectable()
export class TrpcCallerImpl implements TrpcCaller {
  private readonly routerProvider: () => AnyRouter
  private readonly db: Db | undefined
  private readonly requestDbContext: RequestDbContextService | undefined

  constructor(
    @Optional() routerProvider?: () => AnyRouter,
    @Optional() db?: Db,
    @Optional() @Inject(RequestDbContextService) requestDbContext?: RequestDbContextService,
  ) {
    this.routerProvider = routerProvider ?? (getAppRouter as () => AnyRouter)
    this.db = db
    this.requestDbContext = requestDbContext
  }

  async call(input: {
    toolName: string
    args: unknown
    requestContext: RequestContext
    mode: 'execute' | 'dry-run'
  }): Promise<unknown> {
    const { toolName, args, requestContext, mode } = input

    if (mode === 'dry-run' && this.db !== undefined && this.requestDbContext !== undefined) {
      return this.callInRollbackTransaction(toolName, args, requestContext)
    }

    // execute mode (or dry-run on a test instance lacking db / requestDbContext)
    return this.callProcedure(toolName, args, requestContext)
  }

  /**
   * Executes the procedure inside a Postgres transaction that ALWAYS rolls back.
   *
   * The transaction-bound Db is published into the request CLS scope so DI'd
   * `DB_TOKEN` proxies route through it for the duration of the procedure call.
   * The previous CLS slot is restored on the way out — both on the rollback path
   * and when the procedure throws a real error.
   */
  private async callInRollbackTransaction(
    toolName: string,
    args: unknown,
    requestContext: RequestContext,
  ): Promise<unknown> {
    const db = this.db!
    const requestDbContext = this.requestDbContext!

    try {
      await db.transaction(async (tx) => {
        // Set tenant context on the transaction connection so RLS policies match.
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${requestContext.tenantId}, false)`)

        const previousDb = requestDbContext.getDb()
        requestDbContext.setDb(tx as unknown as Db)
        try {
          const result = await this.callProcedure(toolName, args, requestContext)
          // Throw sentinel to force rollback — Drizzle rolls back when the callback throws.
          throw { sentinel: DRY_RUN_ROLLBACK, result } satisfies DryRunRollbackSignal
        } finally {
          if (previousDb !== null) {
            requestDbContext.setDb(previousDb)
          } else {
            requestDbContext.clearDb()
          }
        }
      })
    } catch (err: unknown) {
      if (isDryRunRollbackSignal(err)) {
        return err.result
      }
      throw err
    }

    /* v8 ignore next */
    throw new Error('TrpcCallerImpl: unexpected execution path in dry-run transaction')
  }

  /**
   * Core procedure navigation and invocation logic. Shared between execute mode
   * and the inner body of dry-run (the rollback transaction wraps this call).
   */
  private async callProcedure(
    toolName: string,
    args: unknown,
    requestContext: RequestContext,
  ): Promise<unknown> {
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
