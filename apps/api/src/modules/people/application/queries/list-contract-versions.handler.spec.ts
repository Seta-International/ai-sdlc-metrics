import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IContractVersionRepository } from '../../domain/repositories/contract-version.repository'
import type { ContractVersion } from '../../domain/entities/contract-version.entity'
import { ListContractVersionsQuery } from './list-contract-versions.query'
import { ListContractVersionsHandler } from './list-contract-versions.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'

function makeContractVersion(overrides: Partial<ContractVersion> = {}): ContractVersion {
  return {
    id: '01900000-0000-7000-8000-000000000010',
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
    createdBy: '01900000-0000-7000-8000-000000000005',
    createdAt: new Date('2026-01-01'),
    signedAt: null,
    signedBy: null,
    ...overrides,
  }
}

describe('ListContractVersionsHandler', () => {
  let handler: ListContractVersionsHandler
  let contractVersionRepo: IContractVersionRepository

  beforeEach(() => {
    contractVersionRepo = {
      findById: vi.fn(),
      findByEmploymentId: vi.fn().mockResolvedValue([makeContractVersion()]),
      findActiveByEmploymentId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      countExpiringBefore: vi.fn(),
    } as unknown as IContractVersionRepository

    handler = new ListContractVersionsHandler(contractVersionRepo)
  })

  it('returns contract versions for the given employment', async () => {
    const result = await handler.execute(new ListContractVersionsQuery(TENANT_ID, EMPLOYMENT_ID))

    expect(contractVersionRepo.findByEmploymentId).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
    expect(result).toHaveLength(1)
    expect(result[0].employmentId).toBe(EMPLOYMENT_ID)
  })

  it('returns empty array when no contracts exist', async () => {
    vi.mocked(contractVersionRepo.findByEmploymentId).mockResolvedValue([])

    const result = await handler.execute(new ListContractVersionsQuery(TENANT_ID, EMPLOYMENT_ID))

    expect(result).toEqual([])
  })
})
