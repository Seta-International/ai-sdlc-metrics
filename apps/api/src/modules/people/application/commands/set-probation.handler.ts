import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  PROBATION_POLICY_REPOSITORY,
  type IProbationPolicyRepository,
} from '../../domain/repositories/probation-policy.repository'
import {
  PROBATION_RECORD_REPOSITORY,
  type IProbationRecordRepository,
} from '../../domain/repositories/probation-record.repository'
import { SetProbationCommand } from './set-probation.command'

const PLACEHOLDER_POLICY_ID = '00000000-0000-0000-0000-000000000000'

@CommandHandler(SetProbationCommand)
export class SetProbationHandler implements ICommandHandler<SetProbationCommand, void> {
  constructor(
    @Inject(PROBATION_POLICY_REPOSITORY)
    private readonly probationPolicyRepo: IProbationPolicyRepository,
    @Inject(PROBATION_RECORD_REPOSITORY)
    private readonly probationRecordRepo: IProbationRecordRepository,
  ) {}

  async execute(command: SetProbationCommand): Promise<void> {
    const policy = await this.probationPolicyRepo.findByCountryAndLevel(
      command.countryCode,
      command.jobLevelCategory,
      command.tenantId,
    )

    if (!policy) {
      await this.probationRecordRepo.insert({
        tenantId: command.tenantId,
        employmentId: command.employmentId,
        startDate: command.startDate,
        originalEndDate: command.startDate,
        currentEndDate: command.startDate,
        extensionCount: 0,
        status: 'not_applicable',
        outcomeDate: null,
        outcomeBy: null,
        outcomeNote: null,
        probationPolicyId: PLACEHOLDER_POLICY_ID,
        salaryPercentage: 100,
      })
      return
    }

    const endDate = new Date(command.startDate)
    endDate.setDate(endDate.getDate() + policy.defaultDurationDays)

    await this.probationRecordRepo.insert({
      tenantId: command.tenantId,
      employmentId: command.employmentId,
      startDate: command.startDate,
      originalEndDate: endDate,
      currentEndDate: endDate,
      extensionCount: 0,
      status: 'active',
      outcomeDate: null,
      outcomeBy: null,
      outcomeNote: null,
      probationPolicyId: policy.id,
      salaryPercentage: policy.minSalaryPercentage,
    })
  }
}
