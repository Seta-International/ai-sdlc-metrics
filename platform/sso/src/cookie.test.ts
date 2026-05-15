import { describe, expect, it } from 'vitest'
import { signCookie, verifyCookie } from './cookie'

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

describe('cookie HMAC', () => {
  it('signs then verifies a payload (roundtrip)', () => {
    const payload = 'session-id-abc'
    const signed = signCookie(payload, KEY)
    const verified = verifyCookie(signed, KEY)
    expect(verified).toBe(payload)
  })

  it('returns null on mutation of payload', () => {
    const signed = signCookie('session-id-abc', KEY)
    const dot = signed.indexOf('.')
    const firstChar = signed[0] ?? 'A'
    const flippedPayload = (firstChar === 'A' ? 'B' : 'A') + signed.slice(1, dot)
    const tampered = `${flippedPayload}${signed.slice(dot)}`
    expect(verifyCookie(tampered, KEY)).toBeNull()
  })

  it('returns null on mutation of signature byte', () => {
    const signed = signCookie('session-id-abc', KEY)
    const lastChar = signed[signed.length - 1] ?? 'A'
    const flipped = signed.slice(0, -1) + (lastChar === 'A' ? 'B' : 'A')
    expect(verifyCookie(flipped, KEY)).toBeNull()
  })

  it('returns null on malformed envelope (no dot)', () => {
    expect(verifyCookie('no-dot-here', KEY)).toBeNull()
  })

  it('returns null on empty payload', () => {
    expect(verifyCookie('', KEY)).toBeNull()
  })

  it('rejects verification when the HMAC key is wrong', () => {
    const signed = signCookie('session-id-abc', KEY)
    const wrongKey = 'f'.repeat(64)
    expect(verifyCookie(signed, wrongKey)).toBeNull()
  })
})
