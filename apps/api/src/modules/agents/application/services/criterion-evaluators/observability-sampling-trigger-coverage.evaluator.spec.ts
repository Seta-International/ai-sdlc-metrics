import { describe, it, expect, vi } from 'vitest'
import { ObservabilitySamplingTriggerCoverageEvaluator } from './observability-sampling-trigger-coverage.evaluator'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import type { EvalWindow } from './criterion-evaluator.types'

const WINDOW: EvalWindow = { start: new Date('2026-03-26'), end: new Date('2026-04-25') }

function buildMetrics(response: number | null): MetricsQueryPort {
  return {
    sumCounter: vi.fn().mockResolvedValue(response),
  }
}

describe('ObservabilitySamplingTriggerCoverageEvaluator', () => {
  it('passes when all 5 triggers have fired', async () => {
    const metrics = buildMetrics(5)
    const evaluator = new ObservabilitySamplingTriggerCoverageEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(true)
    expect(result.observedValue).toBe('5')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('fails when fewer than 5 triggers have fired', async () => {
    const metrics = buildMetrics(3)
    const evaluator = new ObservabilitySamplingTriggerCoverageEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.observedValue).toBe('3')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('returns unableToEvaluate when metric is null', async () => {
    const metrics = buildMetrics(null)
    const evaluator = new ObservabilitySamplingTriggerCoverageEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
    expect(result.observedValue).toBe('unknown')
  })

  it('has the correct id and section', () => {
    const metrics = buildMetrics(0)
    const evaluator = new ObservabilitySamplingTriggerCoverageEvaluator(metrics)
    expect(evaluator.id).toBe('18.4.stratified_sampling_trigger_coverage')
    expect(evaluator.section).toBe('18.4')
  })
})
