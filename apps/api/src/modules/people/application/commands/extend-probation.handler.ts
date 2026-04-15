import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  ProbationRecordNotFoundException,
  InvalidProbationStatusException,
  ProbationExtensionNotAllowedException,
} from '../../domain/exceptions/people.exceptions'
import {
  PROBATION_POLICY_REPOSITORY,
  type IProbationPolicyRepository,
} from '../../domain/repositories/probation-policy.repository'
import {
  PROBATION_RECORD_REPOSITORY,
  type IProbationRecordRepository,
} from '../../domain/repositories/probation-record.repository'
import { ExtendProbationCommand } from './extend-probation.command'

@CommandHandler(ExtendProbationCommand)
export class ExtendProbationHandler implements ICommandHandler<ExtendProbationCommand, void> {
  constructor(
    @Inject(PROBATION_POLICY_REPOSITORY)
    private readonly probationPolicyRepo: IProbationPolicyRepository,
    @Inject(PROBATION_RECORD_REPOSITORY)
    private readonly probationRecordRepo: IProbationRecordRepository,
  ) {}

  async execute(command: ExtendProbationCommand): Promise<void> {
    const record = await this.probationRecordRepo.findByEmploymentId(
      command.employmentId,
      command.tenantId,
    )

    if (!record) throw new ProbationRecordNotFoundException(command.employmentId)

    if (record.status !== 'active' && record.status !== 'extended') {
      throw new InvalidProbationStatusException(record.status, 'extend')
    }

    const policy = await this.probationPolicyRepo.findById(
      record.probationPolicyId,
      command.tenantId,
    )

    if (!policy || !policy.allowExtension) {
      throw new ProbationExtensionNotAllowedException('policy does not allow extensions')
    }

    if (record.extensionCount >= policy.maxExtensions) {
      throw new ProbationExtensionNotAllowedException(
        `maximum extensions (${policy.maxExtensions}) already reached`,
      )
    }

    const maxEndDate = new Date(record.startDate)
    maxEndDate.setDate(maxEndDate.getDate() + policy.maxDurationDays)
    if (command.newEndDate > maxEndDate) {
      throw new ProbationExtensionNotAllowedException(
        'new end date exceeds maximum allowed duration',
      )
    }

    await this.probationRecordRepo.update(record.id, command.tenantId, {
      currentEndDate: command.newEndDate,
      extensionCount: record.extensionCount + 1,
      status: 'extended',
      outcomeNote: command.note ?? null,
    })
  }
}
