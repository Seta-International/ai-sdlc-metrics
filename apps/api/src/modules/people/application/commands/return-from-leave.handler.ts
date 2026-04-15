import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  EmploymentNotFoundException,
  InvalidEmploymentStatusTransitionException,
} from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import { ReturnFromLeaveCommand } from './return-from-leave.command'

@CommandHandler(ReturnFromLeaveCommand)
export class ReturnFromLeaveHandler implements ICommandHandler<ReturnFromLeaveCommand, void> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
  ) {}

  async execute(command: ReturnFromLeaveCommand): Promise<void> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) throw new EmploymentNotFoundException(command.employmentId)

    if (employment.employmentStatus !== 'on_leave') {
      throw new InvalidEmploymentStatusTransitionException(employment.employmentStatus, 'active')
    }

    await this.employmentRepo.updateStatus(command.employmentId, command.tenantId, 'active')
  }
}
