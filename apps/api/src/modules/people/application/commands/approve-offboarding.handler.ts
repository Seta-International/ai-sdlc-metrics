import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  EmploymentProfileNotFoundException,
  OffboardingCaseNotFoundException,
} from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_PROFILE_REPOSITORY,
  type IEmploymentProfileRepository,
} from '../../domain/repositories/employment-profile.repository'
import {
  OFFBOARDING_TEMPLATE_REPOSITORY,
  OFFBOARDING_CASE_REPOSITORY,
  type IOffboardingTemplateRepository,
  type IOffboardingCaseRepository,
} from '../../domain/repositories/offboarding.repository.port'
import { KernelOutboxService } from '../../../kernel/application/facades/kernel-outbox.service'
import { KernelWorkflowService } from '../../../kernel/application/facades/kernel-workflow.service'
import { ApproveOffboardingCommand } from './approve-offboarding.command'

const OFFBOARDING_STARTED_EVENT = 'people.offboarding-started'

@CommandHandler(ApproveOffboardingCommand)
export class ApproveOffboardingHandler implements ICommandHandler<ApproveOffboardingCommand, void> {
  constructor(
    @Inject(EMPLOYMENT_PROFILE_REPOSITORY)
    private readonly profileRepo: IEmploymentProfileRepository,
    @Inject(OFFBOARDING_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IOffboardingTemplateRepository,
    @Inject(OFFBOARDING_CASE_REPOSITORY)
    private readonly caseRepo: IOffboardingCaseRepository,
    private readonly outboxService: KernelOutboxService,
    private readonly workflowService: KernelWorkflowService,
  ) {}

  async execute(command: ApproveOffboardingCommand): Promise<void> {
    const offboardingCase = await this.caseRepo.findById(
      command.offboardingCaseId,
      command.tenantId,
    )
    if (!offboardingCase) throw new OffboardingCaseNotFoundException(command.offboardingCaseId)

    const profile = await this.profileRepo.findById(offboardingCase.profileId, command.tenantId)
    if (!profile) throw new EmploymentProfileNotFoundException(offboardingCase.profileId)

    // 1. Transition employment status to offboarding
    await this.profileRepo.updateStatus(profile.id, command.tenantId, 'offboarding')

    // 2. Approve the case
    await this.caseRepo.updateStatus(command.offboardingCaseId, command.tenantId, 'approved')

    // 3. Match offboarding template
    let template = offboardingCase.reasonCategory
      ? await this.templateRepo.findMatch(
          profile.employmentType,
          offboardingCase.reasonCategory,
          command.tenantId,
        )
      : null
    if (!template) {
      template = await this.templateRepo.findDefault(command.tenantId)
    }

    // 4. Generate tasks from template
    if (template) {
      const taskTemplates = await this.templateRepo.getTaskTemplates(template.id, command.tenantId)
      for (const tt of taskTemplates) {
        const dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + tt.dueDaysAfterTrigger)

        await this.caseRepo.insertTask({
          tenantId: command.tenantId,
          caseId: command.offboardingCaseId,
          actorId: null,
          title: tt.title,
          description: tt.description,
          assigneeRole: tt.assigneeRole,
          isRequired: tt.isRequired,
          dueDate,
        })
      }
    }

    // 5. Transition to processing
    await this.caseRepo.updateStatus(command.offboardingCaseId, command.tenantId, 'processing')

    // 6. Resolve decision case
    if (offboardingCase.decisionCaseId) {
      await this.workflowService.resolveDecisionCase(
        command.tenantId,
        offboardingCase.decisionCaseId,
        'approved',
        command.approvedBy,
        null,
      )
    }

    // 7. Emit outbox event
    await this.outboxService.publish({
      tenantId: command.tenantId,
      eventName: OFFBOARDING_STARTED_EVENT,
      payload: { actorId: profile.actorId, tenantId: command.tenantId, expectedLastDay: null },
    })
  }
}
