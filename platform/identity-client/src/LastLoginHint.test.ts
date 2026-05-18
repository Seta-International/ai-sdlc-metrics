import { describe, expect, it } from 'vitest'
import { readLastLoginHintCookie } from './LastLoginHint'

function makePayload(p: Record<string, unknown>): string {
  const payloadB64 = Buffer.from(JSON.stringify(p), 'utf8').toString('base64url')
  return `${payloadB64}.unverifiedmac`
}

describe('readLastLoginHintCookie', () => {
  const cookieStr = (kv: Record<string, string>) =>
    Object.entries(kv)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')

  it('returns the embedded hint when present', () => {
    const c = cookieStr({
      seta_last_login: makePayload({
        email: 'a@b.com',
        provider: 'entra',
        tenantDisplayName: 'Acme',
        ts: 1700000000,
      }),
    })
    expect(readLastLoginHintCookie(c)).toEqual({
      email: 'a@b.com',
      provider: 'entra',
      tenantDisplayName: 'Acme',
      ts: 1700000000,
    })
  })

  it('returns null when cookie absent', () => {
    expect(readLastLoginHintCookie('seta_sess=foo')).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    expect(readLastLoginHintCookie('seta_last_login=garbage.mac')).toBeNull()
  })

  it('returns null on missing required fields', () => {
    const c = cookieStr({ seta_last_login: makePayload({ email: 'a@b.com' }) })
    expect(readLastLoginHintCookie(c)).toBeNull()
  })
})
