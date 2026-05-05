import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetPersonProfileQuery } from './get-person-profile.query'
import { GetPersonProfileHandler } from './get-person-profile.handler'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IJobAssignmentRepository } from '../../domain/repositories/job-assignment.repository'
import type { IEmploymentDetailRepository } from '../../domain/repositories/employment-detail.repository'
import type { PersonProfile } from '../../domain/entities/person-profile.entity'
import type { Employment } from '../../domain/entities/employment.entity'
import type { JobAssignment } from '../../domain/entities/job-assignment.entity'
import type { EmploymentDetail } from '../../domain/entities/employment-detail.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const EMPLOYMENT_ID_1 = '01900000-0000-7000-8000-000000000004'
const EMPLOYMENT_ID_2 = '01900000-0000-7000-8000-000000000005'

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

const mockEmployment1: Employment = {
  id: EMPLOYMENT_ID_1,
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

const mockEmployment2: Employment = {
  id: EMPLOYMENT_ID_2,
  tenantId: TENANT_ID,
  personProfileId: PROFILE_ID,
  employeeCode: 'EMP002',
  companyEmail: null,
  workerType: 'contingent',
  employmentType: 'fixed_term',
  countryCode: 'VN',
  employmentStatus: 'terminated',
  terminationDate: new Date('2023-12-31'),
  terminationReason: 'end_of_contract',
  hireDate: new Date('2023-01-01'),
  originalHireDate: null,
  createdAt: new Date('2023-01-01'),
  updatedAt: new Date('2024-01-01'),
}

const mockAssignment: JobAssignment = {
  id: '01900000-0000-7000-8000-000000000010',
  tenantId: TENANT_ID,
  employmentId: EMPLOYMENT_ID_1,
  effectiveFrom: new Date('2024-01-01'),
  effectiveTo: null,
  jobProfileId: '01900000-0000-7000-8000-000000000020',
  departmentId: null,
  locationId: null,
  costCenterId: null,
  workArrangement: 'hybrid',
  managerId: null,
  eventType: 'hire',
  reason: null,
  createdBy: ACTOR_ID,
  createdAt: new Date('2024-01-01'),
}

const mockDetail: EmploymentDetail = {
  id: '01900000-0000-7000-8000-000000000030',
  tenantId: TENANT_ID,
  employmentId: EMPLOYMENT_ID_1,
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
  officeLocation: null,
  workPhone: null,
  msJobTitle: null,
  msDepartment: null,
}

describe('GetPersonProfileHandler', () => {
  let handler: GetPersonProfileHandler
  let personProfileRepo: IPersonProfileRepository
  let employmentRepo: IEmploymentRepository
  let jobAssignmentRepo: IJobAssignmentRepository
  let employmentDetailRepo: IEmploymentDetailRepository

  beforeEach(() => {
    personProfileRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
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

    handler = new GetPersonProfileHandler(
      personProfileRepo,
      employmentRepo,
      jobAssignmentRepo,
      employmentDetailRepo,
    )
  })

  it('returns null when profile is not found', async () => {
    vi.mocked(personProfileRepo.findByActorId).mockResolvedValue(null)

    const result = await handler.execute(new GetPersonProfileQuery(ACTOR_ID, TENANT_ID))

    expect(personProfileRepo.findByActorId).toHaveBeenCalledWith(ACTOR_ID, TENANT_ID)
    expect(employmentRepo.findByPersonProfileId).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('returns profile with one employment and its assignment and detail', async () => {
    vi.mocked(personProfileRepo.findByActorId).mockResolvedValue(mockProfile)
    vi.mocked(employmentRepo.findByPersonProfileId).mockResolvedValue([mockEmployment1])
    vi.mocked(jobAssignmentRepo.findCurrent).mockResolvedValue(mockAssignment)
    vi.mocked(employmentDetailRepo.findByEmploymentId).mockResolvedValue(mockDetail)

    const result = await handler.execute(new GetPersonProfileQuery(ACTOR_ID, TENANT_ID))

    expect(result).not.toBeNull()
    expect(result!.profile).toEqual(mockProfile)
    expect(result!.employments).toHaveLength(1)
    expect(result!.employments[0].employment).toEqual(mockEmployment1)
    expect(result!.employments[0].currentAssignment).toEqual(mockAssignment)
    expect(result!.employments[0].detail).toEqual(mockDetail)
  })

  it('returns profile with multiple employments', async () => {
    vi.mocked(personProfileRepo.findByActorId).mockResolvedValue(mockProfile)
    vi.mocked(employmentRepo.findByPersonProfileId).mockResolvedValue([
      mockEmployment1,
      mockEmployment2,
    ])
    vi.mocked(jobAssignmentRepo.findCurrent)
      .mockResolvedValueOnce(mockAssignment)
      .mockResolvedValueOnce(null)
    vi.mocked(employmentDetailRepo.findByEmploymentId)
      .mockResolvedValueOnce(mockDetail)
      .mockResolvedValueOnce(null)

    const result = await handler.execute(new GetPersonProfileQuery(ACTOR_ID, TENANT_ID))

    expect(result).not.toBeNull()
    expect(result!.profile).toEqual(mockProfile)
    expect(result!.employments).toHaveLength(2)
    expect(result!.employments[0].employment).toEqual(mockEmployment1)
    expect(result!.employments[0].currentAssignment).toEqual(mockAssignment)
    expect(result!.employments[0].detail).toEqual(mockDetail)
    expect(result!.employments[1].employment).toEqual(mockEmployment2)
    expect(result!.employments[1].currentAssignment).toBeNull()
    expect(result!.employments[1].detail).toBeNull()
  })
})
