import type { ContractType, SalaryFrequency } from '../../domain/entities/contract-version.entity'

export class CreateContractVersionCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly contractType: ContractType,
    readonly startDate: Date,
    readonly createdBy: string,
    readonly endDate?: Date | null,
    readonly baseSalary?: string | null,
    readonly salaryCurrency?: string | null,
    readonly salaryFrequency?: SalaryFrequency | null,
    readonly noticePeriodDays?: number | null,
    readonly workHoursPerWeek?: string | null,
    readonly probationEndDate?: Date | null,
    readonly note?: string | null,
  ) {}
}
