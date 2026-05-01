import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import { METRICS_QUERY_PORT } from '../../../domain/ports/metrics-query.port'

const CRITERION_ID = '18.5.version_pinning_across_retries_compliance'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.5 — Version Pinning Across Retries Compliance
 *
 * observed = count of retry events where version was not pinned (violations)
 * passed   = count === 0 (zero violations required)
 */
@Injectable()
export class RolloutVersionPinningComplianceEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.5' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(METRICS_QUERY_PORT) private readonly metricsQuery: MetricsQueryPort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    if (!this.metricsQuery.isEnabled()) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    const count = await this.metricsQuery.sumCounter({
      metricName: 'agent_version_pinning_violation_total',
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
