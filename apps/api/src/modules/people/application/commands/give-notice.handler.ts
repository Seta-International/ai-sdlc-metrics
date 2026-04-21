import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { EmployeeNoticeGivenEvent, TerminationInitiatedEvent } from '@future/event-contracts'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import { assertValidTransition } from '../../domain/value-objects/employment-state-machine'
import { GiveNoticeCommand } from './give-notice.command'

@CommandHandler(GiveNoticeCommand)
export class GiveNoticeHandler implements ICommandHandler<GiveNoticeCommand, void> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: GiveNoticeCommand): Promise<void> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) throw new EmploymentNotFoundException(command.employmentId)

    assertValidTransition(employment.employmentStatus, 'notice_period')

    await this.employmentRepo.updateStatus(command.employmentId, command.tenantId, 'notice_period')

    await this.eventBus.publish(
      new EmployeeNoticeGivenEvent(
        command.tenantId,
        command.employmentId,
        command.lastWorkingDay,
        command.noticeType,
      ),
    )

    await this.eventBus.publish(
      new TerminationInitiatedEvent(
        command.tenantId,
        command.employmentId,
        employment.personProfileId,
        command.initiatedBy,
        command.lastWorkingDay,
        command.noticeType,
        command.initiatedBy,
        new Date(),
      ),
    )
  }
}
