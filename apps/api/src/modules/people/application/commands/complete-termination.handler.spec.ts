import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EmploymentNotFoundException,
  InvalidEmploymentStatusTransitionException,
} from '../../domain/exceptions/people.exceptions'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { Employment } from '../../domain/entities/employment.entity'
import type { JobHistoryRecorderService } from '../services/job-history-recorder.service'
import { CompleteTerminationCommand } from './complete-termination.command'
import { CompleteTerminationHandler } from './complete-termination.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000010'
const INITIATED_BY = '01900000-0000-7000-8000-000000000005'
const TERMINATION_DATE = new Date('2026-06-30')

function makeEmployment(overrides: Partial<Employment> = {}): Employment {
  return {
    id: EMPLOYMENT_ID,
    tenantId: TENANT_ID,
    personProfileId: '01900000-0000-7000-8000-000000000020',
    employeeCode: null,
    companyEmail: null,
    workerType: 'employee',
    employmentType: 'permanent',
    countryCode: 'VN',
    employmentStatus: 'notice_period',
    terminationDate: null,
    terminationReason: 'voluntary_resignation',
    hireDate: new Date('2026-01-01'),
    originalHireDate: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('CompleteTerminationHandler', () => {
  let handler: CompleteTerminationHandler
  let employmentRepo: IEmploymentRepository
  let recorder: { recordTermination: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    employmentRepo = {
      findById: vi.fn().mockResolvedValue(makeEmployment()),
      findByPersonProfileId: vi.fn(),
      findActiveByActorId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      update: vi.fn(),
      listByTenant: vi.fn(),
      countByTenant: vi.fn(),
    } as unknown as IEmploymentRepository

    recorder = { recordTermination: vi.fn().mockResolvedValue(undefined) }

    handler = new CompleteTerminationHandler(
      employmentRepo,
      recorder as unknown as JobHistoryRecorderService,
    )
  })

  it('completes termination for notice_period employment using stored reason', async () => {
    await handler.execute(
      new CompleteTerminationCommand(TENANT_ID, EMPLOYMENT_ID, TERMINATION_DATE, INITIATED_BY),
    )

    expect(employmentRepo.updateStatus).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      'terminated',
      TERMINATION_DATE,
      'voluntary_resignation',
    )
  })

  it('completes termination with null reason if none stored', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(
      makeEmployment({ terminationReason: null }),
    )

    await handler.execute(
      new CompleteTerminationCommand(TENANT_ID, EMPLOYMENT_ID, TERMINATION_DATE, INITIATED_BY),
    )

    expect(employmentRepo.updateStatus).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      'terminated',
      TERMINATION_DATE,
      null,
    )
  })

  it('throws EmploymentNotFoundException when employment does not exist', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new CompleteTerminationCommand(TENANT_ID, EMPLOYMENT_ID, TERMINATION_DATE, INITIATED_BY),
      ),
    ).rejects.toThrow(EmploymentNotFoundException)

    expect(employmentRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('throws InvalidEmploymentStatusTransitionException when not in notice_period (active)', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(
      makeEmployment({ employmentStatus: 'active' }),
    )

    await expect(
      handler.execute(
        new CompleteTerminationCommand(TENANT_ID, EMPLOYMENT_ID, TERMINATION_DATE, INITIATED_BY),
      ),
    ).rejects.toThrow(InvalidEmploymentStatusTransitionException)

    expect(employmentRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('throws InvalidEmploymentStatusTransitionException when already terminated', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(
      makeEmployment({ employmentStatus: 'terminated' }),
    )

    await expect(
      handler.execute(
        new CompleteTerminationCommand(TENANT_ID, EMPLOYMENT_ID, TERMINATION_DATE, INITIATED_BY),
      ),
    ).rejects.toThrow(InvalidEmploymentStatusTransitionException)
  })

  it('records termination history entry after completing', async () => {
    const employment = makeEmployment()
    vi.mocked(employmentRepo.findById).mockResolvedValue(employment)

    await handler.execute(
      new CompleteTerminationCommand(TENANT_ID, EMPLOYMENT_ID, TERMINATION_DATE, INITIATED_BY),
    )

    expect(recorder.recordTermination).toHaveBeenCalledWith(
      employment.personProfileId,
      TENANT_ID,
      TERMINATION_DATE,
    )
  })

  it('does not record termination history when employment not found', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new CompleteTerminationCommand(TENANT_ID, EMPLOYMENT_ID, TERMINATION_DATE, INITIATED_BY),
      ),
    ).rejects.toThrow(EmploymentNotFoundException)

    expect(recorder.recordTermination).not.toHaveBeenCalled()
  })

  it('does not record termination history when status is invalid', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(
      makeEmployment({ employmentStatus: 'active' }),
    )

    await expect(
      handler.execute(
        new CompleteTerminationCommand(TENANT_ID, EMPLOYMENT_ID, TERMINATION_DATE, INITIATED_BY),
      ),
    ).rejects.toThrow(InvalidEmploymentStatusTransitionException)

    expect(recorder.recordTermination).not.toHaveBeenCalled()
  })
})
