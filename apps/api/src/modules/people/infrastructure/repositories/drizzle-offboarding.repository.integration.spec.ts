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
import {
  DrizzleOffboardingCaseRepository,
  DrizzleOffboardingTemplateRepository,
} from './drizzle-offboarding.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000020'
const TENANT_B = '01900000-0000-7fff-8000-000000000021'

describe('DrizzleOffboardingCaseRepository', () => {
  const db = createTestDb()
  let caseRepo: DrizzleOffboardingCaseRepository
  let templateRepo: DrizzleOffboardingTemplateRepository

  let profileIdA: string

  beforeAll(async () => {
    await migrateForTest()
    await truncateCoreSchema(db)
    await truncatePeopleSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'offboarding-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'offboarding-tenant-b' })
    caseRepo = new DrizzleOffboardingCaseRepository(db as never)
    templateRepo = new DrizzleOffboardingTemplateRepository(db as never)

    await setTenantContext(db, TENANT_A)
    const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })
    const profile = await seedEmploymentProfile(db, {
      tenantId: TENANT_A,
      actorId,
      employeeCode: 'SETA-OFFBOARD-001',
    })
    profileIdA = profile.id
  })

  afterAll(async () => {
    await truncatePeopleSchema(db)
    await truncateCoreSchema(db)
  })

  describe('insert + findById', () => {
    it('inserts an offboarding case and retrieves it by id', async () => {
      await setTenantContext(db, TENANT_A)

      const inserted = await caseRepo.insert({
        tenantId: TENANT_A,
        profileId: profileIdA,
        templateId: null,
        reason: 'Personal reasons',
        reasonCategory: 'voluntary',
        decisionCaseId: null,
        status: 'pending',
      })

      expect(inserted.id).toBeDefined()
      expect(inserted.tenantId).toBe(TENANT_A)
      expect(inserted.profileId).toBe(profileIdA)
      expect(inserted.reason).toBe('Personal reasons')
      expect(inserted.status).toBe('pending')
      expect(inserted.createdAt).toBeDefined()
      expect(inserted.updatedAt).toBeDefined()

      const found = await caseRepo.findById(inserted.id, TENANT_A)
      expect(found).not.toBeNull()
      expect(found?.id).toBe(inserted.id)
    })

    it('returns null for wrong tenant', async () => {
      await setTenantContext(db, TENANT_A)
      const inserted = await caseRepo.insert({
        tenantId: TENANT_A,
        profileId: profileIdA,
        templateId: null,
        reason: 'Another reason',
        reasonCategory: null,
        decisionCaseId: null,
        status: 'pending',
      })

      await setTenantContext(db, TENANT_B)
      const found = await caseRepo.findById(inserted.id, TENANT_B)
      expect(found).toBeNull()
    })
  })

  describe('findActiveByProfileId', () => {
    it('finds active case by profile id', async () => {
      await setTenantContext(db, TENANT_A)
      const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })
      const { id: profileId } = await seedEmploymentProfile(db, {
        tenantId: TENANT_A,
        actorId,
        employeeCode: 'SETA-OFFBOARD-ACTIVE-001',
      })

      await caseRepo.insert({
        tenantId: TENANT_A,
        profileId,
        templateId: null,
        reason: 'Active case',
        reasonCategory: null,
        decisionCaseId: null,
        status: 'pending',
      })

      const found = await caseRepo.findActiveByProfileId(profileId, TENANT_A)
      expect(found).not.toBeNull()
      expect(found?.profileId).toBe(profileId)
    })

    it('does NOT return completed or rejected cases', async () => {
      await setTenantContext(db, TENANT_A)
      const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })
      const { id: profileId } = await seedEmploymentProfile(db, {
        tenantId: TENANT_A,
        actorId,
        employeeCode: 'SETA-OFFBOARD-COMPLETED-001',
      })

      const completedCase = await caseRepo.insert({
        tenantId: TENANT_A,
        profileId,
        templateId: null,
        reason: 'Completed case',
        reasonCategory: null,
        decisionCaseId: null,
        status: 'pending',
      })
      await caseRepo.updateStatus(completedCase.id, TENANT_A, 'completed')

      const found = await caseRepo.findActiveByProfileId(profileId, TENANT_A)
      expect(found).toBeNull()
    })

    it('does NOT return rejected cases', async () => {
      await setTenantContext(db, TENANT_A)
      const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })
      const { id: profileId } = await seedEmploymentProfile(db, {
        tenantId: TENANT_A,
        actorId,
        employeeCode: 'SETA-OFFBOARD-REJECTED-001',
      })

      const rejectedCase = await caseRepo.insert({
        tenantId: TENANT_A,
        profileId,
        templateId: null,
        reason: 'Rejected case',
        reasonCategory: null,
        decisionCaseId: null,
        status: 'pending',
      })
      await caseRepo.updateStatus(rejectedCase.id, TENANT_A, 'rejected')

      const found = await caseRepo.findActiveByProfileId(profileId, TENANT_A)
      expect(found).toBeNull()
    })
  })

  describe('updateStatus', () => {
    it('updates the status of a case', async () => {
      await setTenantContext(db, TENANT_A)
      const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })
      const { id: profileId } = await seedEmploymentProfile(db, {
        tenantId: TENANT_A,
        actorId,
        employeeCode: 'SETA-OFFBOARD-STATUS-001',
      })

      const created = await caseRepo.insert({
        tenantId: TENANT_A,
        profileId,
        templateId: null,
        reason: 'Status update test',
        reasonCategory: null,
        decisionCaseId: null,
        status: 'pending',
      })

      await caseRepo.updateStatus(created.id, TENANT_A, 'approved')

      const updated = await caseRepo.findById(created.id, TENANT_A)
      expect(updated?.status).toBe('approved')
    })
  })

  describe('update', () => {
    it('updates partial fields of a case', async () => {
      await setTenantContext(db, TENANT_A)
      const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })
      const { id: profileId } = await seedEmploymentProfile(db, {
        tenantId: TENANT_A,
        actorId,
        employeeCode: 'SETA-OFFBOARD-UPDATE-001',
      })

      const created = await caseRepo.insert({
        tenantId: TENANT_A,
        profileId,
        templateId: null,
        reason: 'Update test',
        reasonCategory: null,
        decisionCaseId: null,
        status: 'pending',
      })

      await caseRepo.update(created.id, TENANT_A, { status: 'processing' })

      const updated = await caseRepo.findById(created.id, TENANT_A)
      expect(updated?.status).toBe('processing')
    })
  })

  describe('insertTask + getRequiredTasks + findTaskById + updateTaskStatus', () => {
    it('inserts a task and retrieves it', async () => {
      await setTenantContext(db, TENANT_A)
      const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })
      const { id: profileId } = await seedEmploymentProfile(db, {
        tenantId: TENANT_A,
        actorId,
        employeeCode: 'SETA-OFFBOARD-TASK-001',
      })

      const offCase = await caseRepo.insert({
        tenantId: TENANT_A,
        profileId,
        templateId: null,
        reason: 'Task test',
        reasonCategory: null,
        decisionCaseId: null,
        status: 'processing',
      })

      await caseRepo.insertTask({
        tenantId: TENANT_A,
        caseId: offCase.id,
        actorId: null,
        title: 'Return laptop',
        description: 'Please return the company laptop',
        assigneeRole: 'it',
        isRequired: true,
        dueDate: new Date('2026-05-01'),
      })

      const tasks = await caseRepo.getRequiredTasks(offCase.id, TENANT_A)
      expect(tasks.length).toBe(1)
      const firstTask = tasks[0]!
      expect(firstTask.isRequired).toBe(true)
      expect(firstTask.status).toBe('pending')

      const taskById = await caseRepo.findTaskById(firstTask.id, TENANT_A)
      expect(taskById).not.toBeNull()
      expect(taskById?.caseId).toBe(offCase.id)
      expect(taskById?.isRequired).toBe(true)
    })

    it('updates task status', async () => {
      await setTenantContext(db, TENANT_A)
      const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })
      const { id: profileId } = await seedEmploymentProfile(db, {
        tenantId: TENANT_A,
        actorId,
        employeeCode: 'SETA-OFFBOARD-TASK-STATUS-001',
      })

      const offCase = await caseRepo.insert({
        tenantId: TENANT_A,
        profileId,
        templateId: null,
        reason: 'Task status test',
        reasonCategory: null,
        decisionCaseId: null,
        status: 'processing',
      })

      await caseRepo.insertTask({
        tenantId: TENANT_A,
        caseId: offCase.id,
        actorId: null,
        title: 'Revoke access',
        description: null,
        assigneeRole: 'it',
        isRequired: true,
        dueDate: new Date('2026-05-01'),
      })

      const tasks = await caseRepo.getRequiredTasks(offCase.id, TENANT_A)
      const taskId = tasks[0]!.id
      const completedAt = new Date('2026-04-15')

      await caseRepo.updateTaskStatus(taskId, TENANT_A, 'completed', completedAt, null)

      const updated = await caseRepo.findTaskById(taskId, TENANT_A)
      expect(updated?.status).toBe('completed')
    })

    it('findTaskById returns null for wrong tenant', async () => {
      await setTenantContext(db, TENANT_B)
      const found = await caseRepo.findTaskById('00000000-0000-7000-8000-000000000000', TENANT_B)
      expect(found).toBeNull()
    })
  })
})

describe('DrizzleOffboardingTemplateRepository', () => {
  const db = createTestDb()
  let templateRepo: DrizzleOffboardingTemplateRepository

  beforeAll(async () => {
    await migrateForTest()
    // Use existing tenant from above or ensure tenants exist
    try {
      await seedTenant(db, { id: TENANT_A, slug: 'offboarding-tmpl-tenant-a' })
    } catch {
      // tenant already exists from previous describe block
    }
    templateRepo = new DrizzleOffboardingTemplateRepository(db as never)
  })

  describe('insert + findById', () => {
    it('inserts a template and retrieves it by id', async () => {
      await setTenantContext(db, TENANT_A)

      const inserted = await templateRepo.insert({
        tenantId: TENANT_A,
        name: 'Default Offboarding',
        employmentType: 'permanent',
        reasonCategory: 'voluntary',
        isDefault: true,
        isActive: true,
      })

      expect(inserted.id).toBeDefined()
      expect(inserted.name).toBe('Default Offboarding')
      expect(inserted.isDefault).toBe(true)

      const found = await templateRepo.findById(inserted.id, TENANT_A)
      expect(found).not.toBeNull()
      expect(found?.id).toBe(inserted.id)
    })
  })

  describe('findMatch', () => {
    it('finds template matching employment type and reason category', async () => {
      await setTenantContext(db, TENANT_A)

      await templateRepo.insert({
        tenantId: TENANT_A,
        name: 'Contractor Voluntary Offboarding',
        employmentType: 'contractor',
        reasonCategory: 'voluntary',
        isDefault: false,
        isActive: true,
      })

      const found = await templateRepo.findMatch('contractor', 'voluntary', TENANT_A)
      expect(found).not.toBeNull()
      expect(found?.employmentType).toBe('contractor')
      expect(found?.reasonCategory).toBe('voluntary')
    })

    it('returns null for non-matching criteria', async () => {
      await setTenantContext(db, TENANT_A)
      const found = await templateRepo.findMatch('intern', 'redundancy', TENANT_A)
      expect(found).toBeNull()
    })
  })

  describe('findDefault', () => {
    it('finds the default template', async () => {
      await setTenantContext(db, TENANT_A)
      const found = await templateRepo.findDefault(TENANT_A)
      expect(found).not.toBeNull()
      expect(found?.isDefault).toBe(true)
    })
  })

  describe('listByTenant', () => {
    it('lists all templates for a tenant', async () => {
      await setTenantContext(db, TENANT_A)
      const list = await templateRepo.listByTenant(TENANT_A)
      expect(list.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('update', () => {
    it('updates template fields', async () => {
      await setTenantContext(db, TENANT_A)

      const inserted = await templateRepo.insert({
        tenantId: TENANT_A,
        name: 'Old Name',
        employmentType: null,
        reasonCategory: null,
        isDefault: false,
        isActive: true,
      })

      const updated = await templateRepo.update(inserted.id, TENANT_A, {
        name: 'New Name',
        isActive: false,
      })

      expect(updated.name).toBe('New Name')
      expect(updated.isActive).toBe(false)
    })
  })

  describe('getTaskTemplates', () => {
    it('returns empty array when no task templates exist for template', async () => {
      await setTenantContext(db, TENANT_A)

      const template = await templateRepo.insert({
        tenantId: TENANT_A,
        name: 'No Tasks Template',
        employmentType: null,
        reasonCategory: null,
        isDefault: false,
        isActive: true,
      })

      const tasks = await templateRepo.getTaskTemplates(template.id, TENANT_A)
      expect(tasks).toHaveLength(0)
    })
  })
})
