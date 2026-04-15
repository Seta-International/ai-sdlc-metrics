import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import { assertValidTransition } from '../../domain/value-objects/employment-state-machine'
import { StartLeaveCommand } from './start-leave.command'

@CommandHandler(StartLeaveCommand)
export class StartLeaveHandler implements ICommandHandler<StartLeaveCommand, void> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
  ) {}

  async execute(command: StartLeaveCommand): Promise<void> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) throw new EmploymentNotFoundException(command.employmentId)

    assertValidTransition(employment.employmentStatus, 'on_leave')

    await this.employmentRepo.updateStatus(command.employmentId, command.tenantId, 'on_leave')
  }
}
