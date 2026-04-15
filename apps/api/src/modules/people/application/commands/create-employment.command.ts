import type { EmploymentType, WorkerType } from '../../domain/value-objects/employment-status'

export class CreateEmploymentCommand {
  constructor(
    readonly tenantId: string,
    readonly personProfileId: string,
    readonly workerType: WorkerType,
    readonly employmentType: EmploymentType,
    readonly countryCode: string,
    readonly hireDate: Date,
    readonly createdBy: string,
    readonly employeeCode?: string | null,
    readonly companyEmail?: string | null,
    readonly originalHireDate?: Date | null,
  ) {}
}
