import { describe, expect, it } from 'vitest'
import { LAST_LOGIN_COOKIE_NAME, readLastLoginHint, signLastLoginHint } from './last-login'

const HMAC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

describe('signLastLoginHint / readLastLoginHint', () => {
  const payload = {
    email: 'alice@acme.com',
    provider: 'entra' as const,
    tenantDisplayName: 'Acme',
    ts: 1700000000,
  }

  it('round-trips', () => {
    const signed = signLastLoginHint(payload, HMAC_KEY)
    expect(readLastLoginHint(signed, HMAC_KEY)).toEqual(payload)
  })

  it('returns null on tampered HMAC', () => {
    const signed = signLastLoginHint(payload, HMAC_KEY)
    const tampered = `${signed.slice(0, -2)}aa`
    expect(readLastLoginHint(tampered, HMAC_KEY)).toBeNull()
  })

  it('returns null on missing cookie', () => {
    expect(readLastLoginHint(undefined, HMAC_KEY)).toBeNull()
    expect(readLastLoginHint('', HMAC_KEY)).toBeNull()
  })

  it('returns null when the payload is not the expected shape', () => {
    const signed = signLastLoginHint({ unrelated: true } as never, HMAC_KEY)
    expect(readLastLoginHint(signed, HMAC_KEY)).toBeNull()
  })

  it('exports the cookie name constant', () => {
    expect(LAST_LOGIN_COOKIE_NAME).toBe('seta_last_login')
  })
})
