import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdatePersonalProfileCommand } from './update-personal-profile.command'
import { UpdatePersonalProfileHandler } from './update-personal-profile.handler'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import type { IEmploymentDetailRepository } from '../../domain/repositories/employment-detail.repository'
import type { Employment } from '../../domain/entities/employment.entity'
import type { PersonProfile } from '../../domain/entities/person-profile.entity'
import type { EmploymentDetail } from '../../domain/entities/employment-detail.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000020'
const PROFILE_ID = '01900000-0000-7000-8000-000000000010'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

function makeEmployment(): Employment {
  return {
    id: EMPLOYMENT_ID,
    tenantId: TENANT_ID,
    personProfileId: PROFILE_ID,
    employeeCode: 'EMP001',
    companyEmail: 'emp@seta.vn',
    workerType: 'employee',
    employmentType: 'permanent',
    countryCode: 'VN',
    employmentStatus: 'active',
    terminationDate: null,
    terminationReason: null,
    hireDate: new Date('2025-01-01'),
    originalHireDate: null,
    previousProfileId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function makeProfile(overrides: Partial<PersonProfile> = {}): PersonProfile {
  return {
    id: PROFILE_ID,
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    familyName: 'Nguyễn',
    givenName: 'An',
    middleName: null,
    fullName: 'Nguyễn An',
    fullNameUnaccented: 'Nguyen An',
    preferredName: null,
    nameDisplayOrder: 'family_first',
    dateOfBirth: null,
    gender: null,
    nationality: null,
    maritalStatus: null,
    photoDocumentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeDetail(overrides: Partial<EmploymentDetail> = {}): EmploymentDetail {
  return {
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
    officeLocation: null,
    workPhone: null,
    ...overrides,
  }
}

describe('UpdatePersonalProfileHandler', () => {
  let handler: UpdatePersonalProfileHandler
  let employmentRepo: IEmploymentRepository
  let personProfileRepo: IPersonProfileRepository
  let employmentDetailRepo: IEmploymentDetailRepository

  beforeEach(() => {
    employmentRepo = {
      findById: vi.fn(),
      findManyByIds: vi.fn(),
      findByPersonProfileId: vi.fn(),
      findActiveByActorId: vi.fn(),
      findActiveRootEmployments: vi.fn(),
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
    employmentDetailRepo = {
      findByEmploymentId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }

    handler = new UpdatePersonalProfileHandler(
      employmentRepo,
      personProfileRepo,
      employmentDetailRepo,
    )
  })

  it('throws EmploymentNotFoundException when employment not found', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new UpdatePersonalProfileCommand(TENANT_ID, EMPLOYMENT_ID, ACTOR_ID, 'An Nguyen'),
      ),
    ).rejects.toThrow(EmploymentNotFoundException)
  })

  it('updates PersonProfile fields when provided', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(makeEmployment())
    vi.mocked(personProfileRepo.findById).mockResolvedValue(makeProfile())
    vi.mocked(personProfileRepo.update).mockResolvedValue(
      makeProfile({ preferredName: 'An Nguyen' }),
    )
    vi.mocked(employmentDetailRepo.update).mockResolvedValue(makeDetail())

    await handler.execute(
      new UpdatePersonalProfileCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        ACTOR_ID,
        'An Nguyen', // preferredName
        new Date('1995-03-15'), // dateOfBirth
        'male', // gender
        'VN', // nationality
        'single', // maritalStatus
        'given_first', // nameDisplayOrder
      ),
    )

    expect(personProfileRepo.update).toHaveBeenCalledWith(
      PROFILE_ID,
      TENANT_ID,
      expect.objectContaining({
        preferredName: 'An Nguyen',
        dateOfBirth: new Date('1995-03-15'),
        gender: 'male',
        nationality: 'VN',
        maritalStatus: 'single',
        nameDisplayOrder: 'given_first',
      }),
    )
  })

  it('updates EmploymentDetail contact fields when provided', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(makeEmployment())
    vi.mocked(personProfileRepo.findById).mockResolvedValue(makeProfile())
    vi.mocked(personProfileRepo.update).mockResolvedValue(makeProfile())
    vi.mocked(employmentDetailRepo.update).mockResolvedValue(makeDetail())

    await handler.execute(
      new UpdatePersonalProfileCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        ACTOR_ID,
        undefined, // preferredName
        undefined, // dateOfBirth
        undefined, // gender
        undefined, // nationality
        undefined, // maritalStatus
        undefined, // nameDisplayOrder
        'personal@gmail.com', // personalEmail
        '+84901234567', // personalPhone
      ),
    )

    expect(employmentDetailRepo.update).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      expect.objectContaining({
        personalEmail: 'personal@gmail.com',
        personalPhone: '+84901234567',
      }),
    )
  })

  it('updates bank fields when provided', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(makeEmployment())
    vi.mocked(personProfileRepo.findById).mockResolvedValue(makeProfile())
    vi.mocked(personProfileRepo.update).mockResolvedValue(makeProfile())
    vi.mocked(employmentDetailRepo.update).mockResolvedValue(makeDetail())

    await handler.execute(
      new UpdatePersonalProfileCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        ACTOR_ID,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        '1234567890', // bankAccountNumber
        'VietcomBank', // bankName
        'HCM Branch', // bankBranch
        'BFTVVNVX', // bankSwiftCode
        'Nguyễn Văn An', // bankAccountHolder
      ),
    )

    expect(employmentDetailRepo.update).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      expect.objectContaining({
        bankAccountNumber: '1234567890',
        bankName: 'VietcomBank',
        bankSwiftCode: 'BFTVVNVX',
      }),
    )
  })

  it('does not call personProfileRepo.update when no profile fields provided', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(makeEmployment())
    vi.mocked(personProfileRepo.findById).mockResolvedValue(makeProfile())
    vi.mocked(employmentDetailRepo.update).mockResolvedValue(makeDetail())

    await handler.execute(
      new UpdatePersonalProfileCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        ACTOR_ID,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined, // all profile fields absent
        'personal@gmail.com', // only contact field
      ),
    )

    expect(personProfileRepo.update).not.toHaveBeenCalled()
    expect(employmentDetailRepo.update).toHaveBeenCalled()
  })

  it('awaits PersonProfile update before EmploymentDetail update (sequential, not parallel)', async () => {
    const callOrder: string[] = []
    vi.mocked(employmentRepo.findById).mockResolvedValue(makeEmployment())
    vi.mocked(personProfileRepo.findById).mockResolvedValue(makeProfile())
    vi.mocked(personProfileRepo.update).mockImplementation(async () => {
      callOrder.push('profileUpdate')
      return makeProfile()
    })
    vi.mocked(employmentDetailRepo.update).mockImplementation(async () => {
      callOrder.push('detailUpdate')
      return makeDetail()
    })

    await handler.execute(
      new UpdatePersonalProfileCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        ACTOR_ID,
        'An Nguyen', // profile field — triggers profileUpdate
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'p@gmail.com', // detail field — triggers detailUpdate
      ),
    )

    expect(callOrder).toEqual(['profileUpdate', 'detailUpdate'])
  })
})
