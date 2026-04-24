import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
  truncateIdentitySchema,
} from '@future/db/test-helpers'
import { DrizzleOAuthAuthorizationSessionRepository } from './drizzle-oauth-authorization-session.repository'

const TENANT_A = '01900000-0000-7fff-8000-0000000000b0'
const TENANT_B = '01900000-0000-7fff-8000-0000000000b1'
const PROVIDER_ID = '01900000-0000-7fff-8000-0000000000c0'

describe('DrizzleOAuthAuthorizationSessionRepository', () => {
  const db = createTestDb()
  let repo: DrizzleOAuthAuthorizationSessionRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'oauth-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'oauth-tenant-b' })
    repo = new DrizzleOAuthAuthorizationSessionRepository(db as never)
  })

  afterAll(async () => {
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
  })

  describe('insert + findByStateHash', () => {
    it('creates a session and retrieves it by state hash', async () => {
      await setTenantContext(db, TENANT_A)

      const session = await repo.insert({
        tenantId: TENANT_A,
        providerId: PROVIDER_ID,
        providerType: 'microsoft',
        stateHash: 'state-hash-001',
        nonceHash: 'nonce-hash-001',
        callbackUri: 'http://localhost:3000/auth/callback/microsoft',
        redirectTo: 'http://localhost:3001/callback',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      })

      expect(session.id).toBeDefined()
      expect(session.tenantId).toBe(TENANT_A)
      expect(session.stateHash).toBe('state-hash-001')
      expect(session.consumedAt).toBeNull()

      const found = await repo.findByStateHash('state-hash-001')
      expect(found).not.toBeNull()
      expect(found?.nonceHash).toBe('nonce-hash-001')
    })

    it('returns null for non-existent state hash', async () => {
      await setTenantContext(db, TENANT_A)
      const found = await repo.findByStateHash('non-existent-state')
      expect(found).toBeNull()
    })
  })

  describe('consume', () => {
    it('marks session as consumed and subsequent lookup returns null', async () => {
      await setTenantContext(db, TENANT_A)

      const session = await repo.insert({
        tenantId: TENANT_A,
        providerId: PROVIDER_ID,
        providerType: 'microsoft',
        stateHash: 'state-hash-consume-001',
        nonceHash: 'nonce-hash-consume-001',
        callbackUri: 'http://localhost:3000/auth/callback/microsoft',
        redirectTo: 'http://localhost:3001/callback',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      })

      const consumed = await repo.consume(session.id, TENANT_A)
      expect(consumed).toBe(true)

      // Once consumed, findByStateHash should return null
      const found = await repo.findByStateHash('state-hash-consume-001')
      expect(found).toBeNull()
    })

    it('OAuth session lookup consumes a session once', async () => {
      await setTenantContext(db, TENANT_A)

      const session = await repo.insert({
        tenantId: TENANT_A,
        providerId: PROVIDER_ID,
        providerType: 'google',
        stateHash: 'state-hash-once-001',
        nonceHash: 'nonce-hash-once-001',
        callbackUri: 'http://localhost:3000/auth/callback/google',
        redirectTo: 'http://localhost:3001/callback',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      })

      // First consume returns true — session was consumed
      const firstConsume = await repo.consume(session.id, TENANT_A)
      expect(firstConsume).toBe(true)

      // Second consume returns false — already consumed (race condition guard)
      const secondConsume = await repo.consume(session.id, TENANT_A)
      expect(secondConsume).toBe(false)

      const found = await repo.findByStateHash('state-hash-once-001')
      expect(found).toBeNull()
    })
  })

  describe('expired session', () => {
    it('expired OAuth session cannot be consumed via findByStateHash', async () => {
      await setTenantContext(db, TENANT_A)

      await repo.insert({
        tenantId: TENANT_A,
        providerId: PROVIDER_ID,
        providerType: 'microsoft',
        stateHash: 'state-hash-expired-001',
        nonceHash: 'nonce-hash-expired-001',
        callbackUri: 'http://localhost:3000/auth/callback/microsoft',
        redirectTo: 'http://localhost:3001/callback',
        expiresAt: new Date(Date.now() - 1000), // already expired
      })

      const found = await repo.findByStateHash('state-hash-expired-001')
      expect(found).toBeNull()
    })
  })

  describe('tenant isolation', () => {
    it('findByStateHash is not tenant-scoped (state is globally unique)', async () => {
      await setTenantContext(db, TENANT_A)

      await repo.insert({
        tenantId: TENANT_A,
        providerId: PROVIDER_ID,
        providerType: 'microsoft',
        stateHash: 'state-hash-global-001',
        nonceHash: 'nonce-hash-global-001',
        callbackUri: 'http://localhost:3000/auth/callback/microsoft',
        redirectTo: 'http://localhost:3001/callback',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      })

      // findByStateHash looks up by unique state, not by tenant
      // The caller must verify tenantId after finding
      const found = await repo.findByStateHash('state-hash-global-001')
      expect(found).not.toBeNull()
      expect(found?.tenantId).toBe(TENANT_A)
    })

    it('findByTenantId returns only sessions for that tenant', async () => {
      await setTenantContext(db, TENANT_A)
      const sessions = await repo.findByTenantId(TENANT_A)
      expect(sessions.every((s) => s.tenantId === TENANT_A)).toBe(true)
    })
  })
})
