import { describe, it, expect, vi } from 'vitest'
import { RolloutIntentSlugCoverageEvaluator } from './rollout-intent-slug-coverage.evaluator'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import type { EvalWindow } from './criterion-evaluator.types'

const WINDOW: EvalWindow = { start: new Date('2026-03-26'), end: new Date('2026-04-25') }

function buildMetrics(response: number | null): MetricsQueryPort {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    sumCounter: vi.fn().mockResolvedValue(response),
  }
}

describe('RolloutIntentSlugCoverageEvaluator', () => {
  it('passes when unclassified rate <= 0.02 (≤2%)', async () => {
    const metrics = buildMetrics(0.01)
    const evaluator = new RolloutIntentSlugCoverageEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(true)
    expect(result.observedValue).toBe('0.0100')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('fails when unclassified rate > 0.02', async () => {
    const metrics = buildMetrics(0.05)
    const evaluator = new RolloutIntentSlugCoverageEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.observedValue).toBe('0.0500')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('returns unableToEvaluate when metric is null', async () => {
    const metrics = buildMetrics(null)
    const evaluator = new RolloutIntentSlugCoverageEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
    expect(result.observedValue).toBe('unknown')
  })

  it('returns unableToEvaluate when port is disabled and does not invoke sumCounter', async () => {
    const metrics: MetricsQueryPort = {
      isEnabled: vi.fn().mockReturnValue(false),
      sumCounter: vi.fn(),
    }
    const evaluator = new RolloutIntentSlugCoverageEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
    expect(metrics.sumCounter).not.toHaveBeenCalled()
  })

  it('has the correct id and section', () => {
    const metrics = buildMetrics(0)
    const evaluator = new RolloutIntentSlugCoverageEvaluator(metrics)
    expect(evaluator.id).toBe('18.5.intent_slug_coverage')
    expect(evaluator.section).toBe('18.5')
  })
})
