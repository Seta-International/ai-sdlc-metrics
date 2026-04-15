import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import { assertValidTransition } from '../../domain/value-objects/employment-state-machine'
import { TerminateEmploymentCommand } from './terminate-employment.command'

@CommandHandler(TerminateEmploymentCommand)
export class TerminateEmploymentHandler implements ICommandHandler<
  TerminateEmploymentCommand,
  void
> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
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
  }
}
