import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetProfileQuery } from './get-profile.query'
import { GetProfileHandler } from './get-profile.handler'
import type { IEmploymentProfileRepository } from '../../domain/repositories/employment-profile.repository'
import type { IEmploymentProfileDetailRepository } from '../../domain/repositories/employment-profile-detail.repository'
import type { IProfileSectionRepository } from '../../domain/repositories/profile-section.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'

const mockProfile = {
  id: PROFILE_ID,
  tenantId: TENANT_ID,
  actorId: ACTOR_ID,
  employeeCode: 'SETA-001',
  companyEmail: 'test@seta.vn',
  employmentType: 'permanent' as const,
  employmentStatus: 'active' as const,
  workArrangement: 'onsite' as const,
  hireDate: new Date('2026-01-01'),
  terminationDate: null,
  jobTitle: 'Engineer',
  jobLevel: null,
  costCenter: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockDetail = {
  profileId: PROFILE_ID,
  tenantId: TENANT_ID,
  nationalId: null,
  nationalIdIssuedDate: null,
  nationalIdIssuedPlace: null,
  oldNationalId: null,
  oldNationalIdIssuedDate: null,
  oldNationalIdIssuedPlace: null,
  taxId: null,
  socialInsuranceNumber: null,
  bankAccountNumber: null,
  bankName: null,
  bankBranch: null,
  dob: null,
  gender: null,
  maritalStatus: null,
  permanentAddress: null,
  currentAddress: null,
  personalPhone: null,
  personalEmail: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  motorbikePlate: null,
}

const mockSections = [
  {
    id: '01900000-0000-7000-8000-000000000010',
    tenantId: TENANT_ID,
    profileId: PROFILE_ID,
    sectionType: 'education' as const,
    payload: {},
    displayOrder: 1,
  },
]

describe('GetProfileHandler', () => {
  let handler: GetProfileHandler
  let profileRepo: IEmploymentProfileRepository
  let detailRepo: IEmploymentProfileDetailRepository
  let sectionRepo: IProfileSectionRepository

  beforeEach(() => {
    profileRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      findByEmployeeCode: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
    }
    detailRepo = {
      findByProfileId: vi.fn(),
      upsert: vi.fn(),
      updateField: vi.fn(),
    }
    sectionRepo = {
      findById: vi.fn(),
      findByProfileId: vi.fn(),
      findByProfileIdAndType: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }
    handler = new GetProfileHandler(profileRepo, detailRepo, sectionRepo)
  })

  it('returns null when no profile found for actorId', async () => {
    vi.mocked(profileRepo.findByActorId).mockResolvedValue(null)

    const result = await handler.execute(new GetProfileQuery(ACTOR_ID, TENANT_ID))

    expect(profileRepo.findByActorId).toHaveBeenCalledWith(ACTOR_ID, TENANT_ID)
    expect(result).toBeNull()
  })

  it('returns profile, detail, and sections in parallel when profile exists', async () => {
    vi.mocked(profileRepo.findByActorId).mockResolvedValue(mockProfile)
    vi.mocked(detailRepo.findByProfileId).mockResolvedValue(mockDetail)
    vi.mocked(sectionRepo.findByProfileId).mockResolvedValue(mockSections)

    const result = await handler.execute(new GetProfileQuery(ACTOR_ID, TENANT_ID))

    expect(profileRepo.findByActorId).toHaveBeenCalledWith(ACTOR_ID, TENANT_ID)
    expect(detailRepo.findByProfileId).toHaveBeenCalledWith(PROFILE_ID, TENANT_ID)
    expect(sectionRepo.findByProfileId).toHaveBeenCalledWith(PROFILE_ID, TENANT_ID)
    expect(result).toEqual({
      profile: mockProfile,
      detail: mockDetail,
      sections: mockSections,
    })
  })

  it('returns null detail when detail not found', async () => {
    vi.mocked(profileRepo.findByActorId).mockResolvedValue(mockProfile)
    vi.mocked(detailRepo.findByProfileId).mockResolvedValue(null)
    vi.mocked(sectionRepo.findByProfileId).mockResolvedValue([])

    const result = await handler.execute(new GetProfileQuery(ACTOR_ID, TENANT_ID))

    expect(result).toEqual({
      profile: mockProfile,
      detail: null,
      sections: [],
    })
  })
})
