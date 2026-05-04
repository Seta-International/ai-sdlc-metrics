import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import { METRICS_QUERY_PORT } from '../../../domain/ports/metrics-query.port'

const CRITERION_ID = '18.3.per_turn_cost_p95_variance_week_over_week'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.3 — Per-Turn Cost P95 Variance (Week-over-Week)
 *
 * observed = week-over-week variance ratio of p95 per-turn cost
 * passed   = observed <= 0.10 (≤10%)
 */
@Injectable()
export class CostPerTurnVarianceEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.3' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(METRICS_QUERY_PORT) private readonly metricsQuery: MetricsQueryPort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    if (!this.metricsQuery.isEnabled()) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    const variance = await this.metricsQuery.sumCounter({
      metricName: 'agent_cost_usd_p95_week_over_week_variance',
      window,
    })

    if (variance === null) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    return {
      observedValue: variance.toFixed(4),
      threshold,
      passed: variance <= Number(threshold),
    }
  }
}
