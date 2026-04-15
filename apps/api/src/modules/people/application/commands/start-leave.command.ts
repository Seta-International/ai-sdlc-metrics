export class StartLeaveCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly leaveType: string,
    readonly expectedReturnDate: Date,
    readonly initiatedBy: string,
  ) {}
}
