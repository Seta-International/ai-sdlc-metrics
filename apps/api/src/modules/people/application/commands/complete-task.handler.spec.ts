import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CompleteTaskCommand } from './complete-task.command'
import { CompleteTaskHandler } from './complete-task.handler'
import { OnboardingTaskNotFoundException } from '../../domain/exceptions/people.exceptions'
import type { IOnboardingCaseRepository } from '../../domain/repositories/onboarding-case.repository'
import type { IOffboardingCaseRepository } from '../../domain/repositories/offboarding-case.repository'
import type { IEmploymentProfileRepository } from '../../domain/repositories/employment-profile.repository'
import type { IOutboxEventRepository } from '../../../kernel/domain/repositories/outbox-event.repository.port'
const EMPLOYEE_ACTIVATED_EVENT = 'people.employee-activated'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const TASK_ID = '01900000-0000-7000-8000-000000000010'
const CASE_ID = '01900000-0000-7000-8000-000000000020'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const COMPLETED_BY = '01900000-0000-7000-8000-000000000005'

const makeOnboardingTask = (overrides = {}) => ({
  id: TASK_ID,
  caseId: CASE_ID,
  status: 'pending',
  isRequired: true,
  ...overrides,
})

const makeProfile = (overrides = {}) => ({
  id: PROFILE_ID,
  tenantId: TENANT_ID,
  actorId: 'actor-1',
  employeeCode: 'EMP-001',
  companyEmail: 'emp001@company.com',
  employmentType: 'permanent',
  employmentStatus: 'pre_hire',
  workArrangement: 'onsite',
  hireDate: new Date('2026-01-01'),
  terminationDate: null,
  jobTitle: 'Engineer',
  jobLevel: null,
  costCenter: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('CompleteTaskHandler', () => {
  let handler: CompleteTaskHandler
  let onboardingCaseRepo: IOnboardingCaseRepository
  let offboardingCaseRepo: IOffboardingCaseRepository
  let profileRepo: IEmploymentProfileRepository
  let outboxRepo: IOutboxEventRepository

  beforeEach(() => {
    onboardingCaseRepo = {
      findById: vi.fn(),
      findByProfileId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      insertTask: vi.fn(),
      getRequiredTasks: vi.fn(),
      updateTaskStatus: vi.fn(),
      findTaskById: vi.fn(),
    } as unknown as IOnboardingCaseRepository

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

    profileRepo = {
      findById: vi.fn().mockResolvedValue(makeProfile()),
      findByActorId: vi.fn(),
      findByEmployeeCode: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
    } as unknown as IEmploymentProfileRepository

    outboxRepo = { insert: vi.fn() } as unknown as IOutboxEventRepository

    handler = new CompleteTaskHandler(
      onboardingCaseRepo,
      offboardingCaseRepo,
      profileRepo,
      outboxRepo,
    )
  })

  describe('onboarding task — all required tasks completed', () => {
    beforeEach(() => {
      vi.mocked(onboardingCaseRepo.findTaskById).mockResolvedValue(makeOnboardingTask())
      vi.mocked(onboardingCaseRepo.getRequiredTasks).mockResolvedValue([
        { id: TASK_ID, status: 'completed', isRequired: true },
      ])
      vi.mocked(onboardingCaseRepo.findById).mockResolvedValue({
        id: CASE_ID,
        tenantId: TENANT_ID,
        profileId: PROFILE_ID,
        templateId: null,
        status: 'in_progress',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    })

    it('marks task completed, transitions case to completed, updates profile to active, emits EmployeeActivatedEvent', async () => {
      await handler.execute(
        new CompleteTaskCommand(TENANT_ID, TASK_ID, 'onboarding', COMPLETED_BY, null),
      )

      expect(onboardingCaseRepo.findTaskById).toHaveBeenCalledWith(TASK_ID, TENANT_ID)
      expect(onboardingCaseRepo.updateTaskStatus).toHaveBeenCalledWith(
        TASK_ID,
        TENANT_ID,
        'completed',
        expect.any(Date),
        null,
      )
      expect(onboardingCaseRepo.getRequiredTasks).toHaveBeenCalledWith(CASE_ID, TENANT_ID)
      expect(onboardingCaseRepo.updateStatus).toHaveBeenCalledWith(CASE_ID, TENANT_ID, 'completed')
      expect(profileRepo.findById).toHaveBeenCalledWith(PROFILE_ID, TENANT_ID)
      expect(profileRepo.updateStatus).toHaveBeenCalledWith(PROFILE_ID, TENANT_ID, 'active')
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          eventName: EMPLOYEE_ACTIVATED_EVENT,
          payload: expect.objectContaining({ actorId: 'actor-1' }),
        }),
      )
    })
  })

  describe('onboarding task — partial completion', () => {
    beforeEach(() => {
      vi.mocked(onboardingCaseRepo.findTaskById).mockResolvedValue(makeOnboardingTask())
      vi.mocked(onboardingCaseRepo.getRequiredTasks).mockResolvedValue([
        { id: TASK_ID, status: 'completed', isRequired: true },
        { id: 'task-2', status: 'pending', isRequired: true },
      ])
    })

    it('marks task completed but does NOT complete case or update profile', async () => {
      await handler.execute(
        new CompleteTaskCommand(
          TENANT_ID,
          TASK_ID,
          'onboarding',
          COMPLETED_BY,
          'http://evidence.url/file.pdf',
        ),
      )

      expect(onboardingCaseRepo.updateTaskStatus).toHaveBeenCalledWith(
        TASK_ID,
        TENANT_ID,
        'completed',
        expect.any(Date),
        'http://evidence.url/file.pdf',
      )
      expect(onboardingCaseRepo.updateStatus).not.toHaveBeenCalled()
      expect(profileRepo.updateStatus).not.toHaveBeenCalled()
      expect(outboxRepo.insert).not.toHaveBeenCalled()
    })
  })

  describe('offboarding task', () => {
    beforeEach(() => {
      vi.mocked(offboardingCaseRepo.findTaskById).mockResolvedValue(makeOnboardingTask())
    })

    it('marks task completed and does NOT auto-complete the offboarding case', async () => {
      await handler.execute(
        new CompleteTaskCommand(TENANT_ID, TASK_ID, 'offboarding', COMPLETED_BY, null),
      )

      expect(offboardingCaseRepo.findTaskById).toHaveBeenCalledWith(TASK_ID, TENANT_ID)
      expect(offboardingCaseRepo.updateTaskStatus).toHaveBeenCalledWith(
        TASK_ID,
        TENANT_ID,
        'completed',
        expect.any(Date),
        null,
      )
      expect(offboardingCaseRepo.updateStatus).not.toHaveBeenCalled()
      expect(profileRepo.updateStatus).not.toHaveBeenCalled()
      expect(outboxRepo.insert).not.toHaveBeenCalled()
    })
  })

  describe('task not found', () => {
    it('throws OnboardingTaskNotFoundException when onboarding task not found', async () => {
      vi.mocked(onboardingCaseRepo.findTaskById).mockResolvedValue(null)

      await expect(
        handler.execute(
          new CompleteTaskCommand(TENANT_ID, TASK_ID, 'onboarding', COMPLETED_BY, null),
        ),
      ).rejects.toThrow(OnboardingTaskNotFoundException)
    })

    it('throws OnboardingTaskNotFoundException when offboarding task not found', async () => {
      vi.mocked(offboardingCaseRepo.findTaskById).mockResolvedValue(null)

      await expect(
        handler.execute(
          new CompleteTaskCommand(TENANT_ID, TASK_ID, 'offboarding', COMPLETED_BY, null),
        ),
      ).rejects.toThrow(OnboardingTaskNotFoundException)
    })
  })
})
