import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  seedIdentityProvider,
  setTenantContext,
  truncateCoreSchema,
  truncateIdentitySchema,
} from '@future/db/test-helpers'
import { DrizzleIdpGroupMappingRepository } from './drizzle-idp-group-mapping.repository'

const TENANT = '01900000-0000-7fff-8000-000000000030'

describe('DrizzleIdpGroupMappingRepository', () => {
  const db = createTestDb()
  let repo: DrizzleIdpGroupMappingRepository
  let providerId: string

  beforeAll(async () => {
    await migrateForTest()
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT, slug: 'gm-tenant' })
    await setTenantContext(db, TENANT)
    const provider = await seedIdentityProvider(db, { tenantId: TENANT })
    providerId = provider.id
    repo = new DrizzleIdpGroupMappingRepository(db as never)
  })

  afterAll(async () => {
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
  })

  describe('upsert', () => {
    it('creates a new mapping', async () => {
      const mapping = await repo.upsert({
        tenantId: TENANT,
        identityProviderId: providerId,
        externalGroupId: 'group-aad-001',
        externalGroupName: 'Engineering',
        roleKey: 'employee',
        scopeType: 'global',
        scopeId: null,
      })

      expect(mapping.id).toBeDefined()
      expect(mapping.externalGroupId).toBe('group-aad-001')
      expect(mapping.roleKey).toBe('employee')
    })

    it('updates existing mapping on conflict', async () => {
      const mapping = await repo.upsert({
        tenantId: TENANT,
        identityProviderId: providerId,
        externalGroupId: 'group-aad-001',
        externalGroupName: 'Engineering (updated)',
        roleKey: 'employee',
        scopeType: 'global',
        scopeId: null,
      })

      expect(mapping.externalGroupName).toBe('Engineering (updated)')
    })
  })

  describe('findByProviderId', () => {
    it('returns mappings for the provider', async () => {
      const mappings = await repo.findByProviderId(providerId, TENANT)
      expect(mappings.length).toBeGreaterThanOrEqual(1)
      expect(mappings.every((m) => m.identityProviderId === providerId)).toBe(true)
    })
  })

  describe('findByTenantId', () => {
    it('returns all mappings for the tenant', async () => {
      const mappings = await repo.findByTenantId(TENANT)
      expect(mappings.length).toBeGreaterThanOrEqual(1)
      expect(mappings.every((m) => m.tenantId === TENANT)).toBe(true)
    })
  })

  describe('remove', () => {
    it('deletes the mapping by id', async () => {
      const mappings = await repo.findByProviderId(providerId, TENANT)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const toRemove = mappings[0]!

      await repo.remove(toRemove.id, TENANT)

      const after = await repo.findByProviderId(providerId, TENANT)
      expect(after.find((m) => m.id === toRemove.id)).toBeUndefined()
    })
  })
})
