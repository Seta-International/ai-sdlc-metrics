import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import { METRICS_QUERY_PORT } from '../../../domain/ports/metrics-query.port'

const CRITERION_ID = '18.1.provider_fallback_success_rate'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.1 — Provider Fallback Success Rate
 *
 * observed = succeeded_fallbacks / attempted_fallbacks
 * passed   = observed >= 0.95
 * Vacuously true (observed = 1.0) when attempted = 0.
 */
@Injectable()
export class ReliabilityProviderFallbackRateEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.1' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(METRICS_QUERY_PORT) private readonly metrics: MetricsQueryPort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    const attempted = await this.metrics.sumCounter({
      metricName: 'agent_provider_fallback_total',
      labels: { result: 'attempted' },
      window,
    })

    if (attempted === null) {
      return {
        observedValue: 'unknown',
        threshold,
        passed: false,
        unableToEvaluate: true,
      }
    }

    if (attempted === 0) {
      // Vacuously true — no fallbacks attempted means nothing failed
      return {
        observedValue: '1.0',
        threshold,
        passed: true,
        details: { attempted: 0, succeeded: 0 },
      }
    }

    const succeeded = await this.metrics.sumCounter({
      metricName: 'agent_provider_fallback_total',
      labels: { result: 'success' },
      window,
    })

    if (succeeded === null) {
      return {
        observedValue: 'unknown',
        threshold,
        passed: false,
        unableToEvaluate: true,
      }
    }

    const observed = succeeded / attempted
    return {
      observedValue: observed.toString(),
      threshold,
      passed: observed >= Number(threshold),
      details: { attempted, succeeded },
    }
  }
}
