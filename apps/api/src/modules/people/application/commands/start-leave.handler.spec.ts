import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { EmployeeOnLeaveEvent } from '@future/event-contracts'
import {
  EmploymentNotFoundException,
  InvalidEmploymentStatusTransitionException,
} from '../../domain/exceptions/people.exceptions'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { Employment } from '../../domain/entities/employment.entity'
import { StartLeaveCommand } from './start-leave.command'
import { StartLeaveHandler } from './start-leave.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000010'
const INITIATED_BY = '01900000-0000-7000-8000-000000000005'

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

describe('StartLeaveHandler', () => {
  let handler: StartLeaveHandler
  let employmentRepo: IEmploymentRepository
  let eventBus: { publish: ReturnType<typeof vi.fn> }

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

    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }

    handler = new StartLeaveHandler(employmentRepo, eventBus as unknown as EventBus)
  })

  it('transitions active employment to on_leave', async () => {
    await handler.execute(
      new StartLeaveCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        'annual',
        new Date('2026-06-01'),
        INITIATED_BY,
      ),
    )

    expect(employmentRepo.updateStatus).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID, 'on_leave')
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(EmployeeOnLeaveEvent))
  })

  it('throws EmploymentNotFoundException when employment does not exist', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new StartLeaveCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          'annual',
          new Date('2026-06-01'),
          INITIATED_BY,
        ),
      ),
    ).rejects.toThrow(EmploymentNotFoundException)

    expect(employmentRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('throws InvalidEmploymentStatusTransitionException when not active (pre_hire)', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(
      makeEmployment({ employmentStatus: 'pre_hire' }),
    )

    await expect(
      handler.execute(
        new StartLeaveCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          'annual',
          new Date('2026-06-01'),
          INITIATED_BY,
        ),
      ),
    ).rejects.toThrow(InvalidEmploymentStatusTransitionException)

    expect(employmentRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('throws InvalidEmploymentStatusTransitionException when already on_leave', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(
      makeEmployment({ employmentStatus: 'on_leave' }),
    )

    await expect(
      handler.execute(
        new StartLeaveCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          'annual',
          new Date('2026-06-01'),
          INITIATED_BY,
        ),
      ),
    ).rejects.toThrow(InvalidEmploymentStatusTransitionException)
  })
})
