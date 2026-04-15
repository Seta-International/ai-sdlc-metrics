export class SuspendEmploymentCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly reason: string,
    readonly reviewDate: Date,
    readonly initiatedBy: string,
  ) {}
}
