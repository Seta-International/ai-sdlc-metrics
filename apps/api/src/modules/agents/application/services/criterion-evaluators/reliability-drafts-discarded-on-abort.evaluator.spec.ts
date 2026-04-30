import { describe, it, expect, vi } from 'vitest'
import { ReliabilityDraftsDiscardedOnAbortEvaluator } from './reliability-drafts-discarded-on-abort.evaluator'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import type { EvalWindow } from './criterion-evaluator.types'

const WINDOW: EvalWindow = { start: new Date('2026-03-26'), end: new Date('2026-04-25') }

function buildMetrics(response: number | null): MetricsQueryPort {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    sumCounter: vi.fn().mockResolvedValue(response),
  }
}

describe('ReliabilityDraftsDiscardedOnAbortEvaluator', () => {
  it('passes when no drafts were persisted on abort', async () => {
    const metrics = buildMetrics(0)
    const evaluator = new ReliabilityDraftsDiscardedOnAbortEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(true)
    expect(result.observedValue).toBe('0')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('fails when drafts were persisted on abort', async () => {
    const metrics = buildMetrics(2)
    const evaluator = new ReliabilityDraftsDiscardedOnAbortEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.observedValue).toBe('2')
  })

  it('returns unableToEvaluate when metrics are unavailable', async () => {
    const metrics = buildMetrics(null)
    const evaluator = new ReliabilityDraftsDiscardedOnAbortEvaluator(metrics)

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
    const evaluator = new ReliabilityDraftsDiscardedOnAbortEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
    expect(metrics.sumCounter).not.toHaveBeenCalled()
  })

  it('has the correct id and section', () => {
    const metrics = buildMetrics(0)
    const evaluator = new ReliabilityDraftsDiscardedOnAbortEvaluator(metrics)
    expect(evaluator.id).toBe('18.1.drafts_discarded_on_abort')
    expect(evaluator.section).toBe('18.1')
  })
})
