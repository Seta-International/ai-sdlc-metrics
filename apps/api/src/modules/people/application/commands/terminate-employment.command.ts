import type { TerminationReason } from '../../domain/value-objects/employment-status'

export class TerminateEmploymentCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly terminationReason: TerminationReason,
    readonly terminationDate: Date,
    readonly initiatedBy: string,
  ) {}
}
