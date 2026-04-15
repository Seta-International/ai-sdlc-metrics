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
import { ReinstateSuspensionCommand } from './reinstate-suspension.command'

@CommandHandler(ReinstateSuspensionCommand)
export class ReinstateSuspensionHandler implements ICommandHandler<
  ReinstateSuspensionCommand,
  void
> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
  ) {}

  async execute(command: ReinstateSuspensionCommand): Promise<void> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) throw new EmploymentNotFoundException(command.employmentId)

    if (employment.employmentStatus !== 'suspended') {
      throw new InvalidEmploymentStatusTransitionException(employment.employmentStatus, 'active')
    }

    await this.employmentRepo.updateStatus(command.employmentId, command.tenantId, 'active')
  }
}
