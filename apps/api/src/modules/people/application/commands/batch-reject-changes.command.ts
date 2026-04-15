export class BatchRejectChangesCommand {
  constructor(
    readonly tenantId: string,
    readonly batchId: string,
    readonly rejectedBy: string,
    readonly note?: string | null,
  ) {}
}
