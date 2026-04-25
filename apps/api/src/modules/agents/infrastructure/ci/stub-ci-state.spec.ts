import { describe, it, expect } from 'vitest'
import { StubCiState } from './stub-ci-state'

describe('StubCiState', () => {
  it('returns null for any checkPassed call', async () => {
    const stub = new StubCiState()
    const result = await stub.checkPassed({
      checkName: 'cross-tenant-leak-suite',
      window: { start: new Date(), end: new Date() },
    })
    expect(result).toBeNull()
  })

  it('returns null regardless of check name', async () => {
    const stub = new StubCiState()
    const result = await stub.checkPassed({
      checkName: 'any-check',
      window: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
    })
    expect(result).toBeNull()
  })
})
