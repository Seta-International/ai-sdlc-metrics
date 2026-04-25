import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import { METRICS_QUERY_PORT } from '../../../domain/ports/metrics-query.port'

const CRITERION_ID = '18.4.replay_coverage_on_100_sampled'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.4 — Replay Coverage on 100 Sampled Traces
 *
 * observed = fraction of sampled traces that replayed successfully (0–1 ratio)
 * passed   = observed >= 1.0 (100%)
 */
@Injectable()
export class ObservabilityReplayCoverageEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.4' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(METRICS_QUERY_PORT) private readonly metricsQuery: MetricsQueryPort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    const rate = await this.metricsQuery.sumCounter({
      metricName: 'agent_replay_success_rate',
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
