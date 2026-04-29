import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateEmploymentDetailCommand } from './update-employment-detail.command'
import { UpdateEmploymentDetailHandler } from './update-employment-detail.handler'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IEmploymentDetailRepository } from '../../domain/repositories/employment-detail.repository'
import type { Employment } from '../../domain/entities/employment.entity'
import type { EmploymentDetail } from '../../domain/entities/employment-detail.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000020'
const UPDATED_BY = '01900000-0000-7000-8000-000000000005'

function makeEmployment(): Employment {
  return {
    id: EMPLOYMENT_ID,
    tenantId: TENANT_ID,
    personProfileId: '01900000-0000-7000-8000-000000000010',
    employeeCode: null,
    companyEmail: null,
    workerType: 'employee',
    employmentType: 'permanent',
    countryCode: 'VN',
    employmentStatus: 'active',
    terminationDate: null,
    terminationReason: null,
    hireDate: new Date('2026-02-01'),
    originalHireDate: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
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

describe('UpdateEmploymentDetailHandler', () => {
  let handler: UpdateEmploymentDetailHandler
  let employmentRepo: IEmploymentRepository
  let employmentDetailRepo: IEmploymentDetailRepository

  beforeEach(() => {
    employmentRepo = {
      findById: vi.fn().mockResolvedValue(makeEmployment()),
      findByPersonProfileId: vi.fn(),
      findActiveByActorId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
      countByTenant: vi.fn(),
    } as unknown as IEmploymentRepository

    employmentDetailRepo = {
      findByEmploymentId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn().mockResolvedValue(makeDetail()),
    } as unknown as IEmploymentDetailRepository

    handler = new UpdateEmploymentDetailHandler(employmentRepo, employmentDetailRepo)
  })

  it('updates bank details', async () => {
    vi.mocked(employmentDetailRepo.update).mockResolvedValue(
      makeDetail({
        bankAccountNumber: '1234567890',
        bankName: 'Vietcombank',
        bankAccountHolder: 'NGUYEN VAN AN',
      }),
    )

    const result = await handler.execute(
      new UpdateEmploymentDetailCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        UPDATED_BY,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        '1234567890',
        'Vietcombank',
        undefined,
        'NGUYEN VAN AN',
      ),
    )

    expect(employmentDetailRepo.update).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      expect.objectContaining({
        bankAccountNumber: '1234567890',
        bankName: 'Vietcombank',
        bankAccountHolder: 'NGUYEN VAN AN',
      }),
    )
    expect(result.bankAccountNumber).toBe('1234567890')
  })

  it('throws EmploymentNotFoundException when employment not found', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new UpdateEmploymentDetailCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          UPDATED_BY,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          '123',
        ),
      ),
    ).rejects.toThrow(EmploymentNotFoundException)

    expect(employmentDetailRepo.update).not.toHaveBeenCalled()
  })
})
