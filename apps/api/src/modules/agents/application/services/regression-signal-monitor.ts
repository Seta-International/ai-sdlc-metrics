/**
 * regression-signal-monitor.ts
 *
 * Evaluates regression signals over a rolling window for an active rollout config.
 * Used by AutoRollbackOrchestrator to decide whether to trigger an automatic rollback.
 *
 * MVP stubs: cost_delta_pct, initiator_approval_drop, router_accuracy_signal are marked
 * disabled and excluded from the trip decision. Only error_rate is computed from real shadow run data.
 */

import { Inject, Injectable } from '@nestjs/common'
import { and, count, eq, gte } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentRolloutConfig, agentShadowRun } from '../../infrastructure/schema/agents.schema'

export interface SignalResult {
  signal: string
  observed: number
  threshold: number
  /** When true, signal data is unavailable; the signal is skipped during evaluation. */
  disabled?: boolean
}

export interface EvaluateResult {
  tripped: boolean
  trippedSignals: SignalResult[]
  /** All evaluated signals including disabled ones (for reporting purposes). */
  signals: SignalResult[]
}

export interface EvaluateOpts {
  rolloutConfigId: string
  /** Rolling window in milliseconds, e.g. 15 * 60 * 1000 for 15 minutes. */
  windowMs: number
}

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
    const [config] = await this.db
      .select()
      .from(agentRolloutConfig)
      .where(eq(agentRolloutConfig.id, opts.rolloutConfigId))
      .limit(1)

    if (!config || config.status !== 'active') {
      return { tripped: false, trippedSignals: [], signals: [] }
    }

    const thresholds = config.regressionThresholds
    const windowStart = new Date(Date.now() - opts.windowMs)

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

    const observedErrorRate = totalCount === 0 ? 0 : errorCount / totalCount

    const signals: SignalResult[] = [
      {
        signal: 'error_rate',
        observed: observedErrorRate,
        threshold: thresholds.error_rate_max,
      },
      // DEFERRED: cost / approval / router_accuracy data pipelines are not yet wired.
      // Marked disabled so the trip evaluation skips them — they do not silently
      // contribute observed=0 to the rollback decision. Wire real evaluators when
      // the data pipelines ship.
      {
        signal: 'cost_delta_pct',
        observed: 0,
        threshold: thresholds.cost_delta_pct_max,
        disabled: true,
      },
      {
        signal: 'initiator_approval_drop',
        observed: 0,
        threshold: thresholds.initiator_approval_drop_max,
        disabled: true,
      },
      {
        signal: 'router_accuracy_signal',
        observed: 0,
        threshold: thresholds.router_accuracy_signal_max,
        disabled: true,
      },
    ]

    const trippedSignals = signals.filter((s) => !s.disabled && s.observed > s.threshold)

    return {
      tripped: trippedSignals.length > 0,
      trippedSignals,
      signals,
    }
  }
}
