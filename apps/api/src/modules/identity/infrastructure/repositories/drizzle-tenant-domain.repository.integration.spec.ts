import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
  truncateIdentitySchema,
} from '@future/db/test-helpers'
import { DrizzleTenantDomainRepository } from './drizzle-tenant-domain.repository'

const TENANT_A = '01900000-0000-7fff-8000-0000000000a0'
const TENANT_B = '01900000-0000-7fff-8000-0000000000a1'

describe('DrizzleTenantDomainRepository', () => {
  const db = createTestDb()
  let repo: DrizzleTenantDomainRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'td-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'td-tenant-b' })
    repo = new DrizzleTenantDomainRepository(db as never)
  })

  afterAll(async () => {
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
  })

  describe('insert + findById', () => {
    it('creates a domain and retrieves it by id', async () => {
      await setTenantContext(db, TENANT_A)

      const domain = await repo.insert({
        tenantId: TENANT_A,
        domain: 'seta-a.com',
        status: 'pending',
        verificationTokenHash: 'hash-pending-001',
      })

      expect(domain.id).toBeDefined()
      expect(domain.tenantId).toBe(TENANT_A)
      expect(domain.domain).toBe('seta-a.com')
      expect(domain.status).toBe('pending')

      const found = await repo.findById(domain.id, TENANT_A)
      expect(found).not.toBeNull()
      expect(found?.domain).toBe('seta-a.com')
    })
  })

  describe('unique domain constraint', () => {
    it('rejects duplicate domain across tenants', async () => {
      await setTenantContext(db, TENANT_A)
      await repo.insert({
        tenantId: TENANT_A,
        domain: 'unique-only.com',
        status: 'pending',
        verificationTokenHash: 'hash-unique-001',
      })

      await setTenantContext(db, TENANT_B)
      await expect(
        repo.insert({
          tenantId: TENANT_B,
          domain: 'unique-only.com',
          status: 'pending',
          verificationTokenHash: 'hash-unique-002',
        }),
      ).rejects.toThrow()
    })
  })

  describe('findVerifiedByDomain', () => {
    it('returns null for a pending domain', async () => {
      await setTenantContext(db, TENANT_A)
      await repo.insert({
        tenantId: TENANT_A,
        domain: 'pending-lookup.com',
        status: 'pending',
        verificationTokenHash: 'hash-pending-002',
      })

      const found = await repo.findVerifiedByDomain('pending-lookup.com')
      expect(found).toBeNull()
    })

    it('returns the domain when verified', async () => {
      await setTenantContext(db, TENANT_A)
      const domain = await repo.insert({
        tenantId: TENANT_A,
        domain: 'verified-login.com',
        status: 'verified',
        verificationTokenHash: 'hash-verified-001',
        verifiedAt: new Date(),
      })

      const found = await repo.findVerifiedByDomain('verified-login.com')
      expect(found).not.toBeNull()
      expect(found?.id).toBe(domain.id)
      expect(found?.status).toBe('verified')
    })
  })

  describe('update', () => {
    it('updates domain status to verified', async () => {
      await setTenantContext(db, TENANT_A)
      const domain = await repo.insert({
        tenantId: TENANT_A,
        domain: 'to-verify.com',
        status: 'pending',
        verificationTokenHash: 'hash-to-verify-001',
      })

      const verifiedAt = new Date()
      await repo.update(domain.id, TENANT_A, { status: 'verified', verifiedAt })

      const updated = await repo.findById(domain.id, TENANT_A)
      expect(updated?.status).toBe('verified')
      expect(updated?.verifiedAt).not.toBeNull()
    })
  })

  describe('tenant isolation', () => {
    it('returns null for domain belonging to different tenant', async () => {
      await setTenantContext(db, TENANT_A)
      const domain = await repo.insert({
        tenantId: TENANT_A,
        domain: 'isolated-tenant-a.com',
        status: 'pending',
        verificationTokenHash: 'hash-isolated-001',
      })

      await setTenantContext(db, TENANT_B)
      const found = await repo.findById(domain.id, TENANT_B)
      expect(found).toBeNull()
    })
  })

  describe('findByTenantId', () => {
    it('returns only domains for the given tenant', async () => {
      await setTenantContext(db, TENANT_A)
      const domains = await repo.findByTenantId(TENANT_A)
      expect(domains.every((d) => d.tenantId === TENANT_A)).toBe(true)
    })
  })
})
