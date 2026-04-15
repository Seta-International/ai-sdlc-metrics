import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { EmploymentTerminatedEvent } from '@future/event-contracts'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  OFFBOARDING_CASE_REPOSITORY,
  type IOffboardingCaseRepository,
} from '../../domain/repositories/offboarding-case.repository'
import { assertValidTransition } from '../../domain/value-objects/employment-state-machine'
import { OffboardingTemplateSelectorService } from '../services/offboarding-template-selector.service'
import { TerminateEmploymentCommand } from './terminate-employment.command'

@CommandHandler(TerminateEmploymentCommand)
export class TerminateEmploymentHandler implements ICommandHandler<
  TerminateEmploymentCommand,
  void
> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(OFFBOARDING_CASE_REPOSITORY)
    private readonly offboardingCaseRepo: IOffboardingCaseRepository,
    private readonly offboardingTemplateSelector: OffboardingTemplateSelectorService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: TerminateEmploymentCommand): Promise<void> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) throw new EmploymentNotFoundException(command.employmentId)

    assertValidTransition(employment.employmentStatus, 'terminated')

    await this.employmentRepo.updateStatus(
      command.employmentId,
      command.tenantId,
      'terminated',
      command.terminationDate,
      command.terminationReason,
    )

    const template = await this.offboardingTemplateSelector.selectTemplate(
      command.tenantId,
      employment.countryCode,
      command.terminationReason,
    )

    if (template) {
      await this.offboardingCaseRepo.insert({
        tenantId: command.tenantId,
        employmentId: command.employmentId,
        templateId: template.id,
        reason: command.terminationReason,
        reasonCategory: null,
        decisionCaseId: null,
        status: 'pending',
      })
    }

    await this.eventBus.publish(
      new EmploymentTerminatedEvent(
        command.tenantId,
        command.employmentId,
        command.initiatedBy,
        command.terminationReason,
        command.terminationDate,
      ),
    )
  }
}
