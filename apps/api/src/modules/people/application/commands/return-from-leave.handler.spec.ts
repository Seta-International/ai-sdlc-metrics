import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EmploymentNotFoundException,
  InvalidEmploymentStatusTransitionException,
} from '../../domain/exceptions/people.exceptions'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { Employment } from '../../domain/entities/employment.entity'
import { ReturnFromLeaveCommand } from './return-from-leave.command'
import { ReturnFromLeaveHandler } from './return-from-leave.handler'

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
    employmentStatus: 'on_leave',
    terminationDate: null,
    terminationReason: null,
    hireDate: new Date('2026-01-01'),
    originalHireDate: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('ReturnFromLeaveHandler', () => {
  let handler: ReturnFromLeaveHandler
  let employmentRepo: IEmploymentRepository

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

    handler = new ReturnFromLeaveHandler(employmentRepo)
  })

  it('transitions on_leave employment back to active', async () => {
    await handler.execute(
      new ReturnFromLeaveCommand(TENANT_ID, EMPLOYMENT_ID, new Date('2026-05-15'), INITIATED_BY),
    )

    expect(employmentRepo.updateStatus).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID, 'active')
  })

  it('throws EmploymentNotFoundException when employment does not exist', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new ReturnFromLeaveCommand(TENANT_ID, EMPLOYMENT_ID, new Date('2026-05-15'), INITIATED_BY),
      ),
    ).rejects.toThrow(EmploymentNotFoundException)

    expect(employmentRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('throws InvalidEmploymentStatusTransitionException when not on_leave (pre_hire)', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(
      makeEmployment({ employmentStatus: 'pre_hire' }),
    )

    await expect(
      handler.execute(
        new ReturnFromLeaveCommand(TENANT_ID, EMPLOYMENT_ID, new Date('2026-05-15'), INITIATED_BY),
      ),
    ).rejects.toThrow(InvalidEmploymentStatusTransitionException)

    expect(employmentRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('throws InvalidEmploymentStatusTransitionException when already active', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(
      makeEmployment({ employmentStatus: 'active' }),
    )

    await expect(
      handler.execute(
        new ReturnFromLeaveCommand(TENANT_ID, EMPLOYMENT_ID, new Date('2026-05-15'), INITIATED_BY),
      ),
    ).rejects.toThrow(InvalidEmploymentStatusTransitionException)
  })
})
