import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import { METRICS_QUERY_PORT } from '../../../domain/ports/metrics-query.port'

const CRITERION_ID = '18.1.uncaught_error_rate_30d'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.1 — Uncaught Error Rate (30-day window)
 *
 * observed = error_turns / total_turns
 * passed   = observed <= 0.01
 * Vacuously true (observed = 0) when total = 0.
 */
@Injectable()
export class ReliabilityUncaughtErrorRateEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.1' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(METRICS_QUERY_PORT) private readonly metrics: MetricsQueryPort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    const errors = await this.metrics.sumCounter({
      metricName: 'agent_turn_total',
      labels: { reason: 'error' },
      window,
    })

    if (errors === null) {
      return {
        observedValue: 'unknown',
        threshold,
        passed: false,
        unableToEvaluate: true,
      }
    }

    const total = await this.metrics.sumCounter({
      metricName: 'agent_turn_total',
      window,
    })

    if (total === null) {
      return {
        observedValue: 'unknown',
        threshold,
        passed: false,
        unableToEvaluate: true,
      }
    }

    if (total === 0) {
      return {
        observedValue: '0',
        threshold,
        passed: true,
        details: { errors: 0, total: 0 },
      }
    }

    const observed = errors / total
    return {
      observedValue: observed.toString(),
      threshold,
      passed: observed <= Number(threshold),
      details: { errors, total },
    }
  }
}
