import { describe, it, expect } from 'vitest'
import { StubCiState } from './stub-ci-state'

describe('StubCiState', () => {
  it('isEnabled() returns false', () => {
    const stub = new StubCiState()
    expect(stub.isEnabled()).toBe(false)
  })

  it('checkPassed() rejects with a disabled error', async () => {
    const stub = new StubCiState()
    await expect(
      stub.checkPassed({
        checkName: 'cross-tenant-leak-suite',
        window: { start: new Date(), end: new Date() },
      }),
    ).rejects.toThrow(/disabled/)
  })

  it('checkPassed() rejects regardless of check name', async () => {
    const stub = new StubCiState()
    await expect(
      stub.checkPassed({
        checkName: 'any-check',
        window: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
      }),
    ).rejects.toThrow(/disabled/)
  })
})
