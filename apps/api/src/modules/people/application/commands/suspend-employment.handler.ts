import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { EmployeeSuspendedEvent } from '@future/event-contracts'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import { assertValidTransition } from '../../domain/value-objects/employment-state-machine'
import { SuspendEmploymentCommand } from './suspend-employment.command'

@CommandHandler(SuspendEmploymentCommand)
export class SuspendEmploymentHandler implements ICommandHandler<SuspendEmploymentCommand, void> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: SuspendEmploymentCommand): Promise<void> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) throw new EmploymentNotFoundException(command.employmentId)

    assertValidTransition(employment.employmentStatus, 'suspended')

    await this.employmentRepo.updateStatus(command.employmentId, command.tenantId, 'suspended')

    await this.eventBus.publish(
      new EmployeeSuspendedEvent(
        command.tenantId,
        command.employmentId,
        command.reason,
        command.reviewDate,
      ),
    )
  }
}
