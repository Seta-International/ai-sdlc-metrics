import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnCandidateHiredHandler } from './on-candidate-hired.handler'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IEmploymentDetailRepository } from '../../domain/repositories/employment-detail.repository'
import type { IJobAssignmentRepository } from '../../domain/repositories/job-assignment.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000004'

describe('OnCandidateHiredHandler', () => {
  let handler: OnCandidateHiredHandler
  let profileRepo: IPersonProfileRepository
  let employmentRepo: IEmploymentRepository
  let detailRepo: IEmploymentDetailRepository
  let assignmentRepo: IJobAssignmentRepository
  let templateSelector: any
  let onboardingCaseRepo: any

  beforeEach(() => {
    profileRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    } as unknown as IPersonProfileRepository
    employmentRepo = {
      findById: vi.fn(),
      findByPersonProfileId: vi.fn(),
      findActiveByActorId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
      countByTenant: vi.fn(),
    } as unknown as IEmploymentRepository
    detailRepo = {
      findByEmploymentId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    } as unknown as IEmploymentDetailRepository
    assignmentRepo = {
      findById: vi.fn(),
      findCurrent: vi.fn(),
      findAsOf: vi.fn(),
      findHistory: vi.fn(),
      insert: vi.fn(),
      closeAssignment: vi.fn(),
      delete: vi.fn(),
    } as unknown as IJobAssignmentRepository
    templateSelector = {
      selectTemplate: vi.fn(),
    }
    onboardingCaseRepo = {
      findByEmploymentId: vi.fn(),
      insert: vi.fn(),
    }

    handler = new OnCandidateHiredHandler(
      profileRepo,
      employmentRepo,
      detailRepo,
      assignmentRepo,
      templateSelector,
      onboardingCaseRepo,
    )
  })

  it('creates person_profile + employment + job_assignment + onboarding case on CandidateHiredEvent', async () => {
    vi.mocked(profileRepo.findByActorId).mockResolvedValue(null)
    vi.mocked(profileRepo.insert).mockResolvedValue({
      id: PROFILE_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
    } as any)
    vi.mocked(employmentRepo.insert).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      personProfileId: PROFILE_ID,
      employmentStatus: 'pre_hire',
    } as any)
    vi.mocked(detailRepo.insert).mockResolvedValue({} as any)
    vi.mocked(assignmentRepo.insert).mockResolvedValue({} as any)
    vi.mocked(templateSelector.selectTemplate).mockResolvedValue({
      id: 'template-1',
      name: 'VN Employee Onboarding',
    })
    vi.mocked(onboardingCaseRepo.insert).mockResolvedValue({} as any)

    await handler.handle({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      familyName: 'Nguyễn',
      givenName: 'An',
      middleName: 'Văn',
      countryCode: 'VN',
      workerType: 'employee',
      employmentType: 'permanent',
      hireDate: new Date('2026-06-01'),
      jobProfileId: 'job-profile-1',
      departmentId: 'dept-1',
    } as any)

    expect(profileRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        familyName: 'Nguyễn',
        givenName: 'An',
        middleName: 'Văn',
        nameDisplayOrder: 'family_first',
      }),
    )

    expect(employmentRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        personProfileId: PROFILE_ID,
        employmentStatus: 'pre_hire',
        workerType: 'employee',
        countryCode: 'VN',
      }),
    )

    expect(detailRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ employmentId: EMPLOYMENT_ID }),
    )

    expect(assignmentRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        employmentId: EMPLOYMENT_ID,
        jobProfileId: 'job-profile-1',
        eventType: 'hire',
      }),
    )

    expect(onboardingCaseRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        employmentId: EMPLOYMENT_ID,
        templateId: 'template-1',
      }),
    )
  })

  it('reuses existing person_profile for rehire', async () => {
    vi.mocked(profileRepo.findByActorId).mockResolvedValue({
      id: PROFILE_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
    } as any)
    vi.mocked(employmentRepo.insert).mockResolvedValue({
      id: EMPLOYMENT_ID,
      personProfileId: PROFILE_ID,
    } as any)
    vi.mocked(detailRepo.insert).mockResolvedValue({} as any)
    vi.mocked(assignmentRepo.insert).mockResolvedValue({} as any)
    vi.mocked(templateSelector.selectTemplate).mockResolvedValue(null)

    await handler.handle({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      familyName: 'Nguyễn',
      givenName: 'An',
      middleName: null,
      countryCode: 'VN',
      workerType: 'employee',
      employmentType: 'permanent',
      hireDate: new Date('2026-06-01'),
      jobProfileId: 'job-profile-1',
      departmentId: 'dept-1',
    } as any)

    expect(profileRepo.insert).not.toHaveBeenCalled()
    expect(employmentRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ personProfileId: PROFILE_ID }),
    )
  })
})
