import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncMicrosoftProfileCommand } from './sync-microsoft-profile.command'
import { SyncMicrosoftProfileHandler } from './sync-microsoft-profile.handler'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import type { IEmploymentDetailRepository } from '../../domain/repositories/employment-detail.repository'
import type { IdentityQueryFacade } from '../../../identity/application/facades/identity-query.facade'
import type { StorageClient } from '../../domain/ports/people-storage-client.port'
import type { Employment } from '../../domain/entities/employment.entity'
import type { PersonProfile } from '../../domain/entities/person-profile.entity'
import type { EmploymentDetail } from '../../domain/entities/employment-detail.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000020'
const PROFILE_ID = '01900000-0000-7000-8000-000000000010'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const PERFORMER_ID = '01900000-0000-7000-8000-000000000099'

function makeEmployment(overrides: Partial<Employment> = {}): Employment {
  return {
    id: EMPLOYMENT_ID,
    tenantId: TENANT_ID,
    personProfileId: PROFILE_ID,
    employeeCode: 'EMP001',
    companyEmail: 'old@seta.vn',
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
    ...overrides,
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

const fullMsData = {
  displayName: 'Nguyễn Văn An',
  mail: 'an.nguyen@seta.vn',
  officeLocation: 'Ho Chi Minh City',
  mobilePhone: '+84901234567',
  businessPhone: '+84281234567',
  photo: Buffer.from('jpeg-bytes'),
}

describe('SyncMicrosoftProfileHandler', () => {
  let handler: SyncMicrosoftProfileHandler
  let employmentRepo: IEmploymentRepository
  let personProfileRepo: IPersonProfileRepository
  let employmentDetailRepo: IEmploymentDetailRepository
  let identityFacade: IdentityQueryFacade
  let storageClient: StorageClient

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
    identityFacade = {
      getMicrosoftUserData: vi.fn(),
    } as unknown as IdentityQueryFacade
    storageClient = {
      getUploadUrl: vi.fn(),
      getDownloadUrl: vi.fn(),
      putObject: vi.fn(),
      deleteObject: vi.fn(),
      headObject: vi.fn(),
    }

    handler = new SyncMicrosoftProfileHandler(
      employmentRepo,
      personProfileRepo,
      employmentDetailRepo,
      identityFacade,
      storageClient,
    )
  })

  it('throws EmploymentNotFoundException when employment does not exist', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new SyncMicrosoftProfileCommand(TENANT_ID, EMPLOYMENT_ID, PERFORMER_ID)),
    ).rejects.toThrow(EmploymentNotFoundException)
  })

  it('returns empty SyncResult when no Microsoft data available (no linked account)', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(makeEmployment())
    vi.mocked(personProfileRepo.findById).mockResolvedValue(makeProfile())
    vi.mocked(identityFacade.getMicrosoftUserData).mockResolvedValue(null)

    const result = await handler.execute(
      new SyncMicrosoftProfileCommand(TENANT_ID, EMPLOYMENT_ID, PERFORMER_ID),
    )

    expect(result.updatedFields).toHaveLength(0)
    expect(result.skippedFields).toHaveLength(0)
    expect(personProfileRepo.update).not.toHaveBeenCalled()
    expect(employmentRepo.update).not.toHaveBeenCalled()
    expect(employmentDetailRepo.update).not.toHaveBeenCalled()
  })

  it('updates all authoritative fields on happy path', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(makeEmployment())
    vi.mocked(personProfileRepo.findById).mockResolvedValue(makeProfile())
    vi.mocked(identityFacade.getMicrosoftUserData).mockResolvedValue(fullMsData)
    vi.mocked(storageClient.putObject).mockResolvedValue(undefined)
    vi.mocked(personProfileRepo.update).mockResolvedValue(makeProfile())
    vi.mocked(employmentRepo.update).mockResolvedValue(makeEmployment())
    vi.mocked(employmentDetailRepo.update).mockResolvedValue(makeDetail())

    const result = await handler.execute(
      new SyncMicrosoftProfileCommand(TENANT_ID, EMPLOYMENT_ID, PERFORMER_ID),
    )

    expect(result.updatedFields).toEqual(
      expect.arrayContaining([
        'fullName',
        'preferredName',
        'photo',
        'companyEmail',
        'officeLocation',
        'personalPhone',
        'workPhone',
      ]),
    )
    expect(personProfileRepo.update).toHaveBeenCalledWith(
      PROFILE_ID,
      TENANT_ID,
      expect.objectContaining({ fullName: 'Nguyễn Văn An', preferredName: 'Nguyễn Văn An' }),
    )
    expect(employmentRepo.update).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      expect.objectContaining({ companyEmail: 'an.nguyen@seta.vn' }),
    )
    expect(employmentDetailRepo.update).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      expect.objectContaining({
        officeLocation: 'Ho Chi Minh City',
        personalPhone: '+84901234567',
        workPhone: '+84281234567',
      }),
    )
    expect(storageClient.putObject).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^people/photos/${TENANT_ID}/${PROFILE_ID}/[\\w-]+\\.jpg$`)),
      fullMsData.photo,
      'image/jpeg',
    )
  })

  it('skips photo but continues sync when photo is null', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(makeEmployment())
    vi.mocked(personProfileRepo.findById).mockResolvedValue(makeProfile())
    vi.mocked(identityFacade.getMicrosoftUserData).mockResolvedValue({
      ...fullMsData,
      photo: null,
    })
    vi.mocked(personProfileRepo.update).mockResolvedValue(makeProfile())
    vi.mocked(employmentRepo.update).mockResolvedValue(makeEmployment())
    vi.mocked(employmentDetailRepo.update).mockResolvedValue(makeDetail())

    const result = await handler.execute(
      new SyncMicrosoftProfileCommand(TENANT_ID, EMPLOYMENT_ID, PERFORMER_ID),
    )

    expect(result.skippedFields).toContain('photo')
    expect(storageClient.putObject).not.toHaveBeenCalled()
    expect(result.updatedFields).toEqual(
      expect.arrayContaining(['fullName', 'preferredName', 'companyEmail']),
    )
  })

  it('propagates Graph API errors without partial writes', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(makeEmployment())
    vi.mocked(personProfileRepo.findById).mockResolvedValue(makeProfile())
    vi.mocked(identityFacade.getMicrosoftUserData).mockRejectedValue(
      new Error('Graph 503: Service unavailable'),
    )

    await expect(
      handler.execute(new SyncMicrosoftProfileCommand(TENANT_ID, EMPLOYMENT_ID, PERFORMER_ID)),
    ).rejects.toThrow('Graph 503: Service unavailable')

    expect(personProfileRepo.update).not.toHaveBeenCalled()
    expect(employmentRepo.update).not.toHaveBeenCalled()
    expect(employmentDetailRepo.update).not.toHaveBeenCalled()
  })
})
