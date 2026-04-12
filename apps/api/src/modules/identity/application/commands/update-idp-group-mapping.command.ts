export class UpdateIdpGroupMappingCommand {
  constructor(
    readonly tenantId: string,
    readonly identityProviderId: string,
    readonly externalGroupId: string,
    readonly externalGroupName: string,
    readonly roleKey: string,
    readonly scopeType: 'global' | 'department' | 'project' | 'account',
    readonly scopeId: string | null,
    readonly updatedBy: string,
  ) {}
}
