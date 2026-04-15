export class ReturnFromLeaveCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly actualReturnDate: Date,
    readonly initiatedBy: string,
  ) {}
}
