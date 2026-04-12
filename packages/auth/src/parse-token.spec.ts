import { describe, expect, it } from 'vitest'
import { parseToken } from './parse-token'

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
    expect(claims!.actorId).toBe('01900000-0000-7000-8000-000000000001')
    expect(claims!.tenantId).toBe('01900000-0000-7000-8000-000000000002')
    expect(claims!.roles).toEqual(['employee', 'line_manager'])
    expect(claims!.provider).toBe('microsoft')
    expect(claims!.displayName).toBe('Alice')
  })

  it('returns null for malformed token', () => {
    expect(parseToken('not-a-jwt')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseToken('')).toBeNull()
  })
})
