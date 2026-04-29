export class ImportStagedMsUserCommand {
  constructor(
    public readonly tenantId: string,
    public readonly stagedUserId: string,
    public readonly importedBy: string,
  ) {}
}
