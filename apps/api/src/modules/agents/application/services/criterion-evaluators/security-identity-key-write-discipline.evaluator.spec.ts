import { describe, it, expect, vi } from 'vitest'
import { SecurityIdentityKeyWriteDisciplineEvaluator } from './security-identity-key-write-discipline.evaluator'
import type { MetricsQueryPort } from '../../../domain/ports/metrics-query.port'
import type { EvalWindow } from './criterion-evaluator.types'

const WINDOW: EvalWindow = { start: new Date('2026-03-26'), end: new Date('2026-04-25') }

function buildMetrics(response: number | null): MetricsQueryPort {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    sumCounter: vi.fn().mockResolvedValue(response),
  }
}

describe('SecurityIdentityKeyWriteDisciplineEvaluator', () => {
  it('passes when no identity key writes were attempted', async () => {
    const metrics = buildMetrics(0)
    const evaluator = new SecurityIdentityKeyWriteDisciplineEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(true)
    expect(result.observedValue).toBe('0')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('fails when identity key writes were attempted', async () => {
    const metrics = buildMetrics(1)
    const evaluator = new SecurityIdentityKeyWriteDisciplineEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.observedValue).toBe('1')
  })

  it('returns unableToEvaluate when metrics are unavailable', async () => {
    const metrics = buildMetrics(null)
    const evaluator = new SecurityIdentityKeyWriteDisciplineEvaluator(metrics)

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
    const evaluator = new SecurityIdentityKeyWriteDisciplineEvaluator(metrics)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
    expect(metrics.sumCounter).not.toHaveBeenCalled()
  })

  it('queries the correct metric name', async () => {
    const metrics = buildMetrics(0)
    const evaluator = new SecurityIdentityKeyWriteDisciplineEvaluator(metrics)

    await evaluator.evaluate(WINDOW)

    expect(metrics.sumCounter).toHaveBeenCalledWith({
      metricName: 'agent_identity_key_write_attempted_total',
      window: WINDOW,
    })
  })

  it('has the correct id and section', () => {
    const metrics = buildMetrics(0)
    const evaluator = new SecurityIdentityKeyWriteDisciplineEvaluator(metrics)
    expect(evaluator.id).toBe('18.2.identity_key_write_discipline_enforced')
    expect(evaluator.section).toBe('18.2')
  })
})
