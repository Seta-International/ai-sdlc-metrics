export class BulkUpdateDepartmentCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentIds: string[],
    readonly newDepartmentId: string,
    readonly effectiveFrom: Date,
    readonly reason: string,
    readonly requestedBy: string,
  ) {}
}
