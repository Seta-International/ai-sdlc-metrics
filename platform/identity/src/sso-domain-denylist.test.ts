import { describe, expect, it } from 'vitest'
import { isDeniedSsoEmailDomain, normalizeEmailDomain } from './sso-domain-denylist'

describe('normalizeEmailDomain', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmailDomain(' Acme.COM ')).toBe('acme.com')
  })
  it('strips a single trailing dot', () => {
    expect(normalizeEmailDomain('acme.com.')).toBe('acme.com')
  })
  it('returns null for invalid hostnames', () => {
    expect(normalizeEmailDomain('not a domain')).toBeNull()
    expect(normalizeEmailDomain('')).toBeNull()
  })
})

describe('isDeniedSsoEmailDomain', () => {
  it('rejects common public mail providers', () => {
    expect(isDeniedSsoEmailDomain('gmail.com')).toBe(true)
    expect(isDeniedSsoEmailDomain('outlook.com')).toBe(true)
    expect(isDeniedSsoEmailDomain('yahoo.com')).toBe(true)
  })
  it('allows corporate domains', () => {
    expect(isDeniedSsoEmailDomain('acme.com')).toBe(false)
    expect(isDeniedSsoEmailDomain('seta-international.vn')).toBe(false)
  })
  it('normalizes before checking', () => {
    expect(isDeniedSsoEmailDomain(' GMAIL.com ')).toBe(true)
  })
})
