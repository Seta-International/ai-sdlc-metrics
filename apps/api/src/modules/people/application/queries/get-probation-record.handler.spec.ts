import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IProbationRecordRepository } from '../../domain/repositories/probation-record.repository'
import type { ProbationRecord } from '../../domain/entities/probation-record.entity'
import { GetProbationRecordQuery } from './get-probation-record.query'
import { GetProbationRecordHandler } from './get-probation-record.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000010'

function makeProbationRecord(overrides: Partial<ProbationRecord> = {}): ProbationRecord {
  return {
    id: '01900000-0000-7000-8000-000000000020',
    tenantId: TENANT_ID,
    employmentId: EMPLOYMENT_ID,
    startDate: new Date('2026-01-01'),
    originalEndDate: new Date('2026-04-01'),
    currentEndDate: new Date('2026-04-01'),
    extensionCount: 0,
    status: 'active',
    outcomeDate: null,
    outcomeBy: null,
    outcomeNote: null,
    probationPolicyId: '01900000-0000-7000-8000-000000000030',
    salaryPercentage: '100',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('GetProbationRecordHandler', () => {
  let handler: GetProbationRecordHandler
  let probationRecordRepo: IProbationRecordRepository

  beforeEach(() => {
    probationRecordRepo = {
      findByEmploymentId: vi.fn().mockResolvedValue(makeProbationRecord()),
      findActiveByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    } as unknown as IProbationRecordRepository

    handler = new GetProbationRecordHandler(probationRecordRepo)
  })

  it('returns probation record for the given employment', async () => {
    const result = await handler.execute(new GetProbationRecordQuery(TENANT_ID, EMPLOYMENT_ID))

    expect(probationRecordRepo.findByEmploymentId).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
    expect(result).toMatchObject({ employmentId: EMPLOYMENT_ID, status: 'active' })
  })

  it('returns null when no probation record exists', async () => {
    vi.mocked(probationRecordRepo.findByEmploymentId).mockResolvedValue(null)

    const result = await handler.execute(new GetProbationRecordQuery(TENANT_ID, EMPLOYMENT_ID))

    expect(result).toBeNull()
  })
})
