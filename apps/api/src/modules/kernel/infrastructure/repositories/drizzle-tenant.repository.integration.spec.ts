import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, migrateForTest, truncateCoreSchema } from '@future/db/test-helpers'
import { DrizzleTenantRepository } from './drizzle-tenant.repository'

const TENANT_A = '01900000-0000-7fff-8000-100000000001'
const TENANT_B = '01900000-0000-7fff-8000-100000000002'
const SYSTEM_TENANT_ID = '01900000-0000-7fff-8000-100000000099'

describe('DrizzleTenantRepository', () => {
  const db = createTestDb()
  let repo: DrizzleTenantRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncateCoreSchema(db)
    repo = new DrizzleTenantRepository(db as never)

    // Seed tenants directly via repository
    await repo.insert({ name: 'Tenant A', slug: 'drizzle-tenant-a', planTier: 'starter' })
    await repo.upsertSystemTenant({
      id: TENANT_A,
      slug: 'drizzle-tenant-a-known',
      name: 'Tenant A Known',
    })
    await repo.upsertSystemTenant({
      id: TENANT_B,
      slug: 'drizzle-tenant-b-known',
      name: 'Tenant B Known',
    })
  })

  afterAll(async () => {
    await truncateCoreSchema(db)
  })

  describe('updateStatus', () => {
    it('updates the tenant status and returns true', async () => {
      const updated = await repo.updateStatus(TENANT_A, 'suspended')

      expect(updated).toBe(true)

      const found = await repo.findById(TENANT_A)
      expect(found).not.toBeNull()
      expect(found!.status).toBe('suspended')
    })

    it('can transition status back to active', async () => {
      const updated = await repo.updateStatus(TENANT_A, 'active')

      expect(updated).toBe(true)

      const found = await repo.findById(TENANT_A)
      expect(found!.status).toBe('active')
    })

    it('returns false when tenant does not exist', async () => {
      const nonExistentId = '01900000-0000-7fff-8000-000000000000'

      const updated = await repo.updateStatus(nonExistentId, 'suspended')

      expect(updated).toBe(false)
    })
  })

  describe('upsertSystemTenant', () => {
    it('creates the system tenant if it does not exist', async () => {
      const result = await repo.upsertSystemTenant({
        id: SYSTEM_TENANT_ID,
        slug: 'future-system-test',
        name: 'Future System Test',
      })

      expect(result).not.toBeNull()
      expect(result.id).toBe(SYSTEM_TENANT_ID)
      expect(result.slug).toBe('future-system-test')
      expect(result.name).toBe('Future System Test')
      expect(result.planTier).toBe('enterprise')
      expect(result.status).toBe('active')
    })

    it('is idempotent — calling twice does not throw and keeps the same id', async () => {
      const first = await repo.upsertSystemTenant({
        id: SYSTEM_TENANT_ID,
        slug: 'future-system-test',
        name: 'Future System Test',
      })

      const second = await repo.upsertSystemTenant({
        id: SYSTEM_TENANT_ID,
        slug: 'future-system-test',
        name: 'Future System Test Updated',
      })

      expect(first.id).toBe(SYSTEM_TENANT_ID)
      expect(second.id).toBe(SYSTEM_TENANT_ID)
      // Name update is applied on conflict
      expect(second.name).toBe('Future System Test Updated')
    })

    it('does not change the status of an existing system tenant', async () => {
      // Suspend the tenant via updateStatus
      await repo.updateStatus(SYSTEM_TENANT_ID, 'suspended')

      // Upsert should not reset status back to active
      const result = await repo.upsertSystemTenant({
        id: SYSTEM_TENANT_ID,
        slug: 'future-system-test',
        name: 'Future System Test',
      })

      // The upsert only updates name+updatedAt on conflict — status is preserved
      const found = await repo.findById(SYSTEM_TENANT_ID)
      expect(found!.status).toBe('suspended')
      expect(result.id).toBe(SYSTEM_TENANT_ID)
    })
  })
})
