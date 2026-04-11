import { beforeEach, describe, expect, it } from 'vitest'
import { JwtService } from './jwt.service'
import type { SessionPayload } from './session-payload'

const TEST_SECRET = 'test-secret-key-that-is-at-least-32-bytes-long!'

const VALID_PAYLOAD: Omit<SessionPayload, 'iat' | 'exp'> = {
  sub: '01900000-0000-7000-8000-000000000001',
  tid: '01900000-0000-7000-8000-000000000002',
  roles: ['employee', 'line_manager'],
  provider: 'microsoft',
}

describe('JwtService', () => {
  let service: JwtService

  beforeEach(() => {
    service = new JwtService(TEST_SECRET)
  })

  it('sign and verify round-trip returns the same claims', async () => {
    const token = await service.sign(VALID_PAYLOAD)
    expect(typeof token).toBe('string')

    const result = await service.verify(token)
    expect(result).not.toBeNull()
    expect(result!.sub).toBe(VALID_PAYLOAD.sub)
    expect(result!.tid).toBe(VALID_PAYLOAD.tid)
    expect(result!.roles).toEqual(VALID_PAYLOAD.roles)
    expect(result!.provider).toBe(VALID_PAYLOAD.provider)
    expect(result!.iat).toBeTypeOf('number')
    expect(result!.exp).toBeTypeOf('number')
    expect(result!.exp - result!.iat).toBe(28800)
  })

  it('verify returns null for expired token', async () => {
    const expiredService = new JwtService(TEST_SECRET, -1) // negative TTL = already expired
    const token = await expiredService.sign(VALID_PAYLOAD)

    const result = await service.verify(token)
    expect(result).toBeNull()
  })

  it('verify returns null for tampered token', async () => {
    const token = await service.sign(VALID_PAYLOAD)
    // Flip a character in the signature portion
    const parts = token.split('.')
    parts[2] = parts[2]!.slice(0, -1) + (parts[2]!.endsWith('A') ? 'B' : 'A')
    const tampered = parts.join('.')

    const result = await service.verify(tampered)
    expect(result).toBeNull()
  })

  it('verify returns null for garbage string', async () => {
    const result = await service.verify('not-a-jwt')
    expect(result).toBeNull()
  })

  it('verify returns null for token signed with different secret', async () => {
    const otherService = new JwtService('other-secret-key-that-is-at-least-32-bytes!')
    const token = await otherService.sign(VALID_PAYLOAD)

    const result = await service.verify(token)
    expect(result).toBeNull()
  })

  it('verify rejects tokens with alg:none or mismatched algorithm', async () => {
    // Craft a token with alg:none manually
    const header = btoa(JSON.stringify({ alg: 'none' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
    const body = btoa(
      JSON.stringify({
        sub: VALID_PAYLOAD.sub,
        tid: VALID_PAYLOAD.tid,
        roles: VALID_PAYLOAD.roles,
        provider: VALID_PAYLOAD.provider,
      }),
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
    const noneToken = `${header}.${body}.`

    const result = await service.verify(noneToken)
    expect(result).toBeNull()
  })
})
