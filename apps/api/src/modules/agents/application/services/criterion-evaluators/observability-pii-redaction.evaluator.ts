import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import { METRICS_QUERY_PORT } from '../../../domain/ports/metrics-query.port'

const CRITERION_ID = '18.4.pii_redaction_at_capture'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.4 — PII Redaction at Capture
 *
 * observed = total count of PII leakage events detected in spans during the window
 * passed   = count === 0 (zero tolerance)
 */
@Injectable()
export class ObservabilityPiiRedactionEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.4' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(METRICS_QUERY_PORT) private readonly metricsQuery: MetricsQueryPort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    if (!this.metricsQuery.isEnabled()) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    const leakCount = await this.metricsQuery.sumCounter({
      metricName: 'agent_pii_redaction_leak_total',
      window,
    })

    if (leakCount === null) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    return {
      observedValue: String(leakCount),
      threshold,
      passed: leakCount === 0,
    }
  }
}
