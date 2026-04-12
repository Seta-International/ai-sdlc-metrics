export class RemoveGroupMappingCommand {
  constructor(
    readonly tenantId: string,
    readonly mappingId: string,
    readonly removedBy: string,
  ) {}
}
