import { describe, it, expect, vi } from 'vitest'
import { CostBudgetRefusalPrecisionEvaluator } from './cost-budget-refusal-precision.evaluator'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import type { EvalWindow } from './criterion-evaluator.types'

const WINDOW: EvalWindow = { start: new Date('2026-03-26'), end: new Date('2026-04-25') }

function buildMetrics(response: number | null): MetricsQueryPort {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    sumCounter: vi.fn().mockResolvedValue(response),
  }
}

describe('CostBudgetRefusalPrecisionEvaluator', () => {
  it('passes when precision >= 0.99', async () => {
    const metrics = buildMetrics(0.995)
    const evaluator = new CostBudgetRefusalPrecisionEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(true)
    expect(result.observedValue).toBe('0.9950')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('fails when precision < 0.99', async () => {
    const metrics = buildMetrics(0.97)
    const evaluator = new CostBudgetRefusalPrecisionEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.observedValue).toBe('0.9700')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('returns unableToEvaluate when metric is null', async () => {
    const metrics = buildMetrics(null)
    const evaluator = new CostBudgetRefusalPrecisionEvaluator(metrics)

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
    const evaluator = new CostBudgetRefusalPrecisionEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
    expect(metrics.sumCounter).not.toHaveBeenCalled()
  })

  it('has the correct id and section', () => {
    const metrics = buildMetrics(0)
    const evaluator = new CostBudgetRefusalPrecisionEvaluator(metrics)
    expect(evaluator.id).toBe('18.3.budget_refusal_precision')
    expect(evaluator.section).toBe('18.3')
  })
})
