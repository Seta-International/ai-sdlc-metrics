import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  ProbationRecordNotFoundException,
  InvalidProbationStatusException,
} from '../../domain/exceptions/people.exceptions'
import {
  PROBATION_RECORD_REPOSITORY,
  type IProbationRecordRepository,
} from '../../domain/repositories/probation-record.repository'
import { ConfirmProbationCommand } from './confirm-probation.command'

@CommandHandler(ConfirmProbationCommand)
export class ConfirmProbationHandler implements ICommandHandler<ConfirmProbationCommand, void> {
  constructor(
    @Inject(PROBATION_RECORD_REPOSITORY)
    private readonly probationRecordRepo: IProbationRecordRepository,
  ) {}

  async execute(command: ConfirmProbationCommand): Promise<void> {
    const record = await this.probationRecordRepo.findByEmploymentId(
      command.employmentId,
      command.tenantId,
    )

    if (!record) throw new ProbationRecordNotFoundException(command.employmentId)

    if (record.status !== 'active' && record.status !== 'extended') {
      throw new InvalidProbationStatusException(record.status, 'confirm')
    }

    await this.probationRecordRepo.update(record.id, command.tenantId, {
      status: 'passed',
      outcomeDate: new Date(),
      outcomeBy: command.confirmedBy,
      outcomeNote: command.note ?? null,
    })
  }
}
