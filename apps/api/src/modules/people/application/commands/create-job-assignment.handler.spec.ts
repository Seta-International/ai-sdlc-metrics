import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { JobAssignmentChangedEvent } from '@future/event-contracts'
import { CreateJobAssignmentCommand } from './create-job-assignment.command'
import { CreateJobAssignmentHandler } from './create-job-assignment.handler'
import {
  EmploymentNotFoundException,
  JobProfileNotFoundException,
} from '../../domain/exceptions/people.exceptions'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IJobProfileRepository } from '../../domain/repositories/job-profile.repository'
import type { IJobAssignmentRepository } from '../../domain/repositories/job-assignment.repository'
import type { Employment } from '../../domain/entities/employment.entity'
import type { JobProfile } from '../../domain/entities/job-profile.entity'
import type { JobAssignment } from '../../domain/entities/job-assignment.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000020'
const JOB_PROFILE_ID = '01900000-0000-7000-8000-000000000030'
const ASSIGNMENT_ID = '01900000-0000-7000-8000-000000000040'
const PREV_ASSIGNMENT_ID = '01900000-0000-7000-8000-000000000041'
const CREATED_BY = '01900000-0000-7000-8000-000000000005'

function makeEmployment(): Employment {
  return {
    id: EMPLOYMENT_ID,
    tenantId: TENANT_ID,
    personProfileId: '01900000-0000-7000-8000-000000000010',
    employeeCode: null,
    companyEmail: null,
    workerType: 'employee',
    employmentType: 'permanent',
    countryCode: 'VN',
    employmentStatus: 'pre_hire',
    terminationDate: null,
    terminationReason: null,
    hireDate: new Date('2026-02-01'),
    originalHireDate: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  }
}

function makeJobProfile(): JobProfile {
  return {
    id: JOB_PROFILE_ID,
    tenantId: TENANT_ID,
    jobFamilyId: '01900000-0000-7000-8000-000000000050',
    title: 'Software Engineer',
    level: 'L3',
    description: null,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  }
}

function makeAssignment(overrides: Partial<JobAssignment> = {}): JobAssignment {
  return {
    id: ASSIGNMENT_ID,
    tenantId: TENANT_ID,
    employmentId: EMPLOYMENT_ID,
    jobProfileId: JOB_PROFILE_ID,
    effectiveFrom: new Date('2026-02-01'),
    effectiveTo: null,
    departmentId: null,
    locationId: null,
    costCenterId: null,
    workArrangement: 'onsite',
    managerId: null,
    eventType: 'hire',
    reason: null,
    createdBy: CREATED_BY,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('CreateJobAssignmentHandler', () => {
  let handler: CreateJobAssignmentHandler
  let employmentRepo: IEmploymentRepository
  let jobProfileRepo: IJobProfileRepository
  let jobAssignmentRepo: IJobAssignmentRepository
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    employmentRepo = {
      findById: vi.fn().mockResolvedValue(makeEmployment()),
      findByPersonProfileId: vi.fn(),
      findActiveByActorId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
      countByTenant: vi.fn(),
    } as unknown as IEmploymentRepository

    jobProfileRepo = {
      findById: vi.fn().mockResolvedValue(makeJobProfile()),
      listByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      countByJobFamilyId: vi.fn(),
    } as unknown as IJobProfileRepository

    jobAssignmentRepo = {
      findById: vi.fn(),
      findCurrent: vi.fn().mockResolvedValue(null),
      findAsOf: vi.fn(),
      findHistory: vi.fn(),
      insert: vi.fn().mockResolvedValue(makeAssignment()),
      closeAssignment: vi.fn(),
      delete: vi.fn(),
    } as unknown as IJobAssignmentRepository

    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }

    handler = new CreateJobAssignmentHandler(
      employmentRepo,
      jobProfileRepo,
      jobAssignmentRepo,
      eventBus as unknown as EventBus,
    )
  })

  it('creates first assignment (hire) without closing previous', async () => {
    const effectiveFrom = new Date('2026-02-01')

    const result = await handler.execute(
      new CreateJobAssignmentCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        JOB_PROFILE_ID,
        effectiveFrom,
        'hire',
        CREATED_BY,
      ),
    )

    expect(jobAssignmentRepo.closeAssignment).not.toHaveBeenCalled()
    expect(jobAssignmentRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        employmentId: EMPLOYMENT_ID,
        jobProfileId: JOB_PROFILE_ID,
        effectiveFrom,
        effectiveTo: null,
        eventType: 'hire',
      }),
    )
    expect(result.eventType).toBe('hire')
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(JobAssignmentChangedEvent))
  })

  it('creates promotion assignment and closes previous with effectiveTo = day before', async () => {
    const prevAssignment = makeAssignment({
      id: PREV_ASSIGNMENT_ID,
      effectiveFrom: new Date('2026-02-01'),
      eventType: 'hire',
    })
    vi.mocked(jobAssignmentRepo.findCurrent).mockResolvedValue(prevAssignment)

    const effectiveFrom = new Date('2026-06-01')
    const expectedEffectiveTo = new Date('2026-05-31')

    vi.mocked(jobAssignmentRepo.insert).mockResolvedValue(
      makeAssignment({ eventType: 'promotion', effectiveFrom }),
    )

    await handler.execute(
      new CreateJobAssignmentCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        JOB_PROFILE_ID,
        effectiveFrom,
        'promotion',
        CREATED_BY,
      ),
    )

    expect(jobAssignmentRepo.closeAssignment).toHaveBeenCalledWith(
      PREV_ASSIGNMENT_ID,
      TENANT_ID,
      expectedEffectiveTo,
    )
    expect(jobAssignmentRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        effectiveFrom,
        effectiveTo: null,
        eventType: 'promotion',
      }),
    )
  })

  it('throws EmploymentNotFoundException when employment not found', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new CreateJobAssignmentCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          JOB_PROFILE_ID,
          new Date('2026-02-01'),
          'hire',
          CREATED_BY,
        ),
      ),
    ).rejects.toThrow(EmploymentNotFoundException)
  })

  it('throws JobProfileNotFoundException when job profile not found', async () => {
    vi.mocked(jobProfileRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new CreateJobAssignmentCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          JOB_PROFILE_ID,
          new Date('2026-02-01'),
          'hire',
          CREATED_BY,
        ),
      ),
    ).rejects.toThrow(JobProfileNotFoundException)
  })
})
