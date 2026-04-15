import type {
  JobAssignmentEventType,
  WorkArrangement,
} from '../../domain/value-objects/employment-status'

export class CreateJobAssignmentCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly jobProfileId: string,
    readonly effectiveFrom: Date,
    readonly eventType: JobAssignmentEventType,
    readonly createdBy: string,
    readonly departmentId?: string | null,
    readonly locationId?: string | null,
    readonly costCenterId?: string | null,
    readonly workArrangement?: WorkArrangement | null,
    readonly managerId?: string | null,
    readonly reason?: string | null,
  ) {}
}
