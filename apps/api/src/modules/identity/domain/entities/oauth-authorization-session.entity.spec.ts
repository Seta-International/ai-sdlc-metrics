import { describe, expect, it } from 'vitest'
import { OAuthAuthorizationSessionEntity } from './oauth-authorization-session.entity'

describe('OAuthAuthorizationSessionEntity', () => {
  const baseProps = {
    id: 'session-id',
    tenantId: 'tenant-id',
    providerId: 'provider-id',
    providerType: 'microsoft' as const,
    nonceHash: 'nonce-hash',
    stateHash: 'state-hash',
    callbackUri: 'http://localhost:3000/auth/callback/microsoft',
    redirectTo: 'http://localhost:3001',
    expiresAt: new Date('2026-04-24T10:00:00Z'),
    consumedAt: null,
    createdAt: new Date('2026-04-24T09:00:00Z'),
  }

  describe('isExpired', () => {
    it('expires oauth sessions by timestamp', () => {
      const session = OAuthAuthorizationSessionEntity.create({
        id: 'session-id',
        tenantId: 'tenant-id',
        providerId: 'provider-id',
        providerType: 'microsoft',
        nonceHash: 'nonce-hash',
        stateHash: 'state-hash',
        callbackUri: 'http://localhost:3000/auth/callback/microsoft',
        redirectTo: 'http://localhost:3001',
        expiresAt: new Date('2026-04-24T10:00:00Z'),
      })
      expect(session.isExpired(new Date('2026-04-24T10:01:00Z'))).toBe(true)
    })

    it('returns false when session is not yet expired', () => {
      const session = OAuthAuthorizationSessionEntity.create({
        id: 'session-id',
        tenantId: 'tenant-id',
        providerId: 'provider-id',
        providerType: 'microsoft',
        nonceHash: 'nonce-hash',
        stateHash: 'state-hash',
        callbackUri: 'http://localhost:3000/auth/callback/microsoft',
        redirectTo: 'http://localhost:3001',
        expiresAt: new Date('2026-04-24T10:00:00Z'),
      })
      expect(session.isExpired(new Date('2026-04-24T09:59:00Z'))).toBe(false)
    })
  })

  describe('isConsumed', () => {
    it('returns false when consumedAt is null', () => {
      const session = OAuthAuthorizationSessionEntity.reconstruct(baseProps)
      expect(session.isConsumed()).toBe(false)
    })

    it('returns true when consumedAt is set', () => {
      const session = OAuthAuthorizationSessionEntity.reconstruct({
        ...baseProps,
        consumedAt: new Date('2026-04-24T09:30:00Z'),
      })
      expect(session.isConsumed()).toBe(true)
    })
  })

  describe('isUsable', () => {
    it('returns true for a valid, unconsumed, unexpired session', () => {
      const session = OAuthAuthorizationSessionEntity.reconstruct(baseProps)
      expect(session.isUsable(new Date('2026-04-24T09:30:00Z'))).toBe(true)
    })

    it('returns false for an expired session', () => {
      const session = OAuthAuthorizationSessionEntity.reconstruct(baseProps)
      expect(session.isUsable(new Date('2026-04-24T10:01:00Z'))).toBe(false)
    })

    it('returns false for a consumed session', () => {
      const session = OAuthAuthorizationSessionEntity.reconstruct({
        ...baseProps,
        consumedAt: new Date('2026-04-24T09:30:00Z'),
      })
      expect(session.isUsable(new Date('2026-04-24T09:35:00Z'))).toBe(false)
    })
  })

  describe('reconstruct', () => {
    it('reconstructs from persistence row', () => {
      const session = OAuthAuthorizationSessionEntity.reconstruct(baseProps)
      expect(session.id).toBe('session-id')
      expect(session.tenantId).toBe('tenant-id')
      expect(session.stateHash).toBe('state-hash')
      expect(session.nonceHash).toBe('nonce-hash')
    })
  })
})
