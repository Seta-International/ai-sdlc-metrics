import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
  truncatePeopleSchema,
} from '@future/db/test-helpers'
import { sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { JobHistoryRepositoryImpl } from './job-history.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000030'
const TENANT_B = '01900000-0000-7fff-8000-000000000031'

describe('JobHistoryRepositoryImpl', () => {
  const db = createTestDb()
  let repo: JobHistoryRepositoryImpl

  beforeAll(async () => {
    await migrateForTest()
    await db.execute(sql`TRUNCATE people.job_history RESTART IDENTITY CASCADE`)
    await truncatePeopleSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'jh-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'jh-tenant-b' })
    repo = new JobHistoryRepositoryImpl(db as never)
  })

  afterAll(async () => {
    await db.execute(sql`TRUNCATE people.job_history RESTART IDENTITY CASCADE`)
    await truncatePeopleSchema(db)
    await truncateCoreSchema(db)
  })

  describe('recordChange', () => {
    it('inserts a row and returns the entry with generated id, recordedAt, createdAt, updatedAt', async () => {
      await setTenantContext(db, TENANT_A)

      const profileId = uuidv7()
      const effectiveFrom = new Date('2024-01-01')

      const entry = await repo.recordChange({
        tenantId: TENANT_A,
        profileId,
        effectiveFrom,
        effectiveTo: null,
        jobTitle: 'Software Engineer',
        departmentId: null,
        managerProfileId: null,
        changeType: 'hire',
        changeReason: 'New hire',
        recordedBy: null,
      })

      expect(entry.id).toBeDefined()
      expect(entry.tenantId).toBe(TENANT_A)
      expect(entry.profileId).toBe(profileId)
      expect(entry.jobTitle).toBe('Software Engineer')
      expect(entry.changeType).toBe('hire')
      expect(entry.recordedAt).toBeDefined()
      expect(entry.createdAt).toBeDefined()
      expect(entry.updatedAt).toBeDefined()
    })
  })

  describe('findByProfile', () => {
    it('returns entries ordered by effectiveFrom DESC', async () => {
      await setTenantContext(db, TENANT_A)

      const profileId = uuidv7()

      await repo.recordChange({
        tenantId: TENANT_A,
        profileId,
        effectiveFrom: new Date('2023-01-01'),
        effectiveTo: new Date('2023-12-31'),
        jobTitle: 'Junior Engineer',
        departmentId: null,
        managerProfileId: null,
        changeType: 'hire',
        changeReason: null,
        recordedBy: null,
      })

      await repo.recordChange({
        tenantId: TENANT_A,
        profileId,
        effectiveFrom: new Date('2024-01-01'),
        effectiveTo: null,
        jobTitle: 'Senior Engineer',
        departmentId: null,
        managerProfileId: null,
        changeType: 'promotion',
        changeReason: null,
        recordedBy: null,
      })

      const entries = await repo.findByProfile(profileId, TENANT_A)

      expect(entries.length).toBe(2)
      // Ordered DESC by effectiveFrom — 2024 first
      expect(entries[0]!.jobTitle).toBe('Senior Engineer')
      expect(entries[1]!.jobTitle).toBe('Junior Engineer')
    })

    it('returns empty array when no entries exist', async () => {
      await setTenantContext(db, TENANT_A)

      const entries = await repo.findByProfile(uuidv7(), TENANT_A)
      expect(entries).toHaveLength(0)
    })
  })

  describe('findAsOf', () => {
    it('returns the entry where effectiveFrom <= asOf AND (effectiveTo IS NULL OR effectiveTo > asOf)', async () => {
      await setTenantContext(db, TENANT_A)

      const profileId = uuidv7()

      await repo.recordChange({
        tenantId: TENANT_A,
        profileId,
        effectiveFrom: new Date('2023-01-01'),
        effectiveTo: new Date('2023-12-31'),
        jobTitle: 'Junior Engineer',
        departmentId: null,
        managerProfileId: null,
        changeType: 'hire',
        changeReason: null,
        recordedBy: null,
      })

      await repo.recordChange({
        tenantId: TENANT_A,
        profileId,
        effectiveFrom: new Date('2024-01-01'),
        effectiveTo: null,
        jobTitle: 'Senior Engineer',
        departmentId: null,
        managerProfileId: null,
        changeType: 'promotion',
        changeReason: null,
        recordedBy: null,
      })

      // asOf within the closed entry
      const result2023 = await repo.findAsOf(profileId, TENANT_A, new Date('2023-06-15'))
      expect(result2023).not.toBeNull()
      expect(result2023!.jobTitle).toBe('Junior Engineer')

      // asOf within the open entry
      const result2024 = await repo.findAsOf(profileId, TENANT_A, new Date('2025-01-01'))
      expect(result2024).not.toBeNull()
      expect(result2024!.jobTitle).toBe('Senior Engineer')

      // asOf before any entry
      const resultBefore = await repo.findAsOf(profileId, TENANT_A, new Date('2022-01-01'))
      expect(resultBefore).toBeNull()
    })
  })

  describe('findLatest', () => {
    it('returns the open entry (effectiveTo IS NULL)', async () => {
      await setTenantContext(db, TENANT_A)

      const profileId = uuidv7()

      await repo.recordChange({
        tenantId: TENANT_A,
        profileId,
        effectiveFrom: new Date('2023-01-01'),
        effectiveTo: new Date('2023-12-31'),
        jobTitle: 'Past Role',
        departmentId: null,
        managerProfileId: null,
        changeType: 'hire',
        changeReason: null,
        recordedBy: null,
      })

      await repo.recordChange({
        tenantId: TENANT_A,
        profileId,
        effectiveFrom: new Date('2024-01-01'),
        effectiveTo: null,
        jobTitle: 'Current Role',
        departmentId: null,
        managerProfileId: null,
        changeType: 'promotion',
        changeReason: null,
        recordedBy: null,
      })

      const latest = await repo.findLatest(profileId, TENANT_A)
      expect(latest).not.toBeNull()
      expect(latest!.jobTitle).toBe('Current Role')
      expect(latest!.effectiveTo).toBeNull()
    })

    it('returns the highest effectiveFrom when no open entry exists', async () => {
      await setTenantContext(db, TENANT_A)

      const profileId = uuidv7()

      await repo.recordChange({
        tenantId: TENANT_A,
        profileId,
        effectiveFrom: new Date('2022-01-01'),
        effectiveTo: new Date('2022-12-31'),
        jobTitle: 'First Role',
        departmentId: null,
        managerProfileId: null,
        changeType: 'hire',
        changeReason: null,
        recordedBy: null,
      })

      await repo.recordChange({
        tenantId: TENANT_A,
        profileId,
        effectiveFrom: new Date('2023-01-01'),
        effectiveTo: new Date('2023-12-31'),
        jobTitle: 'Second Role',
        departmentId: null,
        managerProfileId: null,
        changeType: 'promotion',
        changeReason: null,
        recordedBy: null,
      })

      const latest = await repo.findLatest(profileId, TENANT_A)
      expect(latest).not.toBeNull()
      expect(latest!.jobTitle).toBe('Second Role')
    })

    it('returns null when no entries exist', async () => {
      await setTenantContext(db, TENANT_A)

      const latest = await repo.findLatest(uuidv7(), TENANT_A)
      expect(latest).toBeNull()
    })
  })

  describe('closeOpenEntry', () => {
    it('sets effectiveTo on the open entry and leaves closed entries untouched', async () => {
      await setTenantContext(db, TENANT_A)

      const profileId = uuidv7()
      const closedEffectiveTo = new Date('2022-12-31')

      // Insert a closed entry
      const closed = await repo.recordChange({
        tenantId: TENANT_A,
        profileId,
        effectiveFrom: new Date('2022-01-01'),
        effectiveTo: closedEffectiveTo,
        jobTitle: 'Closed Role',
        departmentId: null,
        managerProfileId: null,
        changeType: 'hire',
        changeReason: null,
        recordedBy: null,
      })

      // Insert an open entry
      await repo.recordChange({
        tenantId: TENANT_A,
        profileId,
        effectiveFrom: new Date('2023-01-01'),
        effectiveTo: null,
        jobTitle: 'Open Role',
        departmentId: null,
        managerProfileId: null,
        changeType: 'promotion',
        changeReason: null,
        recordedBy: null,
      })

      const newEffectiveTo = new Date('2024-06-30')
      await repo.closeOpenEntry(profileId, TENANT_A, newEffectiveTo)

      // Check all entries
      const allEntries = await repo.findByProfile(profileId, TENANT_A)
      expect(allEntries).toHaveLength(2)

      const openEntry = allEntries.find((e) => e.jobTitle === 'Open Role')
      const closedEntry = allEntries.find((e) => e.jobTitle === 'Closed Role')

      expect(openEntry).toBeDefined()
      expect(openEntry!.effectiveTo).not.toBeNull()
      const effectiveToDate = openEntry!.effectiveTo!
      expect(effectiveToDate.getFullYear()).toBe(2024)
      expect(effectiveToDate.getMonth() + 1).toBe(6) // June
      expect(effectiveToDate.getDate()).toBe(30)

      expect(closedEntry).toBeDefined()
      // The original closed entry should still have its original effectiveTo
      expect(closedEntry!.id).toBe(closed.id)
      // effectiveTo should still be 2022-12-31 (unchanged)
      const closedDate = closedEntry!.effectiveTo!
      expect(closedDate.getFullYear()).toBe(2022)
    })
  })

  describe('RLS isolation', () => {
    it('entries inserted under tenant A are invisible under tenant B session', async () => {
      await setTenantContext(db, TENANT_A)

      const profileId = uuidv7()

      await repo.recordChange({
        tenantId: TENANT_A,
        profileId,
        effectiveFrom: new Date('2024-01-01'),
        effectiveTo: null,
        jobTitle: 'Tenant A Role',
        departmentId: null,
        managerProfileId: null,
        changeType: 'hire',
        changeReason: null,
        recordedBy: null,
      })

      // Switch to tenant B context
      await setTenantContext(db, TENANT_B)
      const entriesUnderB = await repo.findByProfile(profileId, TENANT_B)
      expect(entriesUnderB).toHaveLength(0)
    })
  })
})
