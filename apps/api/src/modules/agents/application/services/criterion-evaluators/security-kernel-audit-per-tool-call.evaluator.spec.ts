import { describe, it, expect, vi } from 'vitest'
import { SecurityKernelAuditPerToolCallEvaluator } from './security-kernel-audit-per-tool-call.evaluator'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import type { EvalWindow } from './criterion-evaluator.types'

const WINDOW: EvalWindow = { start: new Date('2026-03-26'), end: new Date('2026-04-25') }

function buildMetrics(response: number | null): MetricsQueryPort {
  return {
    sumCounter: vi.fn().mockResolvedValue(response),
  }
}

describe('SecurityKernelAuditPerToolCallEvaluator', () => {
  it('passes when join miss total = 0', async () => {
    const metrics = buildMetrics(0)
    const evaluator = new SecurityKernelAuditPerToolCallEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(true)
    expect(result.observedValue).toBe('0')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('fails when join misses are detected', async () => {
    const metrics = buildMetrics(5)
    const evaluator = new SecurityKernelAuditPerToolCallEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.observedValue).toBe('5')
    expect(result.details).toMatchObject({ joinMisses: 5 })
  })

  it('returns unableToEvaluate when metrics are unavailable', async () => {
    const metrics = buildMetrics(null)
    const evaluator = new SecurityKernelAuditPerToolCallEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
    expect(result.observedValue).toBe('unknown')
  })

  it('queries agent_trace_audit_join_miss_total metric', async () => {
    const metrics = buildMetrics(0)
    const evaluator = new SecurityKernelAuditPerToolCallEvaluator(metrics)

    await evaluator.evaluate(WINDOW)

    expect(metrics.sumCounter).toHaveBeenCalledWith({
      metricName: 'agent_trace_audit_join_miss_total',
      window: WINDOW,
    })
  })

  it('has the correct id and section', () => {
    const metrics = buildMetrics(0)
    const evaluator = new SecurityKernelAuditPerToolCallEvaluator(metrics)
    expect(evaluator.id).toBe('18.2.kernel_audit_per_tool_call')
    expect(evaluator.section).toBe('18.2')
  })
})
