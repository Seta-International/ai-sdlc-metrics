import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedActor,
  seedTenant,
  seedEmploymentProfile,
  setTenantContext,
  truncateCoreSchema,
  truncatePeopleSchema,
} from '@future/db/test-helpers'
import { DrizzleEmploymentRepository } from './drizzle-employment.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000040'
const TENANT_B = '01900000-0000-7fff-8000-000000000041'

describe('DrizzleEmploymentRepository', () => {
  const db = createTestDb()
  let repo: DrizzleEmploymentRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncateCoreSchema(db)
    await truncatePeopleSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'ep-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'ep-tenant-b' })
    repo = new DrizzleEmploymentRepository(db as never)
  })

  afterAll(async () => {
    await truncatePeopleSchema(db)
    await truncateCoreSchema(db)
  })

  describe('insert', () => {
    it('creates a profile visible in the same tenant context', async () => {
      await setTenantContext(db, TENANT_A)
      const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })

      const profile = await repo.insert({
        tenantId: TENANT_A,
        actorId,
        employeeCode: 'SETA-INSERT-001',
        companyEmail: 'insert-test@seta-international.vn',
        employmentType: 'permanent',
        employmentStatus: 'active',
        workArrangement: 'onsite',
        hireDate: new Date('2024-01-01'),
        terminationDate: null,
        jobTitle: 'Software Engineer',
        jobLevel: 'L3',
        costCenter: 'Engineering',
      })

      expect(profile.id).toBeDefined()
      expect(profile.tenantId).toBe(TENANT_A)
      expect(profile.actorId).toBe(actorId)
      expect(profile.employeeCode).toBe('SETA-INSERT-001')
      expect(profile.employmentStatus).toBe('active')
      expect(profile.createdAt).toBeDefined()
      expect(profile.updatedAt).toBeDefined()
    })
  })

  describe('findById', () => {
    it('returns profile in correct tenant', async () => {
      await setTenantContext(db, TENANT_A)
      const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })
      const { id: profileId } = await seedEmploymentProfile(db, {
        tenantId: TENANT_A,
        actorId,
        employeeCode: 'SETA-FIND-001',
      })

      const found = await repo.findById(profileId, TENANT_A)

      expect(found).not.toBeNull()
      expect(found?.id).toBe(profileId)
      expect(found?.tenantId).toBe(TENANT_A)
    })

    it('returns null for wrong tenant', async () => {
      await setTenantContext(db, TENANT_B)
      const { id: actorId } = await seedActor(db, { tenantId: TENANT_B })
      const { id: profileId } = await seedEmploymentProfile(db, {
        tenantId: TENANT_B,
        actorId,
        employeeCode: 'SETA-FIND-002',
      })

      await setTenantContext(db, TENANT_A)
      const found = await repo.findById(profileId, TENANT_A)

      expect(found).toBeNull()
    })
  })

  describe('findByActorId', () => {
    it('finds profile by actor ID', async () => {
      await setTenantContext(db, TENANT_A)
      const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })
      await seedEmploymentProfile(db, {
        tenantId: TENANT_A,
        actorId,
        employeeCode: 'SETA-ACTOR-001',
      })

      const found = await repo.findByActorId(actorId, TENANT_A)

      expect(found).not.toBeNull()
      expect(found?.actorId).toBe(actorId)
    })

    it('returns null when actor not in tenant', async () => {
      await setTenantContext(db, TENANT_B)
      const { id: actorId } = await seedActor(db, { tenantId: TENANT_B })
      await seedEmploymentProfile(db, {
        tenantId: TENANT_B,
        actorId,
        employeeCode: 'SETA-ACTOR-002',
      })

      await setTenantContext(db, TENANT_A)
      const found = await repo.findByActorId(actorId, TENANT_A)

      expect(found).toBeNull()
    })
  })

  describe('findByEmployeeCode', () => {
    it('finds profile by employee code', async () => {
      await setTenantContext(db, TENANT_A)
      const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })
      await seedEmploymentProfile(db, {
        tenantId: TENANT_A,
        actorId,
        employeeCode: 'SETA-CODE-001',
      })

      const found = await repo.findByEmployeeCode('SETA-CODE-001', TENANT_A)

      expect(found).not.toBeNull()
      expect(found?.employeeCode).toBe('SETA-CODE-001')
    })

    it('returns null for code in different tenant', async () => {
      await setTenantContext(db, TENANT_B)
      const { id: actorId } = await seedActor(db, { tenantId: TENANT_B })
      await seedEmploymentProfile(db, {
        tenantId: TENANT_B,
        actorId,
        employeeCode: 'SETA-CODE-002',
      })

      await setTenantContext(db, TENANT_A)
      const found = await repo.findByEmployeeCode('SETA-CODE-002', TENANT_A)

      expect(found).toBeNull()
    })
  })

  describe('updateStatus', () => {
    it('updates employment status', async () => {
      await setTenantContext(db, TENANT_A)
      const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })
      const { id: profileId } = await seedEmploymentProfile(db, {
        tenantId: TENANT_A,
        actorId,
        employeeCode: 'SETA-STATUS-001',
        employmentStatus: 'active',
      })

      await repo.updateStatus(profileId, TENANT_A, 'offboarding')

      const updated = await repo.findById(profileId, TENANT_A)
      expect(updated?.employmentStatus).toBe('offboarding')
    })

    it('updates status with termination date', async () => {
      await setTenantContext(db, TENANT_A)
      const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })
      const { id: profileId } = await seedEmploymentProfile(db, {
        tenantId: TENANT_A,
        actorId,
        employeeCode: 'SETA-STATUS-002',
        employmentStatus: 'active',
      })

      const terminationDate = new Date('2025-12-31')
      await repo.updateStatus(profileId, TENANT_A, 'terminated', terminationDate)

      const updated = await repo.findById(profileId, TENANT_A)
      expect(updated?.employmentStatus).toBe('terminated')
      expect(updated?.terminationDate).not.toBeNull()
    })
  })

  describe('update', () => {
    it('updates profile fields', async () => {
      await setTenantContext(db, TENANT_A)
      const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })
      const { id: profileId } = await seedEmploymentProfile(db, {
        tenantId: TENANT_A,
        actorId,
        employeeCode: 'SETA-UPDATE-001',
        jobTitle: 'Junior Engineer',
      })

      const updated = await repo.update(profileId, TENANT_A, {
        jobTitle: 'Senior Engineer',
        jobLevel: 'L5',
        costCenter: 'Platform',
      })

      expect(updated.jobTitle).toBe('Senior Engineer')
      expect(updated.jobLevel).toBe('L5')
      expect(updated.costCenter).toBe('Platform')
    })
  })

  describe('listByTenant', () => {
    it('lists profiles for a tenant', async () => {
      // Use a fresh tenant to avoid cross-test pollution
      const tenantId = '01900000-0000-7fff-8000-000000000012'
      await seedTenant(db, { id: tenantId, slug: 'ep-list-tenant' })
      await setTenantContext(db, tenantId)

      const { id: actorId1 } = await seedActor(db, { tenantId })
      const { id: actorId2 } = await seedActor(db, { tenantId })
      await seedEmploymentProfile(db, {
        tenantId,
        actorId: actorId1,
        employeeCode: 'SETA-LIST-001',
        employmentStatus: 'active',
      })
      await seedEmploymentProfile(db, {
        tenantId,
        actorId: actorId2,
        employeeCode: 'SETA-LIST-002',
        employmentStatus: 'terminated',
      })

      const all = await repo.listByTenant(tenantId)
      expect(all.length).toBeGreaterThanOrEqual(2)

      const active = await repo.listByTenant(tenantId, { status: 'active' })
      expect(active.every((p) => p.employmentStatus === 'active')).toBe(true)
    })

    it('respects limit and offset', async () => {
      const tenantId = '01900000-0000-7fff-8000-000000000013'
      await seedTenant(db, { id: tenantId, slug: 'ep-page-tenant' })
      await setTenantContext(db, tenantId)

      for (let i = 0; i < 5; i++) {
        const { id: actorId } = await seedActor(db, { tenantId })
        await seedEmploymentProfile(db, {
          tenantId,
          actorId,
          employeeCode: `SETA-PAGE-00${i}`,
        })
      }

      const page1 = await repo.listByTenant(tenantId, { limit: 2, offset: 0 })
      const page2 = await repo.listByTenant(tenantId, { limit: 2, offset: 2 })

      expect(page1).toHaveLength(2)
      expect(page2).toHaveLength(2)
      const page1Ids = page1.map((p) => p.id)
      const page2Ids = page2.map((p) => p.id)
      expect(page1Ids.filter((id) => page2Ids.includes(id))).toHaveLength(0)
    })
  })
})
