import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ProbationRecordNotFoundException,
  InvalidProbationStatusException,
} from '../../domain/exceptions/people.exceptions'
import type { IProbationRecordRepository } from '../../domain/repositories/probation-record.repository'
import type { ProbationRecord } from '../../domain/entities/probation-record.entity'
import { FailProbationCommand } from './fail-probation.command'
import { FailProbationHandler } from './fail-probation.handler'
import { TerminateEmploymentCommand } from './terminate-employment.command'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000010'
const RECORD_ID = '01900000-0000-7000-8000-000000000020'
const FAILED_BY = '01900000-0000-7000-8000-000000000005'

function makeRecord(overrides: Partial<ProbationRecord> = {}): ProbationRecord {
  return {
    id: RECORD_ID,
    tenantId: TENANT_ID,
    employmentId: EMPLOYMENT_ID,
    startDate: new Date('2026-01-01'),
    originalEndDate: new Date('2026-03-02'),
    currentEndDate: new Date('2026-03-02'),
    extensionCount: 0,
    status: 'active',
    outcomeDate: null,
    outcomeBy: null,
    outcomeNote: null,
    probationPolicyId: '01900000-0000-7000-8000-000000000099',
    salaryPercentage: 85,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('FailProbationHandler', () => {
  let handler: FailProbationHandler
  let probationRecordRepo: IProbationRecordRepository
  let commandBus: { execute: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    probationRecordRepo = {
      findByEmploymentId: vi.fn().mockResolvedValue(makeRecord()),
      findActiveByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    } as unknown as IProbationRecordRepository

    commandBus = { execute: vi.fn().mockResolvedValue(undefined) }

    handler = new FailProbationHandler(probationRecordRepo, commandBus as never)
  })

  it('fails an active probation and triggers termination', async () => {
    await handler.execute(
      new FailProbationCommand(TENANT_ID, EMPLOYMENT_ID, FAILED_BY, 'Did not meet standards'),
    )

    expect(probationRecordRepo.update).toHaveBeenCalledWith(
      RECORD_ID,
      TENANT_ID,
      expect.objectContaining({
        status: 'failed',
        outcomeBy: FAILED_BY,
        outcomeNote: 'Did not meet standards',
      }),
    )

    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(TerminateEmploymentCommand))

    const terminateCmd = commandBus.execute.mock.calls[0][0] as TerminateEmploymentCommand
    expect(terminateCmd.tenantId).toBe(TENANT_ID)
    expect(terminateCmd.employmentId).toBe(EMPLOYMENT_ID)
    expect(terminateCmd.terminationReason).toBe('failed_probation')
  })

  it('fails an extended probation and triggers termination', async () => {
    vi.mocked(probationRecordRepo.findByEmploymentId).mockResolvedValue(
      makeRecord({ status: 'extended' }),
    )

    await handler.execute(new FailProbationCommand(TENANT_ID, EMPLOYMENT_ID, FAILED_BY))

    expect(probationRecordRepo.update).toHaveBeenCalledWith(
      RECORD_ID,
      TENANT_ID,
      expect.objectContaining({ status: 'failed' }),
    )
    expect(commandBus.execute).toHaveBeenCalled()
  })

  it('throws ProbationRecordNotFoundException when no record exists', async () => {
    vi.mocked(probationRecordRepo.findByEmploymentId).mockResolvedValue(null)

    await expect(
      handler.execute(new FailProbationCommand(TENANT_ID, EMPLOYMENT_ID, FAILED_BY)),
    ).rejects.toThrow(ProbationRecordNotFoundException)

    expect(probationRecordRepo.update).not.toHaveBeenCalled()
    expect(commandBus.execute).not.toHaveBeenCalled()
  })

  it('throws InvalidProbationStatusException when status is passed', async () => {
    vi.mocked(probationRecordRepo.findByEmploymentId).mockResolvedValue(
      makeRecord({ status: 'passed' }),
    )

    await expect(
      handler.execute(new FailProbationCommand(TENANT_ID, EMPLOYMENT_ID, FAILED_BY)),
    ).rejects.toThrow(InvalidProbationStatusException)

    expect(probationRecordRepo.update).not.toHaveBeenCalled()
    expect(commandBus.execute).not.toHaveBeenCalled()
  })

  it('throws InvalidProbationStatusException when status is not_applicable', async () => {
    vi.mocked(probationRecordRepo.findByEmploymentId).mockResolvedValue(
      makeRecord({ status: 'not_applicable' }),
    )

    await expect(
      handler.execute(new FailProbationCommand(TENANT_ID, EMPLOYMENT_ID, FAILED_BY)),
    ).rejects.toThrow(InvalidProbationStatusException)
  })
})
