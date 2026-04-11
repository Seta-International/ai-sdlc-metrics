import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { ApproveOffboardingCommand } from './approve-offboarding.command'
import { ApproveOffboardingHandler } from './approve-offboarding.handler'
import {
  EmploymentProfileNotFoundException,
  OffboardingCaseNotFoundException,
} from '../../domain/exceptions/people.exceptions'
import type { IEmploymentProfileRepository } from '../../domain/repositories/employment-profile.repository'
import type {
  IOffboardingTemplateRepository,
  IOffboardingCaseRepository,
} from '../../domain/repositories/offboarding.repository.port'
import type { IOutboxEventRepository } from '../../../kernel/domain/repositories/outbox-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const CASE_ID = '01900000-0000-7000-8000-000000000030'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const TEMPLATE_ID = '01900000-0000-7000-8000-000000000040'
const APPROVER_ID = '01900000-0000-7000-8000-000000000005'

describe('ApproveOffboardingHandler', () => {
  let handler: ApproveOffboardingHandler
  let profileRepo: IEmploymentProfileRepository
  let templateRepo: IOffboardingTemplateRepository
  let caseRepo: IOffboardingCaseRepository
  let outboxRepo: IOutboxEventRepository
  let commandBus: CommandBus

  beforeEach(() => {
    profileRepo = {
      findById: vi.fn().mockResolvedValue({
        id: PROFILE_ID,
        tenantId: TENANT_ID,
        actorId: 'actor-1',
        employmentType: 'permanent',
        employmentStatus: 'active',
      }),
      findByActorId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      list: vi.fn(),
      count: vi.fn(),
    } as unknown as IEmploymentProfileRepository
    templateRepo = {
      findMatch: vi.fn().mockResolvedValue({
        id: TEMPLATE_ID,
        tenantId: TENANT_ID,
        name: 'Voluntary Permanent',
        employmentType: 'permanent',
        reasonCategory: 'voluntary',
        isDefault: false,
        isActive: true,
      }),
      findDefault: vi.fn(),
      findById: vi.fn(),
      getTaskTemplates: vi.fn().mockResolvedValue([
        {
          id: 'tt-1',
          tenantId: TENANT_ID,
          templateId: TEMPLATE_ID,
          title: 'Return laptop',
          description: null,
          assigneeRole: 'it',
          dueDaysAfterTrigger: 5,
          isRequired: true,
        },
        {
          id: 'tt-2',
          tenantId: TENANT_ID,
          templateId: TEMPLATE_ID,
          title: 'Exit interview',
          description: null,
          assigneeRole: 'hr',
          dueDaysAfterTrigger: 10,
          isRequired: true,
        },
      ]),
      insert: vi.fn(),
    } as unknown as IOffboardingTemplateRepository
    caseRepo = {
      insert: vi.fn(),
      findById: vi.fn().mockResolvedValue({
        id: CASE_ID,
        tenantId: TENANT_ID,
        profileId: PROFILE_ID,
        status: 'pending',
        reason: 'Resignation',
        reasonCategory: 'voluntary',
        templateId: null,
        decisionCaseId: 'dc-1',
        createdAt: new Date(),
      }),
      findActiveByProfileId: vi.fn(),
      updateStatus: vi.fn(),
      insertTask: vi.fn(),
      getRequiredTasks: vi.fn(),
      updateTaskStatus: vi.fn(),
      findTaskById: vi.fn(),
    } as unknown as IOffboardingCaseRepository
    outboxRepo = { insert: vi.fn() } as unknown as IOutboxEventRepository
    commandBus = { execute: vi.fn() } as unknown as CommandBus
    handler = new ApproveOffboardingHandler(
      profileRepo,
      templateRepo,
      caseRepo,
      outboxRepo,
      commandBus,
    )
  })

  it('matches template, generates tasks, transitions to processing, emits event', async () => {
    await handler.execute(new ApproveOffboardingCommand(TENANT_ID, CASE_ID, APPROVER_ID))

    // Verify status transitions
    expect(profileRepo.updateStatus).toHaveBeenCalledWith(PROFILE_ID, TENANT_ID, 'offboarding')
    expect(caseRepo.updateStatus).toHaveBeenCalledWith(CASE_ID, TENANT_ID, 'approved')
    expect(caseRepo.updateStatus).toHaveBeenCalledWith(CASE_ID, TENANT_ID, 'processing')

    // Verify tasks generated
    expect(caseRepo.insertTask).toHaveBeenCalledTimes(2)
    expect(caseRepo.insertTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Return laptop',
        assigneeRole: 'it',
      }),
    )

    // Verify outbox event
    expect(outboxRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'people.offboarding-started',
      }),
    )

    // Verify decision case resolved
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: 'dc-1',
        finalAction: 'approved',
        decidedBy: APPROVER_ID,
      }),
    )
  })

  it('throws OffboardingCaseNotFoundException when case not found', async () => {
    vi.mocked(caseRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new ApproveOffboardingCommand(TENANT_ID, CASE_ID, APPROVER_ID)),
    ).rejects.toThrow(OffboardingCaseNotFoundException)
  })

  it('throws EmploymentProfileNotFoundException when profile not found', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new ApproveOffboardingCommand(TENANT_ID, CASE_ID, APPROVER_ID)),
    ).rejects.toThrow(EmploymentProfileNotFoundException)
  })

  it('falls back to default template when no match for employment_type + reason_category', async () => {
    vi.mocked(templateRepo.findMatch).mockResolvedValue(null)
    vi.mocked(templateRepo.findDefault).mockResolvedValue({
      id: 'default-t',
      tenantId: TENANT_ID,
      name: 'Default',
      employmentType: null,
      reasonCategory: null,
      isDefault: true,
      isActive: true,
    })
    vi.mocked(templateRepo.getTaskTemplates).mockResolvedValue([])

    await handler.execute(new ApproveOffboardingCommand(TENANT_ID, CASE_ID, APPROVER_ID))

    expect(templateRepo.findDefault).toHaveBeenCalledWith(TENANT_ID)
  })
})
