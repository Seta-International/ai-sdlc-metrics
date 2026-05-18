import { describe, expect, it } from 'vitest'
import { deriveCsrfToken } from './csrf'

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

describe('deriveCsrfToken', () => {
  it('is deterministic for a given (sessionId, key) pair', () => {
    const a = deriveCsrfToken('session-1', KEY)
    const b = deriveCsrfToken('session-1', KEY)
    expect(a).toBe(b)
  })

  it('differs for different session ids', () => {
    expect(deriveCsrfToken('session-1', KEY)).not.toBe(deriveCsrfToken('session-2', KEY))
  })

  it('differs for different keys', () => {
    const otherKey = 'f'.repeat(64)
    expect(deriveCsrfToken('session-1', KEY)).not.toBe(deriveCsrfToken('session-1', otherKey))
  })

  it('produces a base64url string ≥ 32 chars', () => {
    const token = deriveCsrfToken('session-1', KEY)
    expect(token).toMatch(/^[A-Za-z0-9\-_]{32,}$/)
  })
})
