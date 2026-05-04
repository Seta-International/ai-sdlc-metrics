import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import { METRICS_QUERY_PORT } from '../../../domain/ports/metrics-query.port'

const CRITERION_ID = '18.2.kernel_audit_per_tool_call'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.2 — Kernel Audit Per Tool Call
 *
 * Verifies that every tool call has a corresponding kernel audit row (no join misses).
 * The metric `agent_trace_audit_join_miss_total` is emitted by
 * `observability-metrics.ts` via `recordTraceAuditJoinMiss()`.
 *
 * total  = agent_trace_audit_join_miss_total counter
 * passed = total === 0
 */
@Injectable()
export class SecurityKernelAuditPerToolCallEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.2' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(METRICS_QUERY_PORT) private readonly metrics: MetricsQueryPort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    if (!this.metrics.isEnabled()) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    const total = await this.metrics.sumCounter({
      metricName: 'agent_trace_audit_join_miss_total',
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
      details: { joinMisses: total },
    }
  }
}
