import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import { METRICS_QUERY_PORT } from '../../../domain/ports/metrics-query.port'

const CRITERION_ID = '18.2.identity_key_write_discipline_enforced'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.2 — Identity Key Write Discipline Enforced
 *
 * Verifies that no agent path attempted to write an identity key directly.
 *
 * total  = agent_identity_key_write_attempted_total counter
 * passed = total === 0
 */
@Injectable()
export class SecurityIdentityKeyWriteDisciplineEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.2' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(METRICS_QUERY_PORT) private readonly metrics: MetricsQueryPort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    const total = await this.metrics.sumCounter({
      metricName: 'agent_identity_key_write_attempted_total',
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

    return {
      observedValue: total.toString(),
      threshold,
      passed: total === 0,
      details: { total },
    }
  }
}
