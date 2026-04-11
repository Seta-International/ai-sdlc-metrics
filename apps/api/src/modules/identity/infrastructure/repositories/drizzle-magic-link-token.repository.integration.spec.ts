import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
  truncateIdentitySchema,
} from '@future/db/test-helpers'
import { DrizzleMagicLinkTokenRepository } from './drizzle-magic-link-token.repository'

const TENANT = '01900000-0000-7fff-8000-000000000040'

describe('DrizzleMagicLinkTokenRepository', () => {
  const db = createTestDb()
  let repo: DrizzleMagicLinkTokenRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT, slug: 'ml-tenant' })
    repo = new DrizzleMagicLinkTokenRepository(db as never)
  })

  afterAll(async () => {
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
  })

  describe('insert + findByTokenHash', () => {
    it('creates a token and retrieves it by hash', async () => {
      await setTenantContext(db, TENANT)
      const token = await repo.insert({
        tenantId: TENANT,
        email: 'user@seta.vn',
        tokenHash: 'sha256-hash-abc123',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      })

      expect(token.id).toBeDefined()
      expect(token.email).toBe('user@seta.vn')
      expect(token.usedAt).toBeNull()

      const found = await repo.findByTokenHash('sha256-hash-abc123')
      expect(found).not.toBeNull()
      expect(found?.email).toBe('user@seta.vn')
    })

    it('returns null for non-existent hash', async () => {
      await setTenantContext(db, TENANT)
      const found = await repo.findByTokenHash('non-existent-hash')
      expect(found).toBeNull()
    })
  })

  describe('markUsed', () => {
    it('sets usedAt timestamp', async () => {
      await setTenantContext(db, TENANT)
      const token = await repo.insert({
        tenantId: TENANT,
        email: 'used@seta.vn',
        tokenHash: 'sha256-hash-used-001',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      })

      await repo.markUsed(token.id, TENANT)

      const found = await repo.findByTokenHash('sha256-hash-used-001')
      // findByTokenHash only returns unused tokens
      expect(found).toBeNull()
    })
  })

  describe('findByTokenHash excludes expired', () => {
    it('returns null for expired token', async () => {
      await setTenantContext(db, TENANT)
      await repo.insert({
        tenantId: TENANT,
        email: 'expired@seta.vn',
        tokenHash: 'sha256-hash-expired-001',
        expiresAt: new Date(Date.now() - 1000), // already expired
      })

      const found = await repo.findByTokenHash('sha256-hash-expired-001')
      expect(found).toBeNull()
    })
  })
})
