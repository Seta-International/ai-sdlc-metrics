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
import { JobHistoryRecorderService } from '../services/job-history-recorder.service'
import { CompleteTerminationCommand } from './complete-termination.command'

@CommandHandler(CompleteTerminationCommand)
export class CompleteTerminationHandler implements ICommandHandler<
  CompleteTerminationCommand,
  void
> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    private readonly recorder: JobHistoryRecorderService,
  ) {}

  async execute(command: CompleteTerminationCommand): Promise<void> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) throw new EmploymentNotFoundException(command.employmentId)

    if (employment.employmentStatus !== 'notice_period') {
      throw new InvalidEmploymentStatusTransitionException(
        employment.employmentStatus,
        'terminated',
      )
    }

    await this.employmentRepo.updateStatus(
      command.employmentId,
      command.tenantId,
      'terminated',
      command.terminationDate,
      employment.terminationReason,
    )

    await this.recorder.recordTermination(
      employment.personProfileId,
      command.tenantId,
      command.terminationDate,
    )
  }
}
