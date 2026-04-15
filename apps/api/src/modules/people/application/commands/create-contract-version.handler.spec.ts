import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IContractVersionRepository } from '../../domain/repositories/contract-version.repository'
import type { Employment } from '../../domain/entities/employment.entity'
import type { ContractVersion } from '../../domain/entities/contract-version.entity'
import { CreateContractVersionCommand } from './create-contract-version.command'
import { CreateContractVersionHandler } from './create-contract-version.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000010'
const CREATED_BY = '01900000-0000-7000-8000-000000000005'
const CONTRACT_ID = '01900000-0000-7000-8000-000000000020'

function makeEmployment(overrides: Partial<Employment> = {}): Employment {
  return {
    id: EMPLOYMENT_ID,
    tenantId: TENANT_ID,
    personProfileId: '01900000-0000-7000-8000-000000000030',
    employeeCode: null,
    companyEmail: null,
    workerType: 'employee',
    employmentType: 'permanent',
    countryCode: 'VN',
    employmentStatus: 'active',
    terminationDate: null,
    terminationReason: null,
    hireDate: new Date('2026-01-01'),
    originalHireDate: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function makeContractVersion(overrides: Partial<ContractVersion> = {}): ContractVersion {
  return {
    id: CONTRACT_ID,
    tenantId: TENANT_ID,
    employmentId: EMPLOYMENT_ID,
    contractType: 'indefinite',
    startDate: new Date('2026-01-01'),
    endDate: null,
    status: 'active',
    probationEndDate: null,
    noticePeriodDays: null,
    workHoursPerWeek: null,
    baseSalary: null,
    salaryCurrency: null,
    salaryFrequency: null,
    documentId: null,
    note: null,
    createdBy: CREATED_BY,
    createdAt: new Date('2026-01-01'),
    signedAt: null,
    signedBy: null,
    ...overrides,
  }
}

describe('CreateContractVersionHandler', () => {
  let handler: CreateContractVersionHandler
  let employmentRepo: IEmploymentRepository
  let contractVersionRepo: IContractVersionRepository

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

    contractVersionRepo = {
      findById: vi.fn(),
      findByEmploymentId: vi.fn(),
      findActiveByEmploymentId: vi.fn().mockResolvedValue(null),
      insert: vi.fn().mockResolvedValue(makeContractVersion()),
      update: vi.fn(),
      countExpiringBefore: vi.fn(),
    } as unknown as IContractVersionRepository

    handler = new CreateContractVersionHandler(employmentRepo, contractVersionRepo)
  })

  it('creates first contract for employment with status active', async () => {
    const command = new CreateContractVersionCommand(
      TENANT_ID,
      EMPLOYMENT_ID,
      'indefinite',
      new Date('2026-01-01'),
      CREATED_BY,
    )

    const result = await handler.execute(command)

    expect(employmentRepo.findById).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
    expect(contractVersionRepo.findActiveByEmploymentId).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
    )
    expect(contractVersionRepo.update).not.toHaveBeenCalled()
    expect(contractVersionRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        employmentId: EMPLOYMENT_ID,
        contractType: 'indefinite',
        status: 'active',
        createdBy: CREATED_BY,
      }),
    )
    expect(result).toMatchObject({ id: CONTRACT_ID, status: 'active' })
  })

  it('supersedes existing active contract when creating a new one', async () => {
    const existingContract = makeContractVersion({ id: 'existing-contract-id', status: 'active' })
    vi.mocked(contractVersionRepo.findActiveByEmploymentId).mockResolvedValue(existingContract)

    const command = new CreateContractVersionCommand(
      TENANT_ID,
      EMPLOYMENT_ID,
      'fixed_term',
      new Date('2026-06-01'),
      CREATED_BY,
      new Date('2027-05-31'),
    )

    await handler.execute(command)

    expect(contractVersionRepo.update).toHaveBeenCalledWith(existingContract.id, TENANT_ID, {
      status: 'superseded',
    })
    expect(contractVersionRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        contractType: 'fixed_term',
        status: 'active',
      }),
    )
  })

  it('throws EmploymentNotFoundException when employment does not exist', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    const command = new CreateContractVersionCommand(
      TENANT_ID,
      EMPLOYMENT_ID,
      'indefinite',
      new Date('2026-01-01'),
      CREATED_BY,
    )

    await expect(handler.execute(command)).rejects.toThrow(EmploymentNotFoundException)

    expect(contractVersionRepo.insert).not.toHaveBeenCalled()
  })
})
