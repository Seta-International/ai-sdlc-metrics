/**
 * rollout.router.ts — Plan 11 Task 6
 *
 * tRPC router for canary rollout lifecycle management. All procedures require
 * the AGENT_ROLLOUT_MANAGE permission (admin-tier gate enforced by the global
 * permission middleware). DB writes are awaited sequentially (single pg.PoolClient
 * per request — never Promise.all for DB queries).
 */

import * as z from 'zod'
import { TRPCError } from '@trpc/server'
import { eq, and, gte, lte } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import {
  agentRolloutConfig,
  agentRolloutEvent,
  agentShadowRun,
} from '../../infrastructure/schema/agents.schema'
import type { AgentRolloutConfigRow } from '../../infrastructure/schema/agents.schema'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { AutoRollbackOrchestrator } from '../../application/services/auto-rollback-orchestrator'
import type { Db } from '@future/db'

// ─── DiffReport shape ─────────────────────────────────────────────────────────

export interface DiffReport {
  rolloutConfigId: string
  totalRuns: number
  identicalCount: number
  minorDifferenceCount: number
  majorDifferenceCount: number
  shadowErroredCount: number
  identicalPct: number
  majorDifferencePct: number
  fromTs: Date
  toTs: Date
}

// ─── Handler types ────────────────────────────────────────────────────────────

export interface RolloutHandlers {
  db: Db
  kernelAuditFacade: Pick<KernelAuditFacade, 'recordEvent'>
  autoRollbackOrchestrator: Pick<AutoRollbackOrchestrator, 'rollback'>
}

// ─── Module-level handler slot ────────────────────────────────────────────────

let handlers: RolloutHandlers | undefined

export function setRolloutHandlers(h: RolloutHandlers): void {
  handlers = h
}

function h(): RolloutHandlers {
  if (!handlers) throw new Error('rolloutHandlers not wired — boot failure')
  return handlers
}

// ─── Input schemas ────────────────────────────────────────────────────────────

const CreateRolloutInput = z.object({
  changeClass: z.enum(['router', 'planner', 'model', 'tool_meta', 'sub_agent_prompt']),
  candidateVersion: z.string().min(1),
  baselineVersion: z.string().min(1),
  shadowEnabled: z.boolean(),
  autoRollbackEnabled: z.boolean(),
  regressionThresholds: z.object({
    error_rate_max: z.number().min(0).max(1),
    cost_delta_pct_max: z.number().min(0).max(1),
    initiator_approval_drop_max: z.number().min(0).max(1),
    router_accuracy_signal_max: z.number().min(0).max(1),
  }),
})

const ShiftPercentageInput = z.object({
  rolloutConfigId: z.string().uuid(),
  toPercentage: z.number().min(0).max(100),
  reason: z.string().min(1),
})

const RollbackInput = z.object({
  rolloutConfigId: z.string().uuid(),
  reason: z.string().min(1),
})

const CompleteInput = z.object({
  rolloutConfigId: z.string().uuid(),
})

const GetInput = z.object({
  rolloutConfigId: z.string().uuid(),
})

const GetDiffReportInput = z.object({
  rolloutConfigId: z.string().uuid(),
  fromTs: z.coerce.date(),
  toTs: z.coerce.date(),
})

// ─── Internal helpers ─────────────────────────────────────────────────────────

function deriveStabilityKey(
  changeClass: 'router' | 'planner' | 'model' | 'tool_meta' | 'sub_agent_prompt',
): 'tenant_id' | 'tenant_id+user_id' {
  return changeClass === 'sub_agent_prompt' ? 'tenant_id+user_id' : 'tenant_id'
}

async function getConfig(
  db: Db,
  rolloutConfigId: string,
  tenantId: string,
): Promise<AgentRolloutConfigRow | undefined> {
  const rows = await db
    .select()
    .from(agentRolloutConfig)
    .where(
      and(eq(agentRolloutConfig.id, rolloutConfigId), eq(agentRolloutConfig.tenantId, tenantId)),
    )
    .limit(1)
  return rows[0]
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const rolloutRouter = router({
  // ── createRollout ───────────────────────────────────────────────────────────

  createRollout: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_ROLLOUT_MANAGE })
    .input(CreateRolloutInput)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.tenantId || !ctx.actorId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant or actor context' })
      }

      const { db, kernelAuditFacade } = h()
      const id = uuidv7()
      const stabilityKey = deriveStabilityKey(input.changeClass)

      const [config] = await db
        .insert(agentRolloutConfig)
        .values({
          id,
          tenantId: ctx.tenantId,
          changeClass: input.changeClass,
          candidateVersion: input.candidateVersion,
          baselineVersion: input.baselineVersion,
          stabilityKey,
          trafficPercentage: '0',
          shadowEnabled: input.shadowEnabled,
          autoRollbackEnabled: input.autoRollbackEnabled,
          regressionThresholds: input.regressionThresholds,
          status: 'drafting',
          createdBy: ctx.actorId,
        })
        .returning()

      await kernelAuditFacade.recordEvent({
        tenantId: ctx.tenantId,
        actorId: ctx.actorId,
        eventType: 'agent.rollout_created',
        module: 'agents',
        subjectId: id,
        payload: { changeClass: input.changeClass, candidateVersion: input.candidateVersion },
      })

      return config as AgentRolloutConfigRow
    }),

  // ── shiftPercentage ─────────────────────────────────────────────────────────

  shiftPercentage: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_ROLLOUT_MANAGE })
    .input(ShiftPercentageInput)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.tenantId || !ctx.actorId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant or actor context' })
      }

      const { db, kernelAuditFacade } = h()

      const config = await getConfig(db, input.rolloutConfigId, ctx.tenantId)
      if (!config) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Rollout config ${input.rolloutConfigId} not found`,
        })
      }

      if (config.status !== 'active' && config.status !== 'drafting') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot shift percentage on a ${config.status} rollout`,
        })
      }

      const isDrafting = config.status === 'drafting'
      const fromPercentage = config.trafficPercentage

      // Update config: activate if drafting, always update percentage
      await db
        .update(agentRolloutConfig)
        .set({
          trafficPercentage: String(input.toPercentage),
          ...(isDrafting ? { status: 'active', activatedAt: new Date() } : {}),
        })
        .where(eq(agentRolloutConfig.id, input.rolloutConfigId))

      // Insert 'activated' event if this is the first shift (was drafting)
      if (isDrafting) {
        await db.insert(agentRolloutEvent).values({
          id: uuidv7(),
          tenantId: ctx.tenantId,
          rolloutConfigId: input.rolloutConfigId,
          eventType: 'activated',
          fromPercentage,
          toPercentage: String(input.toPercentage),
          reason: 'initial activation',
          triggeredBy: `human:${ctx.actorId}`,
        })
      }

      // Always insert 'percentage_shifted' event
      await db.insert(agentRolloutEvent).values({
        id: uuidv7(),
        tenantId: ctx.tenantId,
        rolloutConfigId: input.rolloutConfigId,
        eventType: 'percentage_shifted',
        fromPercentage,
        toPercentage: String(input.toPercentage),
        reason: input.reason,
        triggeredBy: `human:${ctx.actorId}`,
      })

      await kernelAuditFacade.recordEvent({
        tenantId: ctx.tenantId,
        actorId: ctx.actorId,
        eventType: 'agent.rollout_shifted',
        module: 'agents',
        subjectId: input.rolloutConfigId,
        payload: {
          fromPercentage,
          toPercentage: input.toPercentage,
          reason: input.reason,
          activated: isDrafting,
        },
      })
    }),

  // ── rollback ────────────────────────────────────────────────────────────────

  rollback: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_ROLLOUT_MANAGE })
    .input(RollbackInput)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.tenantId || !ctx.actorId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant or actor context' })
      }

      const { autoRollbackOrchestrator } = h()

      await autoRollbackOrchestrator.rollback({
        rolloutConfigId: input.rolloutConfigId,
        trippedSignals: [],
        triggeredBy: 'manual',
      })
    }),

  // ── complete ────────────────────────────────────────────────────────────────

  complete: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_ROLLOUT_MANAGE })
    .input(CompleteInput)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.tenantId || !ctx.actorId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant or actor context' })
      }

      const { db, kernelAuditFacade } = h()

      const config = await getConfig(db, input.rolloutConfigId, ctx.tenantId)
      if (!config) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Rollout config ${input.rolloutConfigId} not found`,
        })
      }

      if (config.status !== 'active') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot complete a ${config.status} rollout — must be active`,
        })
      }

      if (Number(config.trafficPercentage) < 100) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot complete rollout at ${config.trafficPercentage}% — must be at 100%`,
        })
      }

      await db
        .update(agentRolloutConfig)
        .set({
          status: 'completed',
          completedOrRolledBackAt: new Date(),
        })
        .where(eq(agentRolloutConfig.id, input.rolloutConfigId))

      await db.insert(agentRolloutEvent).values({
        id: uuidv7(),
        tenantId: ctx.tenantId,
        rolloutConfigId: input.rolloutConfigId,
        eventType: 'completed',
        fromPercentage: config.trafficPercentage,
        toPercentage: config.trafficPercentage,
        reason: 'operator completed rollout',
        triggeredBy: `human:${ctx.actorId}`,
      })

      await kernelAuditFacade.recordEvent({
        tenantId: ctx.tenantId,
        actorId: ctx.actorId,
        eventType: 'agent.rollout_completed',
        module: 'agents',
        subjectId: input.rolloutConfigId,
        payload: { trafficPercentage: config.trafficPercentage },
      })
    }),

  // ── list ────────────────────────────────────────────────────────────────────

  list: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_ROLLOUT_MANAGE })
    .query(async ({ ctx }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
      }

      const { db } = h()

      return db
        .select()
        .from(agentRolloutConfig)
        .where(eq(agentRolloutConfig.tenantId, ctx.tenantId))
        .orderBy(agentRolloutConfig.createdAt)
    }),

  // ── get ─────────────────────────────────────────────────────────────────────

  get: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_ROLLOUT_MANAGE })
    .input(GetInput)
    .query(async ({ input, ctx }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
      }

      const { db } = h()

      const config = await getConfig(db, input.rolloutConfigId, ctx.tenantId)
      if (!config) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Rollout config ${input.rolloutConfigId} not found`,
        })
      }

      return config
    }),

  // ── getDiffReport ───────────────────────────────────────────────────────────

  getDiffReport: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_ROLLOUT_MANAGE })
    .input(GetDiffReportInput)
    .query(async ({ input, ctx }): Promise<DiffReport> => {
      if (!ctx.tenantId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
      }

      const { db } = h()

      // Query all shadow runs for this rollout config in the time window.
      // We fetch all matching rows and aggregate in-memory to avoid GROUP BY
      // complexity while respecting the sequential-query rule.
      const rows = await db
        .select({
          diffCategory: agentShadowRun.diffCategory,
          count: agentShadowRun.id,
        })
        .from(agentShadowRun)
        .where(
          and(
            eq(agentShadowRun.rolloutConfigId, input.rolloutConfigId),
            eq(agentShadowRun.tenantId, ctx.tenantId),
            gte(agentShadowRun.ts, input.fromTs),
            lte(agentShadowRun.ts, input.toTs),
          ),
        )

      // Aggregate counts per category
      const counts: Record<string, number> = {
        identical: 0,
        minor_difference: 0,
        major_difference: 0,
        shadow_errored: 0,
      }

      for (const row of rows) {
        const cat = row.diffCategory as string
        counts[cat] = (counts[cat] ?? 0) + 1
      }

      const totalRuns =
        counts.identical + counts.minor_difference + counts.major_difference + counts.shadow_errored

      return {
        rolloutConfigId: input.rolloutConfigId,
        totalRuns,
        identicalCount: counts.identical,
        minorDifferenceCount: counts.minor_difference,
        majorDifferenceCount: counts.major_difference,
        shadowErroredCount: counts.shadow_errored,
        identicalPct: totalRuns > 0 ? counts.identical / totalRuns : 0,
        majorDifferencePct: totalRuns > 0 ? counts.major_difference / totalRuns : 0,
        fromTs: input.fromTs,
        toTs: input.toTs,
      }
    }),
})
