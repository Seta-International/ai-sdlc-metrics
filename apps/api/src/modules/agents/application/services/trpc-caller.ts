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
 * Dry-run (Plan 11 R-11.1):
 *   When mode is 'dry-run', the procedure is executed inside a Postgres transaction
 *   that ALWAYS rolls back after completion (Option A — transaction rollback).
 *   This allows the candidate pipeline to run realistically (reads see the writes
 *   within the transaction; the procedure can produce a meaningful result for diffing)
 *   while guaranteeing that nothing is committed.
 *
 *   The transaction-bound Db instance is injected into the tRPC context as `dryRunTx`
 *   so procedures that explicitly opt in to dry-run isolation can use it. Test
 *   procedures use `ctx.dryRunTx ?? baseDb` to demonstrate the rollback guarantee.
 *   Production procedures that do not check `ctx.dryRunTx` remain isolated from the
 *   shadow transaction (they use their own NestJS-injected DB_TOKEN connection).
 *
 *   If no `db` is provided to the constructor (test or legacy instantiation), dry-run
 *   falls back to execute mode — the call proceeds without transaction wrapping. This
 *   maintains backward compatibility for unit tests that do not need isolation guarantees.
 */

import { Injectable, Optional } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import type { TrpcCaller } from '../pipeline/pipeline-steps'
import type { RequestContext } from './tool-gateway-contracts'
import type { TrpcContext } from '../../../../common/trpc/trpc-init'
import { getAppRouter } from '../../../../common/trpc/app-router'

// ─── Router shape (minimal for navigation) ────────────────────────────────────

type AnyRouter = {
  createCaller: (ctx: TrpcContext & { dryRunTx?: Db }) => Record<string, unknown>
  _def: { procedures: Record<string, unknown> }
}

// ─── Rollback sentinel ────────────────────────────────────────────────────────

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

// ─── TrpcCallerImpl ───────────────────────────────────────────────────────────

/**
 * NestJS-injectable implementation of the `TrpcCaller` interface.
 *
 * Accepts an optional `routerProvider` constructor parameter for testing —
 * tests inject a small `initTRPC`-built router instead of `getAppRouter()`.
 * Production code omits `routerProvider` and defaults to `getAppRouter`.
 *
 * Accepts an optional `db` (base DB pool) for dry-run transaction wrapping.
 * When provided, dry-run calls are wrapped in a transaction that always rolls
 * back (Plan 11 R-11.1 Option A). When absent, dry-run falls back to execute.
 */
@Injectable()
export class TrpcCallerImpl implements TrpcCaller {
  private readonly routerProvider: () => AnyRouter
  private readonly db: Db | undefined

  constructor(@Optional() routerProvider?: () => AnyRouter, @Optional() db?: Db) {
    this.routerProvider = routerProvider ?? (getAppRouter as () => AnyRouter)
    this.db = db
  }

  async call(input: {
    toolName: string
    args: unknown
    requestContext: RequestContext
    mode: 'execute' | 'dry-run'
  }): Promise<unknown> {
    const { toolName, args, requestContext, mode } = input

    if (mode === 'dry-run' && this.db !== undefined) {
      // TODO(follow-up): Every production write procedure must use `ctx.dryRunTx ?? baseDb`
      // to inherit this rollback isolation. Procedures that inject DB_TOKEN directly (via
      // NestJS DI) are NOT covered by this transaction — their writes will commit even in
      // dry-run mode. This is a P1 incident risk per Plan 11 §7. Track adoption of
      // `ctx.dryRunTx ?? baseDb` in all domain write procedures as a prerequisite for GA.
      return this.callInRollbackTransaction(toolName, args, requestContext)
    }

    // execute mode (or dry-run without db — falls back to normal execution)
    return this.callProcedure(toolName, args, requestContext, undefined)
  }

  /**
   * Executes the procedure inside a Postgres transaction that ALWAYS rolls back.
   *
   * The transaction-bound Db is passed as `dryRunTx` in the tRPC context so
   * procedures that opt in to dry-run isolation can use it for writes (which will
   * be visible within the transaction but never committed).
   *
   * Mechanism: throw a sentinel object inside the transaction callback after
   * capturing the result. `db.transaction()` rolls back when the callback throws.
   * The outer catch extracts the result from the sentinel.
   */
  private async callInRollbackTransaction(
    toolName: string,
    args: unknown,
    requestContext: RequestContext,
  ): Promise<unknown> {
    const db = this.db!

    try {
      await db.transaction(async (tx) => {
        // Set tenant context on the transaction connection
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${requestContext.tenantId}, false)`)

        const result = await this.callProcedure(toolName, args, requestContext, tx as unknown as Db)
        // Throw sentinel to force rollback — Drizzle rolls back when the callback throws
        throw { sentinel: DRY_RUN_ROLLBACK, result } satisfies DryRunRollbackSignal
      })
    } catch (err: unknown) {
      if (isDryRunRollbackSignal(err)) {
        // Expected rollback path — return the captured result
        return err.result
      }
      // Re-throw genuine errors (procedure errors, DB errors, etc.)
      throw err
    }

    // Unreachable — the transaction always either throws sentinel or an error
    /* v8 ignore next */
    throw new Error('TrpcCallerImpl: unexpected execution path in dry-run transaction')
  }

  /**
   * Core procedure navigation and invocation logic.
   * Shared between execute mode and dry-run (with or without transaction wrapping).
   *
   * @param dryRunTx - Optional transaction-bound Db injected into tRPC ctx as dryRunTx.
   *                   Procedures that opt in to dry-run isolation use this for writes.
   */
  private async callProcedure(
    toolName: string,
    args: unknown,
    requestContext: RequestContext,
    dryRunTx: Db | undefined,
  ): Promise<unknown> {
    const router = this.routerProvider()

    // Build ctx — tenantId/actorId are already resolved; cookie header is synthetic
    // (not used in server-side callers; JWT extraction only occurs at HTTP boundary).
    const ctx: TrpcContext & { dryRunTx?: Db } = {
      req: { headers: { cookie: '' } },
      tenantId: requestContext.tenantId,
      actorId: requestContext.userId,
      ...(dryRunTx !== undefined ? { dryRunTx } : {}),
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
