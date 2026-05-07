import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ListOnboardingCasesQuery } from './list-onboarding-cases.query'
import { ListOnboardingCasesHandler } from './list-onboarding-cases.handler'
import type { IOnboardingCaseRepository } from '../../domain/repositories/onboarding-case.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import type { IJobAssignmentRepository } from '../../domain/repositories/job-assignment.repository'
import type { IJobProfileRepository } from '../../domain/repositories/job-profile.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const CASE_ID = '01900000-0000-7000-8000-000000000002'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000003'
const PROFILE_ID = '01900000-0000-7000-8000-000000000004'
const JOB_PROFILE_ID = '01900000-0000-7000-8000-000000000005'

describe('ListOnboardingCasesHandler', () => {
  let caseRepo: Partial<IOnboardingCaseRepository>
  let employmentRepo: Partial<IEmploymentRepository>
  let profileRepo: Partial<IPersonProfileRepository>
  let assignmentRepo: Partial<IJobAssignmentRepository>
  let jobProfileRepo: Partial<IJobProfileRepository>

  beforeEach(() => {
    caseRepo = {
      findAllActive: vi.fn().mockResolvedValue([]),
      getTaskAggregates: vi.fn().mockResolvedValue([]),
    }
    employmentRepo = {
      findManyByIds: vi.fn().mockResolvedValue([]),
    }
    profileRepo = {
      findManyByIds: vi.fn().mockResolvedValue([]),
    }
    assignmentRepo = {
      findCurrentMany: vi.fn().mockResolvedValue([]),
    }
    jobProfileRepo = {
      listByTenant: vi.fn().mockResolvedValue([]),
    }
  })

  function makeHandler() {
    return new ListOnboardingCasesHandler(
      caseRepo as IOnboardingCaseRepository,
      employmentRepo as IEmploymentRepository,
      profileRepo as IPersonProfileRepository,
      assignmentRepo as IJobAssignmentRepository,
      jobProfileRepo as IJobProfileRepository,
    )
  }

  it('returns empty array when no active cases exist', async () => {
    const result = await makeHandler().execute(new ListOnboardingCasesQuery(TENANT_ID))

    expect(caseRepo.findAllActive).toHaveBeenCalledWith(TENANT_ID)
    expect(result).toEqual([])
  })

  it('returns enriched list with correct counts and blockers', async () => {
    vi.mocked(caseRepo.findAllActive!).mockResolvedValue([
      {
        id: CASE_ID,
        tenantId: TENANT_ID,
        employmentId: EMPLOYMENT_ID,
        templateId: null,
        status: 'in_progress',
        stage: 'paperwork',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    vi.mocked(caseRepo.getTaskAggregates!).mockResolvedValue([
      { caseId: CASE_ID, tasksTotal: 3, tasksCompleted: 1, blockers: 1 },
    ])
    vi.mocked(employmentRepo.findManyByIds!).mockResolvedValue([
      {
        id: EMPLOYMENT_ID,
        tenantId: TENANT_ID,
        personProfileId: PROFILE_ID,
        previousProfileId: null,
        employeeCode: 'E001',
        companyEmail: 'john@example.com',
        workerType: 'employee',
        employmentType: 'permanent',
        countryCode: 'VN',
        employmentStatus: 'active',
        terminationDate: null,
        terminationReason: null,
        hireDate: new Date('2025-01-15'),
        originalHireDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    vi.mocked(profileRepo.findManyByIds!).mockResolvedValue([
      {
        id: PROFILE_ID,
        tenantId: TENANT_ID,
        actorId: 'actor-001',
        familyName: 'Doe',
        givenName: 'John',
        middleName: null,
        fullName: 'John Doe',
        fullNameUnaccented: 'John Doe',
        preferredName: null,
        nameDisplayOrder: 'given_first',
        dateOfBirth: null,
        gender: null,
        nationality: null,
        maritalStatus: null,
        photoDocumentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    vi.mocked(assignmentRepo.findCurrentMany!).mockResolvedValue([
      {
        id: 'assignment-001',
        tenantId: TENANT_ID,
        employmentId: EMPLOYMENT_ID,
        effectiveFrom: new Date(),
        effectiveTo: null,
        jobProfileId: JOB_PROFILE_ID,
        departmentId: null,
        locationId: null,
        costCenterId: null,
        workArrangement: 'hybrid',
        managerId: null,
        eventType: 'hire',
        reason: null,
        createdBy: 'actor-001',
        createdAt: new Date(),
      },
    ])
    vi.mocked(jobProfileRepo.listByTenant!).mockResolvedValue([
      {
        id: JOB_PROFILE_ID,
        tenantId: TENANT_ID,
        jobFamilyId: 'family-001',
        title: 'Software Engineer',
        level: 'L4',
        description: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const result = await makeHandler().execute(new ListOnboardingCasesQuery(TENANT_ID))

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: CASE_ID,
      employmentId: EMPLOYMENT_ID,
      employeeName: 'John Doe',
      jobTitle: 'Software Engineer',
      department: '',
      avatarUrl: null,
      startDate: '2025-01-15',
      stage: 'paperwork',
      tasksTotal: 3,
      tasksCompleted: 1,
      blockers: 1,
    })
  })

  it('enforces tenant isolation by calling findAllActive with the correct tenantId', async () => {
    const OTHER_TENANT = '01900000-0000-7000-8000-000000000099'

    await makeHandler().execute(new ListOnboardingCasesQuery(OTHER_TENANT))

    expect(caseRepo.findAllActive).toHaveBeenCalledWith(OTHER_TENANT)
    expect(caseRepo.findAllActive).not.toHaveBeenCalledWith(TENANT_ID)
  })
})
