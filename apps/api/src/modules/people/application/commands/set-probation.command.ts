import type { JobLevelCategory } from '../../domain/entities/probation-policy.entity'

export class SetProbationCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly countryCode: string,
    readonly jobLevelCategory: JobLevelCategory,
    readonly startDate: Date,
    readonly initiatedBy: string,
  ) {}
}
