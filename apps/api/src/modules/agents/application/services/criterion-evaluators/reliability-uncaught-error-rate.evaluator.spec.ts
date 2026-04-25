import { describe, it, expect, vi } from 'vitest'
import { ReliabilityUncaughtErrorRateEvaluator } from './reliability-uncaught-error-rate.evaluator'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import type { EvalWindow } from './criterion-evaluator.types'

const WINDOW: EvalWindow = { start: new Date('2026-03-26'), end: new Date('2026-04-25') }

function buildMetrics(responses: (number | null)[]): MetricsQueryPort {
  let callIdx = 0
  return {
    sumCounter: vi.fn().mockImplementation(() => Promise.resolve(responses[callIdx++])),
  }
}

describe('ReliabilityUncaughtErrorRateEvaluator', () => {
  it('passes when error rate <= 0.01', async () => {
    // 5 errors out of 1000 total = 0.005
    const metrics = buildMetrics([5, 1000])
    const evaluator = new ReliabilityUncaughtErrorRateEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(true)
    expect(result.observedValue).toBe('0.005')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('fails when error rate > 0.01', async () => {
    // 20 errors out of 1000 total = 0.02
    const metrics = buildMetrics([20, 1000])
    const evaluator = new ReliabilityUncaughtErrorRateEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.observedValue).toBe('0.02')
  })

  it('returns unableToEvaluate when errors counter is unavailable', async () => {
    const metrics = buildMetrics([null])
    const evaluator = new ReliabilityUncaughtErrorRateEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
  })

  it('returns unableToEvaluate when total counter is unavailable', async () => {
    const metrics = buildMetrics([5, null])
    const evaluator = new ReliabilityUncaughtErrorRateEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
  })

  it('returns passed=true when total = 0', async () => {
    const metrics = buildMetrics([0, 0])
    const evaluator = new ReliabilityUncaughtErrorRateEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(true)
    expect(result.observedValue).toBe('0')
  })

  it('has the correct id and section', () => {
    const metrics = buildMetrics([])
    const evaluator = new ReliabilityUncaughtErrorRateEvaluator(metrics)
    expect(evaluator.id).toBe('18.1.uncaught_error_rate_30d')
    expect(evaluator.section).toBe('18.1')
  })
})
