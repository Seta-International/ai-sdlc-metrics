import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { OnboardingTaskNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  ONBOARDING_CASE_REPOSITORY,
  type IOnboardingCaseRepository,
} from '../../domain/repositories/onboarding-case.repository'
import {
  OFFBOARDING_CASE_REPOSITORY,
  type IOffboardingCaseRepository,
} from '../../domain/repositories/offboarding-case.repository'
import {
  EMPLOYMENT_PROFILE_REPOSITORY,
  type IEmploymentProfileRepository,
} from '../../domain/repositories/employment-profile.repository'
import {
  OUTBOX_EVENT_REPOSITORY,
  type IOutboxEventRepository,
} from '../../../kernel/domain/repositories/outbox-event.repository.port'
import { CompleteTaskCommand } from './complete-task.command'

const EMPLOYEE_ACTIVATED_EVENT = 'people.employee-activated'

@CommandHandler(CompleteTaskCommand)
export class CompleteTaskHandler implements ICommandHandler<CompleteTaskCommand, void> {
  constructor(
    @Inject(ONBOARDING_CASE_REPOSITORY)
    private readonly onboardingCaseRepo: IOnboardingCaseRepository,
    @Inject(OFFBOARDING_CASE_REPOSITORY)
    private readonly offboardingCaseRepo: IOffboardingCaseRepository,
    @Inject(EMPLOYMENT_PROFILE_REPOSITORY)
    private readonly profileRepo: IEmploymentProfileRepository,
    @Inject(OUTBOX_EVENT_REPOSITORY)
    private readonly outboxRepo: IOutboxEventRepository,
  ) {}

  async execute(command: CompleteTaskCommand): Promise<void> {
    const { tenantId, taskId, taskType, evidenceUrl } = command

    if (taskType === 'onboarding') {
      await this.completeOnboardingTask(tenantId, taskId, evidenceUrl)
    } else {
      await this.completeOffboardingTask(tenantId, taskId, evidenceUrl)
    }
  }

  private async completeOnboardingTask(
    tenantId: string,
    taskId: string,
    evidenceUrl: string | null,
  ): Promise<void> {
    const task = await this.onboardingCaseRepo.findTaskById(taskId, tenantId)
    if (!task) throw new OnboardingTaskNotFoundException(taskId)

    const now = new Date()
    await this.onboardingCaseRepo.updateTaskStatus(taskId, tenantId, 'completed', now, evidenceUrl)

    const requiredTasks = await this.onboardingCaseRepo.getRequiredTasks(task.caseId, tenantId)
    const allCompleted = requiredTasks.every((t) => t.status === 'completed')

    if (allCompleted) {
      await this.onboardingCaseRepo.updateStatus(task.caseId, tenantId, 'completed')

      const onboardingCase = await this.onboardingCaseRepo.findById(task.caseId, tenantId)
      if (onboardingCase) {
        const profile = await this.profileRepo.findById(onboardingCase.profileId, tenantId)
        if (profile) {
          await this.profileRepo.updateStatus(profile.id, tenantId, 'active')
          await this.outboxRepo.insert({
            tenantId,
            eventName: EMPLOYEE_ACTIVATED_EVENT,
            payload: {
              tenantId,
              actorId: profile.actorId,
              employeeCode: profile.employeeCode,
              companyEmail: profile.companyEmail,
            },
          })
        }
      }
    }
  }

  private async completeOffboardingTask(
    tenantId: string,
    taskId: string,
    evidenceUrl: string | null,
  ): Promise<void> {
    const task = await this.offboardingCaseRepo.findTaskById(taskId, tenantId)
    if (!task) throw new OnboardingTaskNotFoundException(taskId)

    const now = new Date()
    await this.offboardingCaseRepo.updateTaskStatus(taskId, tenantId, 'completed', now, evidenceUrl)
  }
}
