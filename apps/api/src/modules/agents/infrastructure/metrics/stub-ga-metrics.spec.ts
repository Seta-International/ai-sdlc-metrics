import { describe, it, expect } from 'vitest'
import { StubGaMetrics } from './stub-ga-metrics'

describe('StubGaMetrics', () => {
  it('isEnabled() returns false', () => {
    const stub = new StubGaMetrics()
    expect(stub.isEnabled()).toBe(false)
  })

  it('getTenantCount() rejects with a disabled error', async () => {
    const stub = new StubGaMetrics()
    await expect(stub.getTenantCount()).rejects.toThrow(/disabled/)
  })

  it('getInteractiveTurnsPerDay() rejects with a disabled error', async () => {
    const stub = new StubGaMetrics()
    await expect(stub.getInteractiveTurnsPerDay()).rejects.toThrow(/disabled/)
  })
})
