import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import { METRICS_QUERY_PORT } from '../../../domain/ports/metrics-query.port'

const CRITERION_ID = '18.3.budget_refusal_precision'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.3 — Budget Refusal Precision
 *
 * observed = fraction of budget refusals that were correct (0–1 ratio)
 * passed   = observed >= 0.99
 */
@Injectable()
export class CostBudgetRefusalPrecisionEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.3' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(METRICS_QUERY_PORT) private readonly metricsQuery: MetricsQueryPort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    if (!this.metricsQuery.isEnabled()) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    const precision = await this.metricsQuery.sumCounter({
      metricName: 'agent_budget_refusal_precision',
      window,
    })

    if (precision === null) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    return {
      observedValue: precision.toFixed(4),
      threshold,
      passed: precision >= Number(threshold),
    }
  }
}
