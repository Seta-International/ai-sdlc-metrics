export class CompleteTerminationCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly terminationDate: Date,
    readonly initiatedBy: string,
  ) {}
}
