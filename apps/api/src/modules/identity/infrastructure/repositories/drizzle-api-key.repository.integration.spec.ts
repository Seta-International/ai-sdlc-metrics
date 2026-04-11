import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  seedActor,
  setTenantContext,
  truncateCoreSchema,
  truncateIdentitySchema,
} from '@future/db/test-helpers'
import { DrizzleApiKeyRepository } from './drizzle-api-key.repository'

const TENANT = '01900000-0000-7fff-8000-000000000050'

describe('DrizzleApiKeyRepository', () => {
  const db = createTestDb()
  let repo: DrizzleApiKeyRepository
  let actorId: string

  beforeAll(async () => {
    await migrateForTest()
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT, slug: 'ak-tenant' })
    await setTenantContext(db, TENANT)
    const actor = await seedActor(db, { tenantId: TENANT, type: 'system' })
    actorId = actor.id
    repo = new DrizzleApiKeyRepository(db as never)
  })

  afterAll(async () => {
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
  })

  describe('insert + findByKeyHash', () => {
    it('creates an API key and retrieves it by hash', async () => {
      await setTenantContext(db, TENANT)
      const key = await repo.insert({
        tenantId: TENANT,
        actorId,
        keyHash: 'sha256-api-key-hash-001',
        keyLastFour: 'h001',
        name: 'CI/CD Pipeline',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      })

      expect(key.id).toBeDefined()
      expect(key.name).toBe('CI/CD Pipeline')
      expect(key.revokedAt).toBeNull()

      const found = await repo.findByKeyHash('sha256-api-key-hash-001', TENANT)
      expect(found).not.toBeNull()
      expect(found?.actorId).toBe(actorId)
    })

    it('returns null for non-existent hash', async () => {
      await setTenantContext(db, TENANT)
      const found = await repo.findByKeyHash('non-existent', TENANT)
      expect(found).toBeNull()
    })
  })

  describe('revoke', () => {
    it('sets revokedAt timestamp', async () => {
      await setTenantContext(db, TENANT)
      const key = await repo.insert({
        tenantId: TENANT,
        actorId,
        keyHash: 'sha256-api-key-hash-revoke-001',
        keyLastFour: 'r001',
        name: 'Revoke Test',
        expiresAt: null,
      })

      await repo.revoke(key.id, TENANT)

      const found = await repo.findByKeyHash('sha256-api-key-hash-revoke-001', TENANT)
      expect(found).not.toBeNull()
      expect(found?.revokedAt).not.toBeNull()
    })
  })

  describe('updateLastUsedAt', () => {
    it('updates the lastUsedAt timestamp', async () => {
      await setTenantContext(db, TENANT)
      const key = await repo.insert({
        tenantId: TENANT,
        actorId,
        keyHash: 'sha256-api-key-hash-used-001',
        keyLastFour: 'u001',
        name: 'Last Used Test',
        expiresAt: null,
      })

      expect(key.lastUsedAt).toBeNull()

      await repo.updateLastUsedAt(key.id, TENANT)

      const found = await repo.findByKeyHash('sha256-api-key-hash-used-001', TENANT)
      expect(found?.lastUsedAt).not.toBeNull()
    })
  })
})
