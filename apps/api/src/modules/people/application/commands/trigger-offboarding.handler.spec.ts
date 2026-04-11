import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { TriggerOffboardingCommand } from './trigger-offboarding.command'
import { TriggerOffboardingHandler } from './trigger-offboarding.handler'
import {
  EmploymentProfileNotFoundException,
  InvalidEmploymentStatusTransitionException,
  OffboardingCaseAlreadyActiveException,
} from '../../domain/exceptions/people.exceptions'
import { CreateDecisionCaseCommand } from '../../../kernel/application/commands/create-decision-case.command'
import type { IEmploymentProfileRepository } from '../../domain/repositories/employment-profile.repository'
import type { IOffboardingCaseRepository } from '../../domain/repositories/offboarding-case.repository'
import type {
  EmploymentProfile,
  EmploymentStatus,
} from '../../domain/entities/employment-profile.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const REQUESTER_ID = '01900000-0000-7000-8000-000000000005'
const DECISION_CASE_ID = 'dc-123'

const makeProfile = (status: EmploymentStatus): EmploymentProfile => ({
  id: PROFILE_ID,
  tenantId: TENANT_ID,
  actorId: '01900000-0000-7000-8000-000000000010',
  employeeCode: 'EMP-001',
  companyEmail: 'engineer@example.com',
  employmentStatus: status,
  employmentType: 'permanent',
  workArrangement: 'onsite',
  hireDate: new Date('2024-01-01'),
  terminationDate: null,
  jobTitle: 'Engineer',
  jobLevel: null,
  costCenter: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe('TriggerOffboardingHandler', () => {
  let handler: TriggerOffboardingHandler
  let profileRepo: IEmploymentProfileRepository
  let offboardingCaseRepo: IOffboardingCaseRepository
  let commandBus: CommandBus

  beforeEach(() => {
    profileRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
    } as unknown as IEmploymentProfileRepository

    offboardingCaseRepo = {
      findById: vi.fn(),
      findActiveByProfileId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      insertTask: vi.fn(),
      getRequiredTasks: vi.fn(),
      updateTaskStatus: vi.fn(),
      findTaskById: vi.fn(),
    } as unknown as IOffboardingCaseRepository

    commandBus = { execute: vi.fn().mockResolvedValue(DECISION_CASE_ID) } as unknown as CommandBus

    handler = new TriggerOffboardingHandler(profileRepo, offboardingCaseRepo, commandBus)
  })

  it('creates a decision case and inserts an offboarding case with status pending', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue(makeProfile('active'))
    vi.mocked(offboardingCaseRepo.findActiveByProfileId).mockResolvedValue(null)
    vi.mocked(offboardingCaseRepo.insert).mockResolvedValue({
      id: 'case-001',
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      templateId: null,
      reason: 'Moving on',
      reasonCategory: 'voluntary',
      decisionCaseId: DECISION_CASE_ID,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await handler.execute(
      new TriggerOffboardingCommand(TENANT_ID, PROFILE_ID, 'Moving on', 'voluntary', REQUESTER_ID),
    )

    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(CreateDecisionCaseCommand))
    expect(offboardingCaseRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        profileId: PROFILE_ID,
        status: 'pending',
        decisionCaseId: DECISION_CASE_ID,
        reason: 'Moving on',
        reasonCategory: 'voluntary',
      }),
    )
    expect(profileRepo.updateStatus).toHaveBeenCalledWith(PROFILE_ID, TENANT_ID, 'offboarding')
  })

  it('throws EmploymentProfileNotFoundException when profile not found', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new TriggerOffboardingCommand(
          TENANT_ID,
          PROFILE_ID,
          'Moving on',
          'voluntary',
          REQUESTER_ID,
        ),
      ),
    ).rejects.toThrow(EmploymentProfileNotFoundException)
  })

  it('throws InvalidEmploymentStatusTransitionException for terminated status', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue(makeProfile('terminated'))

    await expect(
      handler.execute(
        new TriggerOffboardingCommand(
          TENANT_ID,
          PROFILE_ID,
          'Moving on',
          'voluntary',
          REQUESTER_ID,
        ),
      ),
    ).rejects.toThrow(InvalidEmploymentStatusTransitionException)
  })

  it('throws OffboardingCaseAlreadyActiveException when active case already exists', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue(makeProfile('active'))
    vi.mocked(offboardingCaseRepo.findActiveByProfileId).mockResolvedValue({
      id: 'existing-case',
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      templateId: null,
      reason: 'Old reason',
      reasonCategory: null,
      decisionCaseId: null,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await expect(
      handler.execute(
        new TriggerOffboardingCommand(
          TENANT_ID,
          PROFILE_ID,
          'Moving on',
          'voluntary',
          REQUESTER_ID,
        ),
      ),
    ).rejects.toThrow(OffboardingCaseAlreadyActiveException)
  })

  it('offboards an employee with on_leave status successfully', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue(makeProfile('on_leave'))
    vi.mocked(offboardingCaseRepo.findActiveByProfileId).mockResolvedValue(null)
    vi.mocked(offboardingCaseRepo.insert).mockResolvedValue({
      id: 'case-002',
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      templateId: null,
      reason: 'Medical leave ending',
      reasonCategory: 'voluntary',
      decisionCaseId: DECISION_CASE_ID,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await handler.execute(
      new TriggerOffboardingCommand(
        TENANT_ID,
        PROFILE_ID,
        'Medical leave ending',
        'voluntary',
        REQUESTER_ID,
      ),
    )

    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(CreateDecisionCaseCommand))
    expect(profileRepo.updateStatus).toHaveBeenCalledWith(PROFILE_ID, TENANT_ID, 'offboarding')
  })
})
