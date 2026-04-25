import { describe, it, expect } from 'vitest'
import { StubMetricsQuery } from './stub-metrics-query'

describe('StubMetricsQuery', () => {
  it('returns null for any sumCounter call', async () => {
    const stub = new StubMetricsQuery()
    const result = await stub.sumCounter({
      metricName: 'agent_turn_total',
      window: { start: new Date(), end: new Date() },
    })
    expect(result).toBeNull()
  })

  it('returns null regardless of labels provided', async () => {
    const stub = new StubMetricsQuery()
    const result = await stub.sumCounter({
      metricName: 'any_metric',
      labels: { reason: 'completed' },
      window: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
    })
    expect(result).toBeNull()
  })
})
