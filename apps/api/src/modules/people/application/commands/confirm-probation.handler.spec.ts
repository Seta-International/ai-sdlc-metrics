import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { ProbationConfirmedEvent } from '@future/event-contracts'
import {
  ProbationRecordNotFoundException,
  InvalidProbationStatusException,
} from '../../domain/exceptions/people.exceptions'
import type { IProbationRecordRepository } from '../../domain/repositories/probation-record.repository'
import type { ProbationRecord } from '../../domain/entities/probation-record.entity'
import { ConfirmProbationCommand } from './confirm-probation.command'
import { ConfirmProbationHandler } from './confirm-probation.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000010'
const RECORD_ID = '01900000-0000-7000-8000-000000000020'
const CONFIRMED_BY = '01900000-0000-7000-8000-000000000005'

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

describe('ConfirmProbationHandler', () => {
  let handler: ConfirmProbationHandler
  let probationRecordRepo: IProbationRecordRepository
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    probationRecordRepo = {
      findByEmploymentId: vi.fn().mockResolvedValue(makeRecord()),
      findActiveByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    } as unknown as IProbationRecordRepository

    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }

    handler = new ConfirmProbationHandler(probationRecordRepo, eventBus as unknown as EventBus)
  })

  it('confirms an active probation record', async () => {
    await handler.execute(
      new ConfirmProbationCommand(TENANT_ID, EMPLOYMENT_ID, CONFIRMED_BY, 'Great performance'),
    )

    expect(probationRecordRepo.update).toHaveBeenCalledWith(
      RECORD_ID,
      TENANT_ID,
      expect.objectContaining({
        status: 'passed',
        outcomeBy: CONFIRMED_BY,
        outcomeNote: 'Great performance',
      }),
    )
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(ProbationConfirmedEvent))
  })

  it('confirms an extended probation record', async () => {
    vi.mocked(probationRecordRepo.findByEmploymentId).mockResolvedValue(
      makeRecord({ status: 'extended' }),
    )

    await handler.execute(new ConfirmProbationCommand(TENANT_ID, EMPLOYMENT_ID, CONFIRMED_BY))

    expect(probationRecordRepo.update).toHaveBeenCalledWith(
      RECORD_ID,
      TENANT_ID,
      expect.objectContaining({ status: 'passed' }),
    )
  })

  it('throws ProbationRecordNotFoundException when no record exists', async () => {
    vi.mocked(probationRecordRepo.findByEmploymentId).mockResolvedValue(null)

    await expect(
      handler.execute(new ConfirmProbationCommand(TENANT_ID, EMPLOYMENT_ID, CONFIRMED_BY)),
    ).rejects.toThrow(ProbationRecordNotFoundException)

    expect(probationRecordRepo.update).not.toHaveBeenCalled()
  })

  it('throws InvalidProbationStatusException when status is passed', async () => {
    vi.mocked(probationRecordRepo.findByEmploymentId).mockResolvedValue(
      makeRecord({ status: 'passed' }),
    )

    await expect(
      handler.execute(new ConfirmProbationCommand(TENANT_ID, EMPLOYMENT_ID, CONFIRMED_BY)),
    ).rejects.toThrow(InvalidProbationStatusException)

    expect(probationRecordRepo.update).not.toHaveBeenCalled()
  })

  it('throws InvalidProbationStatusException when status is failed', async () => {
    vi.mocked(probationRecordRepo.findByEmploymentId).mockResolvedValue(
      makeRecord({ status: 'failed' }),
    )

    await expect(
      handler.execute(new ConfirmProbationCommand(TENANT_ID, EMPLOYMENT_ID, CONFIRMED_BY)),
    ).rejects.toThrow(InvalidProbationStatusException)
  })
})
