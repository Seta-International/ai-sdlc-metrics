/**
 * Plan 11 §12 + audit Theme F — adversarial integration test for dry-run safety.
 *
 * Acceptance criterion: "seeded adversarial test proves no real writes commit under
 * mode:'dry-run'."
 *
 * The mechanism is two-layer:
 *
 *   1. TrpcCallerImpl wraps every dry-run invocation in a Postgres transaction that
 *      ALWAYS rolls back (a sentinel symbol thrown after the procedure returns forces
 *      Drizzle to roll back).
 *
 *   2. The transaction-bound `Db` is published into the request CLS scope via
 *      RequestDbContextService.setDb(). The standard request-bound DB proxy
 *      (`createRequestBoundDbProxy`) reads CLS on every property access, so any
 *      handler that takes its `Db` via `@Inject(DB_TOKEN)` (every production
 *      command/repository) transparently routes through the transaction for the
 *      duration of the dry-run. After the procedure returns, the previous CLS slot
 *      is restored.
 *
 * The test below proves the second layer end-to-end: an adversarial procedure that
 * writes via the request-bound proxy (i.e. exactly the production-procedure shape)
 * sees its INSERT fully rolled back. There is no per-procedure opt-in — the rollback
 * envelope works because the proxy and the tx are both anchored on CLS.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initTRPC } from '@trpc/server'
import { sql } from 'drizzle-orm'
import * as z from 'zod'
import { uuidv7 } from 'uuidv7'
import { ClsService } from 'nestjs-cls'
import { createTestDb, migrateForTest, seedTenant } from '@future/db/test-helpers'
import type { Db } from '@future/db'
import { TrpcCallerImpl } from './trpc-caller'
import { RequestDbContextService } from '../../../../common/db/request-db-context.service'
import { createRequestBoundDbProxy } from '../../../../common/db/request-db.proxy'
import { agentShadowRun, agentRolloutConfig } from '../../infrastructure/schema/agents.schema'
import { eq } from 'drizzle-orm'

// ── Test DB setup ─────────────────────────────────────────────────────────────

const TENANT_ID = '01902f11-0000-7000-8000-000000000e11'
const USER_ID = '01902f11-0000-7000-8000-000000000e12'
const ROLLOUT_ID = '01902f11-0000-7000-8000-000000000e13'
const BASELINE_TRACE_ID = '01902f11-0000-7000-8000-000000000e14'
const SHADOW_TRACE_ID = '01902f11-0000-7000-8000-000000000e15'

interface TestCtx {
  req: { headers: { cookie?: string } }
  tenantId: string | null
  actorId: string | null
}

/**
 * Builds a tRPC router with a single mutation that writes via the supplied `Db`
 * reference. Production handlers receive that reference through `@Inject(DB_TOKEN)`,
 * which resolves to a Proxy reading from CLS — we simulate that here by passing in
 * the request-bound proxy directly.
 */
function buildAdversarialRouter(diInjectedDb: Db) {
  const t = initTRPC.context<TestCtx>().create()

  const writeInputs = z.object({
    id: z.string(),
    tenantId: z.string(),
    baselineTraceId: z.string(),
    shadowTraceId: z.string(),
    rolloutConfigId: z.string(),
    candidateVersion: z.string(),
    baselineVersion: z.string(),
  })

  return t.router({
    adversarial: t.router({
      writeRow: t.procedure.input(writeInputs).mutation(async ({ input }) => {
        // No `ctx.dryRunTx` opt-in — this is the production-procedure shape: every
        // write goes through the DI'd `Db` reference. The CLS handoff in
        // TrpcCallerImpl makes this safe under mode:'dry-run'.
        await diInjectedDb.insert(agentShadowRun).values({
          id: input.id,
          tenantId: input.tenantId,
          baselineTraceId: input.baselineTraceId,
          shadowTraceId: input.shadowTraceId,
          rolloutConfigId: input.rolloutConfigId,
          candidateVersion: input.candidateVersion,
          baselineVersion: input.baselineVersion,
          diffScore: '0.5000',
          diffCategory: 'minor_difference',
          ts: new Date(),
        })
        return { inserted: true, id: input.id }
      }),
    }),
  })
}

// ── Test ──────────────────────────────────────────────────────────────────────

describe('TrpcCallerImpl — adversarial dry-run safety (R-11.1 + CLS handoff)', () => {
  let db: Db
  let cls: ClsService
  let requestDbContext: RequestDbContextService
  let requestBoundDb: Db

  beforeAll(async () => {
    db = createTestDb()
    await migrateForTest()

    // Construct nestjs-cls directly — same pattern as
    // run-with-tenant-context.integration.spec.ts. ClsService takes an
    // AsyncLocalStorage instance that production wires via NestJS DI.
    const als = new AsyncLocalStorage<Map<string, unknown>>()
    cls = new ClsService(als as never)
    requestDbContext = new RequestDbContextService(cls)
    requestBoundDb = createRequestBoundDbProxy(db, () => requestDbContext.getDb())

    await db.execute(
      sql`TRUNCATE agents.agent_shadow_run, agents.agent_rollout_config RESTART IDENTITY CASCADE`,
    )
    await db.execute(
      sql`TRUNCATE core.role_permission, core.role_grant, core.user_identity, core.actor, core.department, core.tenant RESTART IDENTITY CASCADE`,
    )
    await seedTenant(db, { id: TENANT_ID, slug: 'adversarial-dry-run-test' })
    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_ID}, false)`)

    await db.insert(agentRolloutConfig).values({
      id: ROLLOUT_ID,
      tenantId: TENANT_ID,
      changeClass: 'model',
      candidateVersion: 'v2',
      baselineVersion: 'v1',
      stabilityKey: 'tenant_id',
      trafficPercentage: '1.00',
      shadowEnabled: true,
      autoRollbackEnabled: true,
      regressionThresholds: {
        error_rate_max: 0.02,
        cost_delta_pct_max: 0.2,
        initiator_approval_drop_max: 0.1,
        router_accuracy_signal_max: 0.15,
      },
      status: 'active',
      createdBy: USER_ID,
    })
  })

  afterAll(async () => {
    await db.execute(
      sql`TRUNCATE agents.agent_shadow_run, agents.agent_rollout_config RESTART IDENTITY CASCADE`,
    )
    await db.execute(
      sql`TRUNCATE core.role_permission, core.role_grant, core.user_identity, core.actor, core.department, core.tenant RESTART IDENTITY CASCADE`,
    )
  })

  it('dry-run: candidate procedure executes and returns a result', async () => {
    const adversarialRowId = uuidv7()
    const router = buildAdversarialRouter(requestBoundDb)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = new TrpcCallerImpl(() => router as any, db, requestDbContext)

    const result = await cls.run(async () =>
      caller.call({
        toolName: 'adversarial.writeRow',
        args: {
          id: adversarialRowId,
          tenantId: TENANT_ID,
          baselineTraceId: BASELINE_TRACE_ID,
          shadowTraceId: SHADOW_TRACE_ID,
          rolloutConfigId: ROLLOUT_ID,
          candidateVersion: 'v2',
          baselineVersion: 'v1',
        },
        requestContext: {
          tenantId: TENANT_ID,
          userId: USER_ID,
          traceId: 'tr-1',
          surface: 'shadow',
        },
        mode: 'dry-run',
      }),
    )

    expect(result).toEqual({ inserted: true, id: adversarialRowId })
  })

  it('dry-run: no rows commit even though the procedure wrote via the DI-injected Db proxy', async () => {
    const adversarialRowId = uuidv7()
    const router = buildAdversarialRouter(requestBoundDb)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = new TrpcCallerImpl(() => router as any, db, requestDbContext)

    await cls.run(async () =>
      caller.call({
        toolName: 'adversarial.writeRow',
        args: {
          id: adversarialRowId,
          tenantId: TENANT_ID,
          baselineTraceId: BASELINE_TRACE_ID,
          shadowTraceId: SHADOW_TRACE_ID,
          rolloutConfigId: ROLLOUT_ID,
          candidateVersion: 'v2',
          baselineVersion: 'v1',
        },
        requestContext: {
          tenantId: TENANT_ID,
          userId: USER_ID,
          traceId: 'tr-1',
          surface: 'shadow',
        },
        mode: 'dry-run',
      }),
    )

    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_ID}, false)`)
    const rows = await db
      .select()
      .from(agentShadowRun)
      .where(eq(agentShadowRun.id, adversarialRowId))

    expect(rows).toHaveLength(0)
  })

  it('dry-run: CLS slot is restored to its previous value after the procedure returns', async () => {
    const adversarialRowId = uuidv7()
    const router = buildAdversarialRouter(requestBoundDb)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = new TrpcCallerImpl(() => router as any, db, requestDbContext)

    // Sentinel value placed into CLS BEFORE the dry-run; the implementation must
    // restore it after the rollback so subsequent code in the same scope is
    // unaffected.
    const sentinel = createRequestBoundDbProxy(db, () => null) // any unique ref
    await cls.run(async () => {
      requestDbContext.setDb(sentinel)
      await caller.call({
        toolName: 'adversarial.writeRow',
        args: {
          id: adversarialRowId,
          tenantId: TENANT_ID,
          baselineTraceId: BASELINE_TRACE_ID,
          shadowTraceId: SHADOW_TRACE_ID,
          rolloutConfigId: ROLLOUT_ID,
          candidateVersion: 'v2',
          baselineVersion: 'v1',
        },
        requestContext: {
          tenantId: TENANT_ID,
          userId: USER_ID,
          traceId: 'tr-1',
          surface: 'shadow',
        },
        mode: 'dry-run',
      })

      expect(requestDbContext.getDb()).toBe(sentinel)
    })
  })

  it('execute mode: row IS committed (confirms the write path works without dry-run)', async () => {
    const adversarialRowId = uuidv7()
    const router = buildAdversarialRouter(requestBoundDb)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = new TrpcCallerImpl(() => router as any, db, requestDbContext)

    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_ID}, false)`)
    await cls.run(async () =>
      caller.call({
        toolName: 'adversarial.writeRow',
        args: {
          id: adversarialRowId,
          tenantId: TENANT_ID,
          baselineTraceId: BASELINE_TRACE_ID,
          shadowTraceId: SHADOW_TRACE_ID,
          rolloutConfigId: ROLLOUT_ID,
          candidateVersion: 'v2',
          baselineVersion: 'v1',
        },
        requestContext: {
          tenantId: TENANT_ID,
          userId: USER_ID,
          traceId: 'tr-1',
          surface: 'shadow',
        },
        mode: 'execute',
      }),
    )

    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_ID}, false)`)
    const rows = await db
      .select()
      .from(agentShadowRun)
      .where(eq(agentShadowRun.id, adversarialRowId))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(adversarialRowId)
  })
})
