import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  ProbationRecordNotFoundException,
  InvalidProbationStatusException,
} from '../../domain/exceptions/people.exceptions'
import {
  PROBATION_RECORD_REPOSITORY,
  type IProbationRecordRepository,
} from '../../domain/repositories/probation-record.repository'
import { FailProbationCommand } from './fail-probation.command'
import { TerminateEmploymentCommand } from './terminate-employment.command'

@CommandHandler(FailProbationCommand)
export class FailProbationHandler implements ICommandHandler<FailProbationCommand, void> {
  constructor(
    @Inject(PROBATION_RECORD_REPOSITORY)
    private readonly probationRecordRepo: IProbationRecordRepository,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: FailProbationCommand): Promise<void> {
    const record = await this.probationRecordRepo.findByEmploymentId(
      command.employmentId,
      command.tenantId,
    )

    if (!record) throw new ProbationRecordNotFoundException(command.employmentId)

    if (record.status !== 'active' && record.status !== 'extended') {
      throw new InvalidProbationStatusException(record.status, 'fail')
    }

    const now = new Date()

    await this.probationRecordRepo.update(record.id, command.tenantId, {
      status: 'failed',
      outcomeDate: now,
      outcomeBy: command.failedBy,
      outcomeNote: command.note ?? null,
    })

    await this.commandBus.execute(
      new TerminateEmploymentCommand(
        command.tenantId,
        command.employmentId,
        'failed_probation',
        now,
        command.failedBy,
      ),
    )
  }
}
