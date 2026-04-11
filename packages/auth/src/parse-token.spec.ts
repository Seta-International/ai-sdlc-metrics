import { describe, expect, it } from 'vitest'
import { parseToken } from './parse-token'

// Create a base64url-encoded JWT payload (no signature verification — client-side only)
function createFakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  return `${header}.${body}.fake-signature`
}

describe('parseToken', () => {
  it('decodes JWT payload into FutureTokenClaims', () => {
    const token = createFakeJwt({
      sub: '01900000-0000-7000-8000-000000000001',
      tid: '01900000-0000-7000-8000-000000000002',
      roles: ['employee', 'line_manager'],
      provider: 'microsoft',
      displayName: 'Alice',
      email: 'alice@seta.vn',
    })

    const claims = parseToken(token)

    expect(claims).not.toBeNull()
    expect(claims!.actorId).toBe('01900000-0000-7000-8000-000000000001')
    expect(claims!.tenantId).toBe('01900000-0000-7000-8000-000000000002')
    expect(claims!.roles).toEqual(['employee', 'line_manager'])
    expect(claims!.provider).toBe('microsoft')
    expect(claims!.displayName).toBe('Alice')
  })

  it('returns null for malformed token', () => {
    const result = parseToken('not-a-jwt')
    expect(result).toBeNull()
  })

  it('returns null for empty string', () => {
    const result = parseToken('')
    expect(result).toBeNull()
  })
})
