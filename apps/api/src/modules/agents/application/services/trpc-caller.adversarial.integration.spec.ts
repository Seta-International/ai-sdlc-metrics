/**
 * Plan 11 §12 Adversarial Integration Test — R-11.1 + audit Theme F guard rail.
 *
 * Acceptance criterion: "seeded adversarial test proves no real writes commit under
 * mode:'dry-run'."
 *
 * Two distinct guarantees are exercised here:
 *
 *   1. Rollback mechanism (R-11.1) — for a mutation procedure that explicitly opts in
 *      to dry-run safety (`meta.agent.shadowSafe: true` AND uses `ctx.dryRunTx ?? baseDb`),
 *      TrpcCallerImpl wraps the call in a Postgres transaction that always rolls back.
 *      The procedure runs and returns a result, but writes never commit.
 *
 *   2. Default-deny guard rail (audit Theme F) — for a mutation procedure that has
 *      NOT declared shadowSafe, TrpcCallerImpl refuses the dry-run invocation with
 *      `ShadowDryRunMutationRefusedError` BEFORE opening any transaction. Writes
 *      cannot leak through DI'd `DB_TOKEN` connections because the procedure body
 *      never executes.
 *
 * Both shapes prove the §12 acceptance criterion: zero rows commit.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initTRPC } from '@trpc/server'
import { sql } from 'drizzle-orm'
import * as z from 'zod'
import { uuidv7 } from 'uuidv7'
import { createTestDb, migrateForTest, seedTenant } from '@future/db/test-helpers'
import type { Db } from '@future/db'
import { TrpcCallerImpl, ShadowDryRunMutationRefusedError } from './trpc-caller'
import type { AgentToolMeta } from '../../../../common/trpc/agent-tool-meta'
import { agentShadowRun, agentRolloutConfig } from '../../infrastructure/schema/agents.schema'
import { eq } from 'drizzle-orm'

// ── Test DB setup ─────────────────────────────────────────────────────────────

const TENANT_ID = '01902f11-0000-7000-8000-000000000e11'
const USER_ID = '01902f11-0000-7000-8000-000000000e12'
const ROLLOUT_ID = '01902f11-0000-7000-8000-000000000e13'
const BASELINE_TRACE_ID = '01902f11-0000-7000-8000-000000000e14'
const SHADOW_TRACE_ID = '01902f11-0000-7000-8000-000000000e15'

// ── Adversarial test tRPC router ──────────────────────────────────────────────

/**
 * A minimal tRPC context that carries an optional transaction-bound Db,
 * matching the production TrpcContext extended with dryRunTx.
 */
interface TestCtx {
  req: { headers: { cookie?: string } }
  tenantId: string | null
  actorId: string | null
  /** Injected by TrpcCallerImpl when mode:'dry-run' — a transaction-bound Db. */
  dryRunTx?: Db
}

/**
 * Build a test router with two mutation procedures writing to agent_shadow_run:
 *
 *   - `adversarial.writeRow` — declares `shadowSafe: true` AND uses `ctx.dryRunTx` →
 *     allowed under dry-run, exercises the transaction rollback mechanism.
 *   - `adversarial.unsafeWriteRow` — no shadowSafe declaration; would write through
 *     the base db → refused by TrpcCallerImpl before the procedure body runs.
 */
function buildAdversarialRouter(baseDb: Db) {
  const t = initTRPC.context<TestCtx>().meta<{ agent: AgentToolMeta }>().create()

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
      writeRow: t.procedure
        .meta({
          agent: {
            whenToUse: 'adversarial test only',
            whenNotToUse: 'never; not a real tool',
            examples: [{ input: 'test', callArgs: {} }],
            approvalFreshness: 'revalidate',
            shadowSafe: true,
          },
        })
        .input(writeInputs)
        .mutation(async ({ input, ctx }) => {
          // shadowSafe: true contract — write through ctx.dryRunTx so the rollback
          // transaction owns the row.
          const db = ctx.dryRunTx ?? baseDb
          await db.insert(agentShadowRun).values({
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
      unsafeWriteRow: t.procedure
        .meta({
          agent: {
            whenToUse: 'adversarial test only',
            whenNotToUse: 'never; not a real tool',
            examples: [{ input: 'test', callArgs: {} }],
            approvalFreshness: 'revalidate',
            // Intentionally NO shadowSafe — represents the production-procedure majority
            // that has not yet been audited / converted to ctx.dryRunTx.
          },
        })
        .input(writeInputs)
        .mutation(async ({ input }) => {
          // Writes via the base db — would commit through the request-bound
          // PoolClient, bypassing any rollback transaction. The guard MUST stop us
          // from ever reaching this body under mode:'dry-run'.
          await baseDb.insert(agentShadowRun).values({
            id: input.id,
            tenantId: input.tenantId,
            baselineTraceId: input.baselineTraceId,
            shadowTraceId: input.shadowTraceId,
            rolloutConfigId: input.rolloutConfigId,
            candidateVersion: input.candidateVersion,
            baselineVersion: input.baselineVersion,
            diffScore: '0.9000',
            diffCategory: 'minor_difference',
            ts: new Date(),
          })
          return { inserted: true, id: input.id }
        }),
    }),
  })
}

// ── Test ──────────────────────────────────────────────────────────────────────

describe('TrpcCallerImpl — adversarial dry-run safety (R-11.1 rollback + audit Theme F default-deny guard)', () => {
  let db: Db

  beforeAll(async () => {
    db = createTestDb()
    await migrateForTest()

    // Truncate relevant tables and seed the required rollout config and tenant
    await db.execute(
      sql`TRUNCATE agents.agent_shadow_run, agents.agent_rollout_config RESTART IDENTITY CASCADE`,
    )
    await db.execute(
      sql`TRUNCATE core.role_permission, core.role_grant, core.user_identity, core.actor, core.department, core.tenant RESTART IDENTITY CASCADE`,
    )
    await seedTenant(db, { id: TENANT_ID, slug: 'adversarial-dry-run-test' })
    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_ID}, false)`)

    // Seed a rollout config row (required by agent_shadow_run FK check in the DB)
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

  it('dry-run: candidate pipeline DOES execute (returns a result — not just refused)', async () => {
    const adversarialRowId = uuidv7()
    const router = buildAdversarialRouter(db)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = new TrpcCallerImpl(() => router as any, db)

    const result = await caller.call({
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
      requestContext: { tenantId: TENANT_ID, userId: USER_ID, traceId: 'tr-1', surface: 'shadow' },
      mode: 'dry-run',
    })

    // The candidate pipeline executed and returned a result — not just refused
    expect(result).toEqual({ inserted: true, id: adversarialRowId })
  })

  it('dry-run: no rows committed to agent_shadow_run after the dry-run call', async () => {
    const adversarialRowId = uuidv7()
    const router = buildAdversarialRouter(db)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = new TrpcCallerImpl(() => router as any, db)

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
      requestContext: { tenantId: TENANT_ID, userId: USER_ID, traceId: 'tr-1', surface: 'shadow' },
      mode: 'dry-run',
    })

    // R-11.1: ZERO rows in agent_shadow_run — the transaction was rolled back
    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_ID}, false)`)
    const rows = await db
      .select()
      .from(agentShadowRun)
      .where(eq(agentShadowRun.id, adversarialRowId))

    expect(rows).toHaveLength(0)
  })

  it('dry-run guard: a mutation WITHOUT shadowSafe is refused before the procedure body runs (audit Theme F)', async () => {
    const adversarialRowId = uuidv7()
    const router = buildAdversarialRouter(db)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = new TrpcCallerImpl(() => router as any, db)

    await expect(
      caller.call({
        toolName: 'adversarial.unsafeWriteRow',
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
    ).rejects.toBeInstanceOf(ShadowDryRunMutationRefusedError)

    // The procedure never ran — zero rows in the table for this id.
    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_ID}, false)`)
    const rows = await db
      .select()
      .from(agentShadowRun)
      .where(eq(agentShadowRun.id, adversarialRowId))
    expect(rows).toHaveLength(0)
  })

  it('execute mode: row IS committed (confirms the write path works without dry-run)', async () => {
    const adversarialRowId = uuidv7()
    const router = buildAdversarialRouter(db)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = new TrpcCallerImpl(() => router as any, db)

    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_ID}, false)`)
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
      requestContext: { tenantId: TENANT_ID, userId: USER_ID, traceId: 'tr-1', surface: 'shadow' },
      mode: 'execute',
    })

    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_ID}, false)`)
    const rows = await db
      .select()
      .from(agentShadowRun)
      .where(eq(agentShadowRun.id, adversarialRowId))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(adversarialRowId)
  })
})
