export class ApproveProfileChangeCommand {
  constructor(
    readonly tenantId: string,
    readonly changeRequestId: string,
    readonly approvedBy: string,
  ) {}
}
