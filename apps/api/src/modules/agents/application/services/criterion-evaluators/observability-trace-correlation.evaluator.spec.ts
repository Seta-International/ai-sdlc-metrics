import { describe, it, expect, vi } from 'vitest'
import { ObservabilityTraceCorrelationEvaluator } from './observability-trace-correlation.evaluator'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import type { EvalWindow } from './criterion-evaluator.types'

const WINDOW: EvalWindow = { start: new Date('2026-03-26'), end: new Date('2026-04-25') }

function buildMetrics(response: number | null): MetricsQueryPort {
  return {
    sumCounter: vi.fn().mockResolvedValue(response),
  }
}

describe('ObservabilityTraceCorrelationEvaluator', () => {
  it('passes when trace correlation rate >= 1.0 (100%)', async () => {
    const metrics = buildMetrics(1.0)
    const evaluator = new ObservabilityTraceCorrelationEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(true)
    expect(result.observedValue).toBe('1.0000')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('fails when trace correlation rate < 1.0', async () => {
    const metrics = buildMetrics(0.95)
    const evaluator = new ObservabilityTraceCorrelationEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.observedValue).toBe('0.9500')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('returns unableToEvaluate when metric is null', async () => {
    const metrics = buildMetrics(null)
    const evaluator = new ObservabilityTraceCorrelationEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
    expect(result.observedValue).toBe('unknown')
  })

  it('has the correct id and section', () => {
    const metrics = buildMetrics(0)
    const evaluator = new ObservabilityTraceCorrelationEvaluator(metrics)
    expect(evaluator.id).toBe('18.4.trace_correlation_end_to_end')
    expect(evaluator.section).toBe('18.4')
  })
})
