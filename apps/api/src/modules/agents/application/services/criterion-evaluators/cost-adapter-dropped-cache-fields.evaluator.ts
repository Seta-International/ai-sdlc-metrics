import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import { METRICS_QUERY_PORT } from '../../../domain/ports/metrics-query.port'

const CRITERION_ID = '18.3.adapter_dropped_cache_fields_count'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.3 — Adapter Dropped Cache Fields Count
 *
 * observed = total count of adapter drop events in the window
 * passed   = count === 0 (zero tolerance)
 */
@Injectable()
export class CostAdapterDroppedCacheFieldsEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.3' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(METRICS_QUERY_PORT) private readonly metricsQuery: MetricsQueryPort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    if (!this.metricsQuery.isEnabled()) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    const count = await this.metricsQuery.sumCounter({
      metricName: 'agent_adapter_drop_total',
      window,
    })

    if (count === null) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    return {
      observedValue: String(count),
      threshold,
      passed: count === 0,
    }
  }
}
