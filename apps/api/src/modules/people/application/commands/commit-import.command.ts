export class CommitImportCommand {
  constructor(
    readonly tenantId: string,
    readonly importJobId: string,
    readonly requestedBy: string,
  ) {}
}
