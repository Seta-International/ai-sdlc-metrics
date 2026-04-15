export class BatchApproveChangesCommand {
  constructor(
    readonly tenantId: string,
    readonly batchId: string,
    readonly approvedBy: string,
    readonly note?: string | null,
  ) {}
}
