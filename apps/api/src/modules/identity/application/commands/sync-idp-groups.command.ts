export class SyncIdpGroupsCommand {
  constructor(
    readonly tenantId: string,
    readonly syncedBy: string,
  ) {}
}
