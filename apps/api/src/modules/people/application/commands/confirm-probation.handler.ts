import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { ProbationConfirmedEvent } from '@future/event-contracts'
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
    private readonly eventBus: EventBus,
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

    const outcomeDate = new Date()

    await this.probationRecordRepo.update(record.id, command.tenantId, {
      status: 'passed',
      outcomeDate,
      outcomeBy: command.confirmedBy,
      outcomeNote: command.note ?? null,
    })

    await this.eventBus.publish(
      new ProbationConfirmedEvent(command.tenantId, command.employmentId, outcomeDate),
    )
  }
}
