import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IProbationPolicyRepository } from '../../domain/repositories/probation-policy.repository'
import type { IProbationRecordRepository } from '../../domain/repositories/probation-record.repository'
import type { ProbationPolicy } from '../../domain/entities/probation-policy.entity'
import { SetProbationCommand } from './set-probation.command'
import { SetProbationHandler } from './set-probation.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000010'
const INITIATED_BY = '01900000-0000-7000-8000-000000000005'
const POLICY_ID = '01900000-0000-7000-8000-000000000099'

const START_DATE = new Date('2026-01-01')

function makePolicy(overrides: Partial<ProbationPolicy> = {}): ProbationPolicy {
  return {
    id: POLICY_ID,
    tenantId: TENANT_ID,
    countryCode: 'VN',
    jobLevelCategory: 'professional',
    defaultDurationDays: 60,
    maxDurationDays: 180,
    allowExtension: true,
    maxExtensions: 1,
    extensionDays: 30,
    minSalaryPercentage: 85,
    autoConfirm: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('SetProbationHandler', () => {
  let handler: SetProbationHandler
  let probationPolicyRepo: IProbationPolicyRepository
  let probationRecordRepo: IProbationRecordRepository

  beforeEach(() => {
    probationPolicyRepo = {
      findByCountryAndLevel: vi.fn().mockResolvedValue(makePolicy()),
      listByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    } as unknown as IProbationPolicyRepository

    probationRecordRepo = {
      findByEmploymentId: vi.fn(),
      findActiveByTenant: vi.fn(),
      insert: vi.fn().mockResolvedValue({}),
      update: vi.fn(),
    } as unknown as IProbationRecordRepository

    handler = new SetProbationHandler(probationPolicyRepo, probationRecordRepo)
  })

  it('creates active probation record when policy is found', async () => {
    await handler.execute(
      new SetProbationCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        'VN',
        'professional',
        START_DATE,
        INITIATED_BY,
      ),
    )

    const expectedEndDate = new Date('2026-03-02') // 60 days after 2026-01-01
    expect(probationRecordRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        employmentId: EMPLOYMENT_ID,
        startDate: START_DATE,
        originalEndDate: expectedEndDate,
        currentEndDate: expectedEndDate,
        extensionCount: 0,
        status: 'active',
        outcomeDate: null,
        outcomeBy: null,
        probationPolicyId: POLICY_ID,
        salaryPercentage: 85,
      }),
    )
  })

  it('creates not_applicable record when no policy is found', async () => {
    vi.mocked(probationPolicyRepo.findByCountryAndLevel).mockResolvedValue(null)

    await handler.execute(
      new SetProbationCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        'SG',
        'technical',
        START_DATE,
        INITIATED_BY,
      ),
    )

    expect(probationRecordRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        employmentId: EMPLOYMENT_ID,
        status: 'not_applicable',
        salaryPercentage: 100,
      }),
    )
  })
})
