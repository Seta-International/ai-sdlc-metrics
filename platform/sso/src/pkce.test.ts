import { describe, expect, it } from 'vitest'
import { generatePkce } from './pkce'

describe('PKCE generator', () => {
  it('produces a code_verifier in the RFC 7636 charset [A-Za-z0-9-._~] of 43..128 chars', () => {
    const { verifier } = generatePkce()
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/)
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
  })

  it('produces a base64url-encoded S256 challenge (43 chars, no padding)', () => {
    const { challenge } = generatePkce()
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]{43}$/)
  })

  it('produces a different (verifier, challenge) on each call', () => {
    const a = generatePkce()
    const b = generatePkce()
    expect(a.verifier).not.toBe(b.verifier)
    expect(a.challenge).not.toBe(b.challenge)
  })

  it('challenge equals base64url(sha256(verifier))', async () => {
    const { createHash } = await import('node:crypto')
    const { verifier, challenge } = generatePkce()
    const expected = createHash('sha256').update(verifier).digest('base64url')
    expect(challenge).toBe(expected)
  })
})
