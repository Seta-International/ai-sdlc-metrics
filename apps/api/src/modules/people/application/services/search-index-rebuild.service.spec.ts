import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchIndexRebuildService } from './search-index-rebuild.service'
import type { IDirectorySearchIndexRepository } from '../../domain/repositories/directory-search-index.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import type { IJobAssignmentRepository } from '../../domain/repositories/job-assignment.repository'
import type { IJobProfileRepository } from '../../domain/repositories/job-profile.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const JOB_PROFILE_ID = '01900000-0000-7000-8000-000000000004'

describe('SearchIndexRebuildService', () => {
  let service: SearchIndexRebuildService
  let searchIndexRepo: IDirectorySearchIndexRepository
  let employmentRepo: IEmploymentRepository
  let profileRepo: IPersonProfileRepository
  let assignmentRepo: IJobAssignmentRepository
  let jobProfileRepo: IJobProfileRepository

  beforeEach(() => {
    searchIndexRepo = {
      upsert: vi.fn(),
      deleteByEmploymentId: vi.fn(),
      search: vi.fn(),
      list: vi.fn(),
      rebuildAll: vi.fn(),
      countByTenant: vi.fn(),
      listCompanyEmails: vi.fn(),
    }
    employmentRepo = {
      findById: vi.fn(),
      findByPersonProfileId: vi.fn(),
      findActiveByActorId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
      countByTenant: vi.fn(),
      listCompanyEmails: vi.fn(),
    }
    profileRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    assignmentRepo = {
      findById: vi.fn(),
      findCurrent: vi.fn(),
      findAsOf: vi.fn(),
      findHistory: vi.fn(),
      insert: vi.fn(),
      closeAssignment: vi.fn(),
      delete: vi.fn(),
    }
    jobProfileRepo = {
      findById: vi.fn(),
      listByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      countByJobFamilyId: vi.fn(),
    }

    service = new SearchIndexRebuildService(
      searchIndexRepo,
      employmentRepo,
      profileRepo,
      assignmentRepo,
      jobProfileRepo,
    )
  })

  it('rebuilds index for a single employment with all denormalized data', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      personProfileId: PROFILE_ID,
      companyEmail: 'an.nguyen@seta.vn',
      employmentStatus: 'active',
      hireDate: new Date('2025-01-15'),
      workerType: 'employee',
      employmentType: 'permanent',
      countryCode: 'VN',
      employeeCode: 'EMP001',
      terminationDate: null,
      terminationReason: null,
      originalHireDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(profileRepo.findById).mockResolvedValue({
      id: PROFILE_ID,
      tenantId: TENANT_ID,
      actorId: 'actor-1',
      familyName: 'Nguyễn',
      middleName: 'Văn',
      givenName: 'An',
      fullName: 'Nguyễn Văn An',
      fullNameUnaccented: 'Nguyen Van An',
      preferredName: null,
      nameDisplayOrder: 'family_first',
      dateOfBirth: null,
      gender: null,
      nationality: null,
      maritalStatus: null,
      photoDocumentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(assignmentRepo.findCurrent).mockResolvedValue({
      id: 'assign-1',
      tenantId: TENANT_ID,
      employmentId: EMPLOYMENT_ID,
      effectiveFrom: new Date('2025-01-15'),
      effectiveTo: null,
      jobProfileId: JOB_PROFILE_ID,
      departmentId: 'dept-1',
      locationId: null,
      costCenterId: null,
      workArrangement: 'hybrid',
      managerId: null,
      eventType: 'hire',
      reason: null,
      createdBy: 'actor-1',
      createdAt: new Date(),
    })
    vi.mocked(jobProfileRepo.findById).mockResolvedValue({
      id: JOB_PROFILE_ID,
      tenantId: TENANT_ID,
      jobFamilyId: 'family-1',
      title: 'Senior Software Engineer',
      level: 'L5',
      description: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await service.rebuildForEmployment(EMPLOYMENT_ID, TENANT_ID)

    expect(searchIndexRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        employmentId: EMPLOYMENT_ID,
        fullName: 'Nguyễn Văn An',
        fullNameUnaccented: 'Nguyen Van An',
        companyEmail: 'an.nguyen@seta.vn',
        jobTitle: 'Senior Software Engineer',
        jobLevel: 'L5',
        workArrangement: 'hybrid',
        employmentStatus: 'active',
        countryCode: 'VN',
      }),
    )
  })

  it('deletes index entry when employment is not found', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await service.rebuildForEmployment(EMPLOYMENT_ID, TENANT_ID)

    expect(searchIndexRepo.deleteByEmploymentId).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
  })

  it('handles employment without current assignment gracefully', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      personProfileId: PROFILE_ID,
      companyEmail: null,
      employmentStatus: 'pre_hire',
      hireDate: new Date('2025-06-01'),
      workerType: 'employee',
      employmentType: 'permanent',
      countryCode: 'VN',
      employeeCode: null,
      terminationDate: null,
      terminationReason: null,
      originalHireDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(profileRepo.findById).mockResolvedValue({
      id: PROFILE_ID,
      tenantId: TENANT_ID,
      actorId: 'actor-1',
      familyName: 'Trần',
      middleName: null,
      givenName: 'Bình',
      fullName: 'Trần Bình',
      fullNameUnaccented: 'Tran Binh',
      preferredName: null,
      nameDisplayOrder: 'family_first',
      dateOfBirth: null,
      gender: null,
      nationality: null,
      maritalStatus: null,
      photoDocumentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(assignmentRepo.findCurrent).mockResolvedValue(null)

    await service.rebuildForEmployment(EMPLOYMENT_ID, TENANT_ID)

    expect(searchIndexRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        jobTitle: null,
        jobLevel: null,
        departmentName: null,
        workArrangement: 'onsite',
      }),
    )
  })

  it('deletes index entry when profile is not found', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      personProfileId: PROFILE_ID,
      companyEmail: null,
      employmentStatus: 'active',
      hireDate: new Date('2025-01-15'),
      workerType: 'employee',
      employmentType: 'permanent',
      countryCode: 'VN',
      employeeCode: null,
      terminationDate: null,
      terminationReason: null,
      originalHireDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(profileRepo.findById).mockResolvedValue(null)

    await service.rebuildForEmployment(EMPLOYMENT_ID, TENANT_ID)

    expect(searchIndexRepo.deleteByEmploymentId).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
    expect(searchIndexRepo.upsert).not.toHaveBeenCalled()
  })

  it('rebuildAllForTenant truncates then rebuilds per employment', async () => {
    const employments = [
      { id: 'emp-1', tenantId: TENANT_ID },
      { id: 'emp-2', tenantId: TENANT_ID },
    ]
    vi.mocked(employmentRepo.listByTenant).mockResolvedValue(employments as any)
    vi.mocked(searchIndexRepo.rebuildAll).mockResolvedValue(undefined)
    // rebuildForEmployment will be called - make findById return null so it just calls delete
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await service.rebuildAllForTenant(TENANT_ID)

    expect(searchIndexRepo.rebuildAll).toHaveBeenCalledWith(TENANT_ID)
    expect(employmentRepo.listByTenant).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ limit: expect.any(Number), offset: 0 }),
    )
    expect(searchIndexRepo.deleteByEmploymentId).toHaveBeenCalledTimes(2)
  })
})
