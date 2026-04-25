import { describe, it, expect, vi } from 'vitest'
import { ReliabilityProviderFallbackRateEvaluator } from './reliability-provider-fallback-rate.evaluator'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import type { EvalWindow } from './criterion-evaluator.types'

const WINDOW: EvalWindow = { start: new Date('2026-03-26'), end: new Date('2026-04-25') }

function buildMetrics(responses: (number | null)[]): MetricsQueryPort {
  let callIdx = 0
  return {
    sumCounter: vi.fn().mockImplementation(() => Promise.resolve(responses[callIdx++])),
  }
}

describe('ReliabilityProviderFallbackRateEvaluator', () => {
  it('passes when success/attempted >= 0.95', async () => {
    // 95 successes out of 100 attempted = 0.95
    const metrics = buildMetrics([100, 95])
    const evaluator = new ReliabilityProviderFallbackRateEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(true)
    expect(result.observedValue).toBe('0.95')
  })

  it('fails when success/attempted < 0.95', async () => {
    // 80 successes out of 100 attempted = 0.80
    const metrics = buildMetrics([100, 80])
    const evaluator = new ReliabilityProviderFallbackRateEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.observedValue).toBe('0.8')
  })

  it('returns unableToEvaluate when attempted counter is unavailable', async () => {
    const metrics = buildMetrics([null])
    const evaluator = new ReliabilityProviderFallbackRateEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
  })

  it('returns unableToEvaluate when succeeded counter is unavailable', async () => {
    // attempted=10, succeeded=null
    const metrics = buildMetrics([10, null])
    const evaluator = new ReliabilityProviderFallbackRateEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
  })

  it('returns passed=true vacuously when attempted = 0', async () => {
    const metrics = buildMetrics([0])
    const evaluator = new ReliabilityProviderFallbackRateEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(true)
    expect(result.observedValue).toBe('1.0')
  })

  it('has the correct id and section', () => {
    const metrics = buildMetrics([])
    const evaluator = new ReliabilityProviderFallbackRateEvaluator(metrics)
    expect(evaluator.id).toBe('18.1.provider_fallback_success_rate')
    expect(evaluator.section).toBe('18.1')
  })
})
