import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateEmploymentCommand } from './create-employment.command'
import { CreateEmploymentHandler } from './create-employment.handler'
import { PersonProfileNotFoundException } from '../../domain/exceptions/people.exceptions'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IEmploymentDetailRepository } from '../../domain/repositories/employment-detail.repository'
import type { PersonProfile } from '../../domain/entities/person-profile.entity'
import type { Employment } from '../../domain/entities/employment.entity'
import type { EmploymentDetail } from '../../domain/entities/employment-detail.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PERSON_PROFILE_ID = '01900000-0000-7000-8000-000000000010'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000020'
const CREATED_BY = '01900000-0000-7000-8000-000000000005'

function makePersonProfile(): PersonProfile {
  return {
    id: PERSON_PROFILE_ID,
    tenantId: TENANT_ID,
    actorId: '01900000-0000-7000-8000-000000000002',
    familyName: 'Nguyen',
    givenName: 'An',
    middleName: null,
    fullName: 'Nguyen An',
    fullNameUnaccented: 'Nguyen An',
    preferredName: null,
    nameDisplayOrder: 'family_first',
    dateOfBirth: null,
    gender: null,
    nationality: null,
    maritalStatus: null,
    photoDocumentId: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  }
}

function makeEmployment(): Employment {
  return {
    id: EMPLOYMENT_ID,
    tenantId: TENANT_ID,
    personProfileId: PERSON_PROFILE_ID,
    employeeCode: null,
    companyEmail: null,
    workerType: 'employee',
    employmentType: 'permanent',
    countryCode: 'VN',
    employmentStatus: 'pre_hire',
    terminationDate: null,
    terminationReason: null,
    hireDate: new Date('2026-02-01'),
    originalHireDate: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  }
}

function makeDetail(): EmploymentDetail {
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
    msJobTitle: null,
    msDepartment: null,
  }
}

describe('CreateEmploymentHandler', () => {
  let handler: CreateEmploymentHandler
  let personProfileRepo: IPersonProfileRepository
  let employmentRepo: IEmploymentRepository
  let employmentDetailRepo: IEmploymentDetailRepository

  beforeEach(() => {
    personProfileRepo = {
      findById: vi.fn().mockResolvedValue(makePersonProfile()),
      findByActorId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    } as unknown as IPersonProfileRepository

    employmentRepo = {
      findById: vi.fn(),
      findByPersonProfileId: vi.fn(),
      findActiveByActorId: vi.fn(),
      insert: vi.fn().mockResolvedValue(makeEmployment()),
      updateStatus: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
      countByTenant: vi.fn(),
    } as unknown as IEmploymentRepository

    employmentDetailRepo = {
      findByEmploymentId: vi.fn(),
      insert: vi.fn().mockResolvedValue(makeDetail()),
      update: vi.fn(),
    } as unknown as IEmploymentDetailRepository

    handler = new CreateEmploymentHandler(personProfileRepo, employmentRepo, employmentDetailRepo, {
      publish: vi.fn(),
    } as never)
  })

  it('creates employment in pre_hire status', async () => {
    const result = await handler.execute(
      new CreateEmploymentCommand(
        TENANT_ID,
        PERSON_PROFILE_ID,
        'employee',
        'permanent',
        'VN',
        new Date('2026-02-01'),
        CREATED_BY,
      ),
    )

    expect(employmentRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        personProfileId: PERSON_PROFILE_ID,
        workerType: 'employee',
        employmentType: 'permanent',
        countryCode: 'VN',
        employmentStatus: 'pre_hire',
      }),
    )
    expect(result.employmentStatus).toBe('pre_hire')
  })

  it('auto-creates empty employment_detail', async () => {
    await handler.execute(
      new CreateEmploymentCommand(
        TENANT_ID,
        PERSON_PROFILE_ID,
        'employee',
        'permanent',
        'VN',
        new Date('2026-02-01'),
        CREATED_BY,
      ),
    )

    expect(employmentDetailRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        employmentId: EMPLOYMENT_ID,
        nationalId: null,
        bankAccountNumber: null,
      }),
    )
  })

  it('throws PersonProfileNotFoundException when profile does not exist', async () => {
    vi.mocked(personProfileRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new CreateEmploymentCommand(
          TENANT_ID,
          PERSON_PROFILE_ID,
          'employee',
          'permanent',
          'VN',
          new Date('2026-02-01'),
          CREATED_BY,
        ),
      ),
    ).rejects.toThrow(PersonProfileNotFoundException)

    expect(employmentRepo.insert).not.toHaveBeenCalled()
  })
})
