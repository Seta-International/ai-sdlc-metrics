import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetEmploymentQuery } from './get-employment.query'
import { GetEmploymentHandler } from './get-employment.handler'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import type { IJobAssignmentRepository } from '../../domain/repositories/job-assignment.repository'
import type { IEmploymentDetailRepository } from '../../domain/repositories/employment-detail.repository'
import type { IProfileSectionRepository } from '../../domain/repositories/profile-section.repository'
import type { Employment } from '../../domain/entities/employment.entity'
import type { PersonProfile } from '../../domain/entities/person-profile.entity'
import type { JobAssignment } from '../../domain/entities/job-assignment.entity'
import type { EmploymentDetail } from '../../domain/entities/employment-detail.entity'
import type { ProfileSection } from '../../domain/entities/profile-section.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000004'

const mockEmployment: Employment = {
  id: EMPLOYMENT_ID,
  tenantId: TENANT_ID,
  personProfileId: PROFILE_ID,
  employeeCode: 'EMP001',
  companyEmail: 'john.doe@example.com',
  workerType: 'employee',
  employmentType: 'permanent',
  countryCode: 'SG',
  employmentStatus: 'active',
  terminationDate: null,
  terminationReason: null,
  hireDate: new Date('2024-01-01'),
  originalHireDate: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

const mockProfile: PersonProfile = {
  id: PROFILE_ID,
  tenantId: TENANT_ID,
  actorId: ACTOR_ID,
  familyName: 'Doe',
  middleName: null,
  givenName: 'John',
  fullName: 'John Doe',
  fullNameUnaccented: 'John Doe',
  preferredName: null,
  nameDisplayOrder: 'given_first',
  dateOfBirth: null,
  gender: null,
  nationality: null,
  maritalStatus: null,
  photoDocumentId: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

const mockAssignment: JobAssignment = {
  id: '01900000-0000-7000-8000-000000000010',
  tenantId: TENANT_ID,
  employmentId: EMPLOYMENT_ID,
  effectiveFrom: new Date('2024-01-01'),
  effectiveTo: null,
  jobProfileId: '01900000-0000-7000-8000-000000000020',
  departmentId: null,
  locationId: null,
  costCenterId: null,
  workArrangement: 'onsite',
  managerId: null,
  eventType: 'hire',
  reason: null,
  createdBy: ACTOR_ID,
  createdAt: new Date('2024-01-01'),
}

const mockDetail: EmploymentDetail = {
  id: '01900000-0000-7000-8000-000000000030',
  tenantId: TENANT_ID,
  employmentId: EMPLOYMENT_ID,
  nationalId: null,
  nationalIdType: null,
  nationalIdIssuedDate: null,
  nationalIdExpiryDate: null,
  taxId: null,
  socialInsuranceId: null,
  passportNumber: null,
  passportExpiryDate: null,
  bankAccountNumber: null,
  bankName: null,
  bankBranch: null,
  bankAccountHolder: null,
  bankSwiftCode: null,
  personalEmail: null,
  personalPhone: null,
  permanentAddress: null,
  currentAddress: null,
  emergencyContacts: null,
  countryData: null,
  customFields: null,
}

const mockSections: ProfileSection[] = [
  {
    id: '01900000-0000-7000-8000-000000000040',
    tenantId: TENANT_ID,
    profileId: PROFILE_ID,
    sectionType: 'skill',
    payload: { name: 'TypeScript' },
    displayOrder: 1,
  },
]

describe('GetEmploymentHandler', () => {
  let handler: GetEmploymentHandler
  let employmentRepo: IEmploymentRepository
  let personProfileRepo: IPersonProfileRepository
  let jobAssignmentRepo: IJobAssignmentRepository
  let employmentDetailRepo: IEmploymentDetailRepository
  let profileSectionRepo: IProfileSectionRepository

  beforeEach(() => {
    employmentRepo = {
      findById: vi.fn(),
      findByPersonProfileId: vi.fn(),
      findActiveByActorId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
      countByTenant: vi.fn(),
    }
    personProfileRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    jobAssignmentRepo = {
      findById: vi.fn(),
      findCurrent: vi.fn(),
      findAsOf: vi.fn(),
      findHistory: vi.fn(),
      insert: vi.fn(),
      closeAssignment: vi.fn(),
      delete: vi.fn(),
    }
    employmentDetailRepo = {
      findByEmploymentId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    profileSectionRepo = {
      findById: vi.fn(),
      findByProfileId: vi.fn(),
      findByProfileIdAndType: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }

    handler = new GetEmploymentHandler(
      employmentRepo,
      personProfileRepo,
      jobAssignmentRepo,
      employmentDetailRepo,
      profileSectionRepo,
    )
  })

  it('returns null when employment is not found', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    const result = await handler.execute(new GetEmploymentQuery(EMPLOYMENT_ID, TENANT_ID))

    expect(employmentRepo.findById).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
    expect(personProfileRepo.findById).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('returns employment with full data when found', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(mockEmployment)
    vi.mocked(personProfileRepo.findById).mockResolvedValue(mockProfile)
    vi.mocked(jobAssignmentRepo.findCurrent).mockResolvedValue(mockAssignment)
    vi.mocked(employmentDetailRepo.findByEmploymentId).mockResolvedValue(mockDetail)
    vi.mocked(profileSectionRepo.findByProfileId).mockResolvedValue(mockSections)

    const result = await handler.execute(new GetEmploymentQuery(EMPLOYMENT_ID, TENANT_ID))

    expect(result).not.toBeNull()
    expect(result!.employment).toEqual(mockEmployment)
    expect(result!.personProfile).toEqual(mockProfile)
    expect(result!.currentAssignment).toEqual(mockAssignment)
    expect(result!.detail).toEqual(mockDetail)
    expect(result!.sections).toEqual(mockSections)
  })

  it('returns employment with null assignment and detail when not available', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(mockEmployment)
    vi.mocked(personProfileRepo.findById).mockResolvedValue(mockProfile)
    vi.mocked(jobAssignmentRepo.findCurrent).mockResolvedValue(null)
    vi.mocked(employmentDetailRepo.findByEmploymentId).mockResolvedValue(null)
    vi.mocked(profileSectionRepo.findByProfileId).mockResolvedValue([])

    const result = await handler.execute(new GetEmploymentQuery(EMPLOYMENT_ID, TENANT_ID))

    expect(result).not.toBeNull()
    expect(result!.currentAssignment).toBeNull()
    expect(result!.detail).toBeNull()
    expect(result!.sections).toEqual([])
  })
})
