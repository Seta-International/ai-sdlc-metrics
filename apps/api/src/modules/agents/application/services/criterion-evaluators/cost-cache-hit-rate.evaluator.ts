import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import { METRICS_QUERY_PORT } from '../../../domain/ports/metrics-query.port'

const CRITERION_ID = '18.3.cache_hit_rate_hot_sessions'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.3 — Cache Hit Rate on Hot Sessions
 *
 * observed = cache hit rate for hot sessions (0–1 ratio)
 * passed   = observed >= 0.60
 */
@Injectable()
export class CostCacheHitRateEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.3' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(METRICS_QUERY_PORT) private readonly metricsQuery: MetricsQueryPort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    const rate = await this.metricsQuery.sumCounter({
      metricName: 'agent_cache_hit_rate_hot_sessions',
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
