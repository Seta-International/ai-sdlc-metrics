import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EmploymentTerminatedEvent } from '@future/event-contracts'
import {
  EmploymentNotFoundException,
  InvalidEmploymentStatusTransitionException,
} from '../../domain/exceptions/people.exceptions'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IOffboardingCaseRepository } from '../../domain/repositories/offboarding-case.repository'
import type { Employment } from '../../domain/entities/employment.entity'
import { TerminateEmploymentCommand } from './terminate-employment.command'
import { TerminateEmploymentHandler } from './terminate-employment.handler'

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

describe('TerminateEmploymentHandler', () => {
  let handler: TerminateEmploymentHandler
  let employmentRepo: IEmploymentRepository
  let offboardingCaseRepo: IOffboardingCaseRepository
  let offboardingTemplateSelector: { selectTemplate: ReturnType<typeof vi.fn> }
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

    offboardingCaseRepo = {
      findById: vi.fn(),
      findActiveByEmploymentId: vi.fn(),
      insert: vi.fn().mockResolvedValue({}),
      updateStatus: vi.fn(),
      update: vi.fn(),
      insertTask: vi.fn(),
      getRequiredTasks: vi.fn(),
      updateTaskStatus: vi.fn(),
      findTaskById: vi.fn(),
    } as unknown as IOffboardingCaseRepository

    offboardingTemplateSelector = { selectTemplate: vi.fn().mockResolvedValue(null) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }

    handler = new TerminateEmploymentHandler(
      employmentRepo,
      offboardingCaseRepo,
      offboardingTemplateSelector as any,
      eventBus as any,
    )
  })

  it('terminates active employment with reason and date', async () => {
    await handler.execute(
      new TerminateEmploymentCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        'voluntary_resignation',
        TERMINATION_DATE,
        INITIATED_BY,
      ),
    )

    expect(employmentRepo.updateStatus).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      'terminated',
      TERMINATION_DATE,
      'voluntary_resignation',
    )
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(EmploymentTerminatedEvent))
  })

  it('terminates suspended employment (investigation concluded)', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(
      makeEmployment({ employmentStatus: 'suspended' }),
    )

    await handler.execute(
      new TerminateEmploymentCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        'involuntary_misconduct',
        TERMINATION_DATE,
        INITIATED_BY,
      ),
    )

    expect(employmentRepo.updateStatus).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      'terminated',
      TERMINATION_DATE,
      'involuntary_misconduct',
    )
  })

  it('terminates on_leave employment (e.g. company closure)', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(
      makeEmployment({ employmentStatus: 'on_leave' }),
    )

    await handler.execute(
      new TerminateEmploymentCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        'company_closure',
        TERMINATION_DATE,
        INITIATED_BY,
      ),
    )

    expect(employmentRepo.updateStatus).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      'terminated',
      TERMINATION_DATE,
      'company_closure',
    )
  })

  it('terminates pre_hire employment (no_show)', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(
      makeEmployment({ employmentStatus: 'pre_hire' }),
    )

    await handler.execute(
      new TerminateEmploymentCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        'no_show',
        TERMINATION_DATE,
        INITIATED_BY,
      ),
    )

    expect(employmentRepo.updateStatus).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      'terminated',
      TERMINATION_DATE,
      'no_show',
    )
  })

  it('throws EmploymentNotFoundException when employment does not exist', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new TerminateEmploymentCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          'voluntary_resignation',
          TERMINATION_DATE,
          INITIATED_BY,
        ),
      ),
    ).rejects.toThrow(EmploymentNotFoundException)

    expect(employmentRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('throws InvalidEmploymentStatusTransitionException when already terminated', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(
      makeEmployment({ employmentStatus: 'terminated' }),
    )

    await expect(
      handler.execute(
        new TerminateEmploymentCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          'voluntary_resignation',
          TERMINATION_DATE,
          INITIATED_BY,
        ),
      ),
    ).rejects.toThrow(InvalidEmploymentStatusTransitionException)

    expect(employmentRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('auto-creates offboarding case when template is found', async () => {
    const template = { id: 'template-001', name: 'VN Resignation Offboarding' }
    offboardingTemplateSelector.selectTemplate.mockResolvedValue(template)

    await handler.execute(
      new TerminateEmploymentCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        'voluntary_resignation',
        TERMINATION_DATE,
        INITIATED_BY,
      ),
    )

    expect(offboardingTemplateSelector.selectTemplate).toHaveBeenCalledWith(
      TENANT_ID,
      'VN',
      'voluntary_resignation',
    )
    expect(offboardingCaseRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        employmentId: EMPLOYMENT_ID,
        templateId: template.id,
        reason: 'voluntary_resignation',
        status: 'pending',
      }),
    )
  })

  it('does not create offboarding case when no template found', async () => {
    offboardingTemplateSelector.selectTemplate.mockResolvedValue(null)

    await handler.execute(
      new TerminateEmploymentCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        'voluntary_resignation',
        TERMINATION_DATE,
        INITIATED_BY,
      ),
    )

    expect(offboardingCaseRepo.insert).not.toHaveBeenCalled()
  })
})
