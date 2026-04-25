import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import { METRICS_QUERY_PORT } from '../../../domain/ports/metrics-query.port'

const CRITERION_ID = '18.1.turn_completed_rate_30d'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.1 — Turn Completed Rate (30-day window)
 *
 * observed = completed_turns / total_turns
 * passed   = observed >= 0.99
 * Vacuously true when total = 0 (no turns → no failures).
 */
@Injectable()
export class ReliabilityTurnCompletedRateEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.1' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(METRICS_QUERY_PORT) private readonly metrics: MetricsQueryPort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    const completed = await this.metrics.sumCounter({
      metricName: 'agent_turn_total',
      labels: { reason: 'completed' },
      window,
    })

    if (completed === null) {
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
      // Vacuously true — no turns means no failures
      return {
        observedValue: '1.0',
        threshold,
        passed: true,
        details: { completed: 0, total: 0 },
      }
    }

    const observed = completed / total
    return {
      observedValue: observed.toString(),
      threshold,
      passed: observed >= Number(threshold),
      details: { completed, total },
    }
  }
}
