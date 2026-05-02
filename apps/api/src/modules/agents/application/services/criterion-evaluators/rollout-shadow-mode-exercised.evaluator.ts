import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import { METRICS_QUERY_PORT } from '../../../domain/ports/metrics-query.port'

const CRITERION_ID = '18.5.shadow_mode_interface_exercised'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

const SHADOW_MODE_MIN_DAYS = 7

/**
 * §18.5 — Shadow Mode Interface Exercised
 *
 * observed = number of days the shadow interface has been active in the window
 * passed   = days >= 7
 * threshold is 'pass' (operational check, not a numeric limit)
 */
@Injectable()
export class RolloutShadowModeExercisedEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.5' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(METRICS_QUERY_PORT) private readonly metricsQuery: MetricsQueryPort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    if (!this.metricsQuery.isEnabled()) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    const days = await this.metricsQuery.sumCounter({
      metricName: 'agent_shadow_mode_duration_days',
      window,
    })

    if (days === null) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    return {
      observedValue: `${days}d`,
      threshold,
      passed: days >= SHADOW_MODE_MIN_DAYS,
    }
  }
}
