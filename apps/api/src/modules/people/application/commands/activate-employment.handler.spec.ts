import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { EmploymentActivatedEvent } from '@future/event-contracts'
import {
  EmploymentNotFoundException,
  InvalidEmploymentStatusTransitionException,
} from '../../domain/exceptions/people.exceptions'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { Employment } from '../../domain/entities/employment.entity'
import { ActivateEmploymentCommand } from './activate-employment.command'
import { ActivateEmploymentHandler } from './activate-employment.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000010'
const ACTIVATED_BY = '01900000-0000-7000-8000-000000000005'

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
    employmentStatus: 'pre_hire',
    terminationDate: null,
    terminationReason: null,
    hireDate: new Date('2026-01-01'),
    originalHireDate: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('ActivateEmploymentHandler', () => {
  let handler: ActivateEmploymentHandler
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

    handler = new ActivateEmploymentHandler(employmentRepo, eventBus as unknown as EventBus)
  })

  it('activates a pre_hire employment successfully', async () => {
    await handler.execute(new ActivateEmploymentCommand(TENANT_ID, EMPLOYMENT_ID, ACTIVATED_BY))

    expect(employmentRepo.updateStatus).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID, 'active')
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(EmploymentActivatedEvent))
  })

  it('throws EmploymentNotFoundException when employment does not exist', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new ActivateEmploymentCommand(TENANT_ID, EMPLOYMENT_ID, ACTIVATED_BY)),
    ).rejects.toThrow(EmploymentNotFoundException)

    expect(employmentRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('throws InvalidEmploymentStatusTransitionException when already active', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(
      makeEmployment({ employmentStatus: 'active' }),
    )

    await expect(
      handler.execute(new ActivateEmploymentCommand(TENANT_ID, EMPLOYMENT_ID, ACTIVATED_BY)),
    ).rejects.toThrow(InvalidEmploymentStatusTransitionException)

    expect(employmentRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('throws InvalidEmploymentStatusTransitionException when terminated', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(
      makeEmployment({ employmentStatus: 'terminated' }),
    )

    await expect(
      handler.execute(new ActivateEmploymentCommand(TENANT_ID, EMPLOYMENT_ID, ACTIVATED_BY)),
    ).rejects.toThrow(InvalidEmploymentStatusTransitionException)
  })
})
