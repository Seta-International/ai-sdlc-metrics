import { Inject, Injectable } from '@nestjs/common'
import { count, eq, and, gte } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentTurnSamplingDecisions } from '../../infrastructure/schema/agents.schema'
import { setTenantTraceQuotaUsed } from '../../infrastructure/observability/observability-metrics'
import type { SamplingDecisionReason } from './sampling-decider'

export interface RecordTurnDecisionOpts {
  traceId: string
  tenantId: string
  userId: string
  capture: boolean
  rootDecisionReason: SamplingDecisionReason
  triggersMatchedAtRoot: string[]
  triggersMatchedRetroactively: string[]
  tenantQuotaExhaustedAt?: Date | null
}

export type QuotaCheckResult =
  | { quotaExceeded: false; approachingQuota: boolean }
  | { quotaExceeded: true; exhaustedAt: Date }

const DEFAULT_MAX_SAMPLED_TURNS_PER_DAY = 10_000
const QUOTA_APPROACH_THRESHOLD = 0.8

@Injectable()
export class TurnSamplingDecisionRecorder {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  /**
   * Writes an agent_turn_sampling_decision row.
   * Uses ON CONFLICT DO NOTHING so duplicate calls are safe (trace_id is PK).
   */
  async record(opts: RecordTurnDecisionOpts): Promise<void> {
    await this.db
      .insert(agentTurnSamplingDecisions)
      .values({
        traceId: opts.traceId,
        tenantId: opts.tenantId,
        userId: opts.userId,
        capture: opts.capture,
        rootDecisionReason: opts.rootDecisionReason,
        triggersMatchedAtRoot: opts.triggersMatchedAtRoot,
        triggersMatchedRetroactively: opts.triggersMatchedRetroactively,
        tenantQuotaExhaustedAt: opts.tenantQuotaExhaustedAt ?? null,
      })
      .onConflictDoNothing()
  }

  /**
   * Checks whether the tenant has consumed its daily trace quota.
   *
   * Counts today's (UTC) captured turns and compares against `maxSampledTurnsPerDay`.
   * The caller is responsible for supplying the tenant's configured limit so this
   * recorder does not need to cross into the admin module schema.
   *
   * Returns:
   *   { quotaExceeded: false, approachingQuota: false } — well under quota
   *   { quotaExceeded: false, approachingQuota: true }  — ≥80% consumed
   *   { quotaExceeded: true, exhaustedAt: Date }        — at or above quota
   */
  async checkQuota(opts: {
    tenantId: string
    maxSampledTurnsPerDay?: number
  }): Promise<QuotaCheckResult> {
    const max = opts.maxSampledTurnsPerDay ?? DEFAULT_MAX_SAMPLED_TURNS_PER_DAY

    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    // Sequential awaits — single pooled DB client; no Promise.all.
    const rows = await this.db
      .select({ count: count() })
      .from(agentTurnSamplingDecisions)
      .where(
        and(
          eq(agentTurnSamplingDecisions.tenantId, opts.tenantId),
          eq(agentTurnSamplingDecisions.capture, true),
          gte(agentTurnSamplingDecisions.createdAt, todayStart),
        ),
      )

    const capturedToday = Number(rows[0]?.count ?? 0)

    setTenantTraceQuotaUsed(opts.tenantId, capturedToday / max)

    if (capturedToday >= max) {
      return { quotaExceeded: true, exhaustedAt: new Date() }
    }

    if (capturedToday >= QUOTA_APPROACH_THRESHOLD * max) {
      return { quotaExceeded: false, approachingQuota: true }
    }

    return { quotaExceeded: false, approachingQuota: false }
  }
}
