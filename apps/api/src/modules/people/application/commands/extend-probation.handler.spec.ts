import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ProbationRecordNotFoundException,
  InvalidProbationStatusException,
  ProbationExtensionNotAllowedException,
} from '../../domain/exceptions/people.exceptions'
import type { IProbationPolicyRepository } from '../../domain/repositories/probation-policy.repository'
import type { IProbationRecordRepository } from '../../domain/repositories/probation-record.repository'
import type { ProbationPolicy } from '../../domain/entities/probation-policy.entity'
import type { ProbationRecord } from '../../domain/entities/probation-record.entity'
import { ExtendProbationCommand } from './extend-probation.command'
import { ExtendProbationHandler } from './extend-probation.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000010'
const RECORD_ID = '01900000-0000-7000-8000-000000000020'
const POLICY_ID = '01900000-0000-7000-8000-000000000099'
const EXTENDED_BY = '01900000-0000-7000-8000-000000000005'

const START_DATE = new Date('2026-01-01')
const CURRENT_END = new Date('2026-03-02')
const NEW_END = new Date('2026-04-01')

function makeRecord(overrides: Partial<ProbationRecord> = {}): ProbationRecord {
  return {
    id: RECORD_ID,
    tenantId: TENANT_ID,
    employmentId: EMPLOYMENT_ID,
    startDate: START_DATE,
    originalEndDate: CURRENT_END,
    currentEndDate: CURRENT_END,
    extensionCount: 0,
    status: 'active',
    outcomeDate: null,
    outcomeBy: null,
    outcomeNote: null,
    probationPolicyId: POLICY_ID,
    salaryPercentage: 85,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

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

describe('ExtendProbationHandler', () => {
  let handler: ExtendProbationHandler
  let probationPolicyRepo: IProbationPolicyRepository
  let probationRecordRepo: IProbationRecordRepository

  beforeEach(() => {
    probationPolicyRepo = {
      findById: vi.fn().mockResolvedValue(makePolicy()),
      findByCountryAndLevel: vi.fn(),
      listByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    } as unknown as IProbationPolicyRepository

    probationRecordRepo = {
      findByEmploymentId: vi.fn().mockResolvedValue(makeRecord()),
      findActiveByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    } as unknown as IProbationRecordRepository

    handler = new ExtendProbationHandler(probationPolicyRepo, probationRecordRepo)
  })

  it('extends an active probation record successfully', async () => {
    await handler.execute(
      new ExtendProbationCommand(TENANT_ID, EMPLOYMENT_ID, NEW_END, EXTENDED_BY, 'Needs more time'),
    )

    expect(probationRecordRepo.update).toHaveBeenCalledWith(
      RECORD_ID,
      TENANT_ID,
      expect.objectContaining({
        currentEndDate: NEW_END,
        extensionCount: 1,
        status: 'extended',
      }),
    )
  })

  it('extends an already-extended probation if under max', async () => {
    vi.mocked(probationRecordRepo.findByEmploymentId).mockResolvedValue(
      makeRecord({ status: 'extended', extensionCount: 0 }),
    )
    vi.mocked(probationPolicyRepo.findById).mockResolvedValue(makePolicy({ maxExtensions: 2 }))

    await handler.execute(
      new ExtendProbationCommand(TENANT_ID, EMPLOYMENT_ID, NEW_END, EXTENDED_BY),
    )

    expect(probationRecordRepo.update).toHaveBeenCalledWith(
      RECORD_ID,
      TENANT_ID,
      expect.objectContaining({ status: 'extended', extensionCount: 1 }),
    )
  })

  it('throws ProbationRecordNotFoundException when no record exists', async () => {
    vi.mocked(probationRecordRepo.findByEmploymentId).mockResolvedValue(null)

    await expect(
      handler.execute(new ExtendProbationCommand(TENANT_ID, EMPLOYMENT_ID, NEW_END, EXTENDED_BY)),
    ).rejects.toThrow(ProbationRecordNotFoundException)
  })

  it('throws InvalidProbationStatusException when status is passed', async () => {
    vi.mocked(probationRecordRepo.findByEmploymentId).mockResolvedValue(
      makeRecord({ status: 'passed' }),
    )

    await expect(
      handler.execute(new ExtendProbationCommand(TENANT_ID, EMPLOYMENT_ID, NEW_END, EXTENDED_BY)),
    ).rejects.toThrow(InvalidProbationStatusException)

    expect(probationRecordRepo.update).not.toHaveBeenCalled()
  })

  it('throws ProbationExtensionNotAllowedException when policy disallows extensions', async () => {
    vi.mocked(probationPolicyRepo.findById).mockResolvedValue(makePolicy({ allowExtension: false }))

    await expect(
      handler.execute(new ExtendProbationCommand(TENANT_ID, EMPLOYMENT_ID, NEW_END, EXTENDED_BY)),
    ).rejects.toThrow(ProbationExtensionNotAllowedException)

    expect(probationRecordRepo.update).not.toHaveBeenCalled()
  })

  it('throws ProbationExtensionNotAllowedException when max extensions reached', async () => {
    vi.mocked(probationRecordRepo.findByEmploymentId).mockResolvedValue(
      makeRecord({ extensionCount: 1 }),
    )

    await expect(
      handler.execute(new ExtendProbationCommand(TENANT_ID, EMPLOYMENT_ID, NEW_END, EXTENDED_BY)),
    ).rejects.toThrow(ProbationExtensionNotAllowedException)
  })

  it('throws ProbationExtensionNotAllowedException when new end date exceeds max duration', async () => {
    // maxDurationDays=180, startDate=2026-01-01, so max=2026-07-01
    const tooLate = new Date('2026-08-01')

    await expect(
      handler.execute(new ExtendProbationCommand(TENANT_ID, EMPLOYMENT_ID, tooLate, EXTENDED_BY)),
    ).rejects.toThrow(ProbationExtensionNotAllowedException)
  })
})
