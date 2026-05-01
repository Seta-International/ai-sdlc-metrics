import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import { METRICS_QUERY_PORT } from '../../../domain/ports/metrics-query.port'

const CRITERION_ID = '18.3.tier_shift_user_notice_rate'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.3 — Tier Shift User Notice Rate
 *
 * observed = fraction of tier-shift events for which user was notified (0–1 ratio)
 * passed   = observed >= 1.0 (100%)
 */
@Injectable()
export class CostTierShiftUserNoticeRateEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.3' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(METRICS_QUERY_PORT) private readonly metricsQuery: MetricsQueryPort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    if (!this.metricsQuery.isEnabled()) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    const rate = await this.metricsQuery.sumCounter({
      metricName: 'agent_tier_shift_user_notice_rate',
      window,
    })

    if (rate === null) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    return {
      observedValue: rate.toFixed(4),
      threshold,
      passed: rate >= Number(threshold),
    }
  }
}
