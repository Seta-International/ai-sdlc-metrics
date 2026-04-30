import { describe, it, expect, vi } from 'vitest'
import { ReliabilityTurnCompletedRateEvaluator } from './reliability-turn-completed-rate.evaluator'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import type { EvalWindow } from './criterion-evaluator.types'

const WINDOW: EvalWindow = { start: new Date('2026-03-26'), end: new Date('2026-04-25') }

function buildMetrics(responses: (number | null)[]): MetricsQueryPort {
  let callIdx = 0
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    sumCounter: vi.fn().mockImplementation(() => Promise.resolve(responses[callIdx++])),
  }
}

describe('ReliabilityTurnCompletedRateEvaluator', () => {
  it('passes when completed/total >= 0.99', async () => {
    // 990 completed out of 1000 total = 0.99
    const metrics = buildMetrics([990, 1000])
    const evaluator = new ReliabilityTurnCompletedRateEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(true)
    expect(result.observedValue).toBe('0.99')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('fails when completed/total < 0.99', async () => {
    // 980 completed out of 1000 total = 0.98
    const metrics = buildMetrics([980, 1000])
    const evaluator = new ReliabilityTurnCompletedRateEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.observedValue).toBe('0.98')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('returns unableToEvaluate when completed counter is unavailable', async () => {
    const metrics = buildMetrics([null])
    const evaluator = new ReliabilityTurnCompletedRateEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
    expect(result.observedValue).toBe('unknown')
  })

  it('returns unableToEvaluate when total counter is unavailable', async () => {
    const metrics = buildMetrics([500, null])
    const evaluator = new ReliabilityTurnCompletedRateEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
  })

  it('returns passed=true vacuously when total = 0', async () => {
    const metrics = buildMetrics([0, 0])
    const evaluator = new ReliabilityTurnCompletedRateEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(true)
    expect(result.observedValue).toBe('1.0')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('returns unableToEvaluate when port is disabled and does not invoke sumCounter', async () => {
    const metrics: MetricsQueryPort = {
      isEnabled: vi.fn().mockReturnValue(false),
      sumCounter: vi.fn(),
    }
    const evaluator = new ReliabilityTurnCompletedRateEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
    expect(metrics.sumCounter).not.toHaveBeenCalled()
  })

  it('has the correct id and section', () => {
    const metrics = buildMetrics([])
    const evaluator = new ReliabilityTurnCompletedRateEvaluator(metrics)
    expect(evaluator.id).toBe('18.1.turn_completed_rate_30d')
    expect(evaluator.section).toBe('18.1')
  })
})
