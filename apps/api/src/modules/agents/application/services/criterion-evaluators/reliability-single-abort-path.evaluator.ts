import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import { METRICS_QUERY_PORT } from '../../../domain/ports/metrics-query.port'

const CRITERION_ID = '18.1.single_abort_path_compliance'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.1 — Single Abort Path Compliance
 *
 * Checks that all aborts went through AbortCoordinator (no bypass).
 *
 * bypassTotal = agent_abort_bypass_total counter
 * passed      = bypassTotal === 0
 * threshold   = '1.0' (meaning 100% compliance — zero bypasses)
 */
@Injectable()
export class ReliabilitySingleAbortPathEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.1' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(METRICS_QUERY_PORT) private readonly metrics: MetricsQueryPort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    if (!this.metrics.isEnabled()) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    const bypassTotal = await this.metrics.sumCounter({
      metricName: 'agent_abort_bypass_total',
      window,
    })

    if (bypassTotal === null) {
      return {
        observedValue: 'unknown',
        threshold,
        passed: false,
        unableToEvaluate: true,
      }
    }

    return {
      observedValue: bypassTotal.toString(),
      threshold,
      passed: bypassTotal === 0,
      details: { bypassTotal },
    }
  }
}
