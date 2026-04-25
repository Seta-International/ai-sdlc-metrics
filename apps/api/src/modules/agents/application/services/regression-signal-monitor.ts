/**
 * regression-signal-monitor.ts — Plan 11 Task 5
 *
 * Evaluates regression signals over a rolling window for an active rollout config.
 * Used by AutoRollbackOrchestrator to decide whether to trigger an automatic rollback.
 *
 * MVP stubs: cost_delta_pct, initiator_approval_drop, router_accuracy_signal all
 * return observed=0 and never trip. Only error_rate is computed from real shadow run data.
 */

import { Inject, Injectable } from '@nestjs/common'
import { and, count, eq, gte } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentRolloutConfig, agentShadowRun } from '../../infrastructure/schema/agents.schema'

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface SignalResult {
  signal: string
  observed: number
  threshold: number
}

export interface EvaluateResult {
  tripped: boolean
  trippedSignals: SignalResult[]
}

export interface EvaluateOpts {
  rolloutConfigId: string
  /** Rolling window in milliseconds, e.g. 15 * 60 * 1000 for 15 minutes. */
  windowMs: number
}

// ─── RegressionSignalMonitor ──────────────────────────────────────────────────

@Injectable()
export class RegressionSignalMonitor {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  /**
   * Evaluates regression signals for the given rollout config over a rolling window.
   *
   * Returns { tripped: false, trippedSignals: [] } when:
   *   - the config does not exist
   *   - the config status is not 'active'
   *
   * All DB queries are awaited sequentially (single pg.PoolClient per request).
   */
  async evaluate(opts: EvaluateOpts): Promise<EvaluateResult> {
    // Step 1: Query rollout config
    const [config] = await this.db
      .select()
      .from(agentRolloutConfig)
      .where(eq(agentRolloutConfig.id, opts.rolloutConfigId))
      .limit(1)

    // Step 2: Guard — inactive or missing config
    if (!config || config.status !== 'active') {
      return { tripped: false, trippedSignals: [] }
    }

    const thresholds = config.regressionThresholds
    const windowStart = new Date(Date.now() - opts.windowMs)

    // Step 3: Count total shadow runs in window
    const totalRows = await this.db
      .select({ count: count() })
      .from(agentShadowRun)
      .where(
        and(
          eq(agentShadowRun.rolloutConfigId, opts.rolloutConfigId),
          eq(agentShadowRun.tenantId, config.tenantId),
          gte(agentShadowRun.ts, windowStart),
        ),
      )

    const totalCount = Number(totalRows[0]?.count ?? 0)

    // Step 4: Count shadow_errored runs in window
    const errorRows = await this.db
      .select({ count: count() })
      .from(agentShadowRun)
      .where(
        and(
          eq(agentShadowRun.rolloutConfigId, opts.rolloutConfigId),
          eq(agentShadowRun.tenantId, config.tenantId),
          eq(agentShadowRun.diffCategory, 'shadow_errored'),
          gte(agentShadowRun.ts, windowStart),
        ),
      )

    const errorCount = Number(errorRows[0]?.count ?? 0)

    // Step 5: Compute signals
    const observedErrorRate = totalCount === 0 ? 0 : errorCount / totalCount

    const signals: SignalResult[] = [
      {
        signal: 'error_rate',
        observed: observedErrorRate,
        threshold: thresholds.error_rate_max,
      },
      // MVP stubs — data pipeline not yet in place; observed=0, never trips
      {
        signal: 'cost_delta_pct',
        observed: 0,
        threshold: thresholds.cost_delta_pct_max,
      },
      {
        signal: 'initiator_approval_drop',
        observed: 0,
        threshold: thresholds.initiator_approval_drop_max,
      },
      {
        signal: 'router_accuracy_signal',
        observed: 0,
        threshold: thresholds.router_accuracy_signal_max,
      },
    ]

    // Step 6: Collect tripped signals (observed > threshold)
    const trippedSignals = signals.filter((s) => s.observed > s.threshold)

    return {
      tripped: trippedSignals.length > 0,
      trippedSignals,
    }
  }
}
