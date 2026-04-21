import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { EmploymentActivatedEvent } from '@future/event-contracts'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import { assertValidTransition } from '../../domain/value-objects/employment-state-machine'
import { JobHistoryRecorderService } from '../services/job-history-recorder.service'
import { ActivateEmploymentCommand } from './activate-employment.command'

@CommandHandler(ActivateEmploymentCommand)
export class ActivateEmploymentHandler implements ICommandHandler<ActivateEmploymentCommand, void> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    private readonly eventBus: EventBus,
    private readonly recorder: JobHistoryRecorderService,
  ) {}

  async execute(command: ActivateEmploymentCommand): Promise<void> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) throw new EmploymentNotFoundException(command.employmentId)

    assertValidTransition(employment.employmentStatus, 'active')

    await this.employmentRepo.updateStatus(command.employmentId, command.tenantId, 'active')

    await this.recorder.recordHire({
      profileId: employment.personProfileId,
      tenantId: command.tenantId,
      effectiveFrom: employment.hireDate,
      jobTitle: null,
      departmentId: null,
      managerProfileId: null,
      changeReason: null,
      recordedBy: command.activatedBy,
    })

    await this.eventBus.publish(
      new EmploymentActivatedEvent(
        command.tenantId,
        command.employmentId,
        command.activatedBy,
        new Date(),
      ),
    )
  }
}
