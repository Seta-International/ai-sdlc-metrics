import { describe, it, expect } from 'vitest'
import { StubMetricsQuery } from './stub-metrics-query'

describe('StubMetricsQuery', () => {
  it('isEnabled() returns false', () => {
    const stub = new StubMetricsQuery()
    expect(stub.isEnabled()).toBe(false)
  })

  it('sumCounter() rejects with a disabled error', async () => {
    const stub = new StubMetricsQuery()
    await expect(
      stub.sumCounter({
        metricName: 'agent_turn_total',
        window: { start: new Date(), end: new Date() },
      }),
    ).rejects.toThrow(/disabled/)
  })

  it('sumCounter() rejects regardless of labels provided', async () => {
    const stub = new StubMetricsQuery()
    await expect(
      stub.sumCounter({
        metricName: 'any_metric',
        labels: { reason: 'completed' },
        window: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
      }),
    ).rejects.toThrow(/disabled/)
  })
})
