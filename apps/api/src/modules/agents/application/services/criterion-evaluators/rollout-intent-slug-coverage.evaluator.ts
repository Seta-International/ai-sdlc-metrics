import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import { METRICS_QUERY_PORT } from '../../../domain/ports/metrics-query.port'

const CRITERION_ID = '18.5.intent_slug_coverage'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.5 — Intent Slug Coverage
 *
 * observed = fraction of turns where intent_slug = 'unclassified' (0–1 ratio)
 * passed   = observed <= 0.02 (≤2% unclassified — lower is better)
 */
@Injectable()
export class RolloutIntentSlugCoverageEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.5' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(METRICS_QUERY_PORT) private readonly metricsQuery: MetricsQueryPort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    if (!this.metricsQuery.isEnabled()) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    const rate = await this.metricsQuery.sumCounter({
      metricName: 'agent_intent_slug_unclassified_rate',
      window,
    })

    if (rate === null) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    return {
      observedValue: rate.toFixed(4),
      threshold,
      passed: rate <= Number(threshold),
    }
  }
}
