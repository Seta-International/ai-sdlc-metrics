import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import { METRICS_QUERY_PORT } from '../../../domain/ports/metrics-query.port'

const CRITERION_ID = '18.1.drafts_discarded_on_abort'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.1 — Drafts Discarded on Abort
 *
 * Verifies that no draft is persisted when the flow is aborted.
 *
 * observed = agent_drafts_persisted_on_abort_total counter
 * passed   = observed === 0
 */
@Injectable()
export class ReliabilityDraftsDiscardedOnAbortEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.1' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(METRICS_QUERY_PORT) private readonly metrics: MetricsQueryPort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    if (!this.metrics.isEnabled()) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    const persistedOnAbort = await this.metrics.sumCounter({
      metricName: 'agent_drafts_persisted_on_abort_total',
      window,
    })

    if (persistedOnAbort === null) {
      return {
        observedValue: 'unknown',
        threshold,
        passed: false,
        unableToEvaluate: true,
      }
    }

    return {
      observedValue: persistedOnAbort.toString(),
      threshold,
      passed: persistedOnAbort === 0,
      details: { persistedOnAbort },
    }
  }
}
