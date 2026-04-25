import { describe, it, expect, vi } from 'vitest'
import { RolloutShadowModeExercisedEvaluator } from './rollout-shadow-mode-exercised.evaluator'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import type { EvalWindow } from './criterion-evaluator.types'

const WINDOW: EvalWindow = { start: new Date('2026-03-26'), end: new Date('2026-04-25') }

function buildMetrics(response: number | null): MetricsQueryPort {
  return {
    sumCounter: vi.fn().mockResolvedValue(response),
  }
}

describe('RolloutShadowModeExercisedEvaluator', () => {
  it('passes when shadow mode has been active for >= 7 days', async () => {
    const metrics = buildMetrics(14)
    const evaluator = new RolloutShadowModeExercisedEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(true)
    expect(result.observedValue).toBe('14d')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('fails when shadow mode has been active for < 7 days', async () => {
    const metrics = buildMetrics(3)
    const evaluator = new RolloutShadowModeExercisedEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.observedValue).toBe('3d')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('returns unableToEvaluate when metric is null', async () => {
    const metrics = buildMetrics(null)
    const evaluator = new RolloutShadowModeExercisedEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
    expect(result.observedValue).toBe('unknown')
  })

  it('has the correct id and section', () => {
    const metrics = buildMetrics(0)
    const evaluator = new RolloutShadowModeExercisedEvaluator(metrics)
    expect(evaluator.id).toBe('18.5.shadow_mode_interface_exercised')
    expect(evaluator.section).toBe('18.5')
  })
})
