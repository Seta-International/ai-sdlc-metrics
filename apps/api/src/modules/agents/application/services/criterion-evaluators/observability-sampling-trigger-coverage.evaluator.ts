import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import { METRICS_QUERY_PORT } from '../../../domain/ports/metrics-query.port'

const CRITERION_ID = '18.4.stratified_sampling_trigger_coverage'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.4 — Stratified Sampling Trigger Coverage
 *
 * observed = count of distinct sampling triggers fired at least once in the last 30d
 * passed   = count >= 5 (all 5 triggers covered)
 */
@Injectable()
export class ObservabilitySamplingTriggerCoverageEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.4' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(METRICS_QUERY_PORT) private readonly metricsQuery: MetricsQueryPort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    const count = await this.metricsQuery.sumCounter({
      metricName: 'agent_sampling_trigger_coverage_count',
      window,
    })

    if (count === null) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    return {
      observedValue: String(count),
      threshold,
      passed: count >= Number(threshold),
    }
  }
}
