import { describe, expect, it } from 'vitest'
import { hashToken, isExpired, MAGIC_LINK_TTL_MS, mintToken } from './magic-link'

describe('mintToken', () => {
  it('returns 43-char base64url string with high entropy', () => {
    const a = mintToken()
    const b = mintToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
  })
})

describe('hashToken', () => {
  it('is deterministic and 32 bytes wide', () => {
    const h1 = hashToken('hello')
    const h2 = hashToken('hello')
    expect(h1.equals(h2)).toBe(true)
    expect(h1.byteLength).toBe(32)
  })
  it('changes when input changes by one char', () => {
    expect(hashToken('hello').equals(hashToken('hellp'))).toBe(false)
  })
})

describe('isExpired', () => {
  const now = new Date('2026-05-18T12:00:00Z')
  it('returns false when expiresAt is in the future', () => {
    expect(isExpired(new Date(now.getTime() + 1000), now)).toBe(false)
  })
  it('returns true when expiresAt is in the past', () => {
    expect(isExpired(new Date(now.getTime() - 1000), now)).toBe(true)
  })
  it('exports MAGIC_LINK_TTL_MS at 10 minutes', () => {
    expect(MAGIC_LINK_TTL_MS).toBe(10 * 60 * 1000)
  })
})
