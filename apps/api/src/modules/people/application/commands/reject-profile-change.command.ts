export class RejectProfileChangeCommand {
  constructor(
    readonly tenantId: string,
    readonly changeRequestId: string,
    readonly rejectedBy: string,
    readonly comment: string,
  ) {}
}
