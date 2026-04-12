import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
  truncateIdentitySchema,
} from '@future/db/test-helpers'
import { DrizzleIdentityProviderRepository } from './drizzle-identity-provider.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000020'
const TENANT_B = '01900000-0000-7fff-8000-000000000021'

describe('DrizzleIdentityProviderRepository', () => {
  const db = createTestDb()
  let repo: DrizzleIdentityProviderRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'idp-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'idp-tenant-b' })
    repo = new DrizzleIdentityProviderRepository(db as never)
  })

  afterAll(async () => {
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
  })

  describe('insert + findById', () => {
    it('creates a provider and retrieves it by id', async () => {
      await setTenantContext(db, TENANT_A)

      const provider = await repo.insert({
        tenantId: TENANT_A,
        providerType: 'microsoft',
        displayName: 'SETA Entra',
        clientId: 'client-123',
        clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:test-abc123',
        directoryId: 'dir-123',
        isPrimary: false,
        syncEnabled: false,
      })

      expect(provider.id).toBeDefined()
      expect(provider.tenantId).toBe(TENANT_A)
      expect(provider.providerType).toBe('microsoft')
      expect(provider.syncStatus).toBe('idle')

      const found = await repo.findById(provider.id, TENANT_A)
      expect(found).not.toBeNull()
      expect(found?.displayName).toBe('SETA Entra')
    })
  })

  describe('findByTenantId', () => {
    it('returns all providers for a tenant', async () => {
      await setTenantContext(db, TENANT_A)
      const providers = await repo.findByTenantId(TENANT_A)
      expect(providers.length).toBeGreaterThanOrEqual(1)
      expect(providers.every((p) => p.tenantId === TENANT_A)).toBe(true)
    })
  })

  describe('findPrimary', () => {
    it('returns null when no primary exists', async () => {
      await setTenantContext(db, TENANT_B)
      const primary = await repo.findPrimary(TENANT_B)
      expect(primary).toBeNull()
    })

    it('returns the primary provider', async () => {
      await setTenantContext(db, TENANT_B)
      await repo.insert({
        tenantId: TENANT_B,
        providerType: 'google',
        displayName: 'Google Workspace',
        clientId: 'client-456',
        clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:test-google',
        directoryId: null,
        isPrimary: true,
        syncEnabled: false,
      })

      const primary = await repo.findPrimary(TENANT_B)
      expect(primary).not.toBeNull()
      expect(primary?.isPrimary).toBe(true)
      expect(primary?.tenantId).toBe(TENANT_B)
    })
  })

  describe('update', () => {
    it('updates provider fields', async () => {
      await setTenantContext(db, TENANT_A)
      const providers = await repo.findByTenantId(TENANT_A)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const provider = providers[0]!

      const updated = await repo.update(provider.id, TENANT_A, {
        displayName: 'Updated Name',
        syncEnabled: true,
      })

      expect(updated.displayName).toBe('Updated Name')
      expect(updated.syncEnabled).toBe(true)
    })

    it('updates sync status and last_sync_at', async () => {
      await setTenantContext(db, TENANT_A)
      const providers = await repo.findByTenantId(TENANT_A)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const provider = providers[0]!
      const now = new Date()

      const updated = await repo.update(provider.id, TENANT_A, {
        syncStatus: 'running',
        lastSyncAt: now,
      })

      expect(updated.syncStatus).toBe('running')
      expect(updated.lastSyncAt).not.toBeNull()
    })
  })

  describe('tenant isolation', () => {
    it('returns null for provider in different tenant', async () => {
      await setTenantContext(db, TENANT_A)
      const providers = await repo.findByTenantId(TENANT_A)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const provider = providers[0]!

      await setTenantContext(db, TENANT_B)
      const found = await repo.findById(provider.id, TENANT_B)
      expect(found).toBeNull()
    })
  })
})
