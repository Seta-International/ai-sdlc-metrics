export class ListGroupMembersQuery {
  constructor(
    public readonly externalGroupId: string,
    public readonly tenantId: string,
  ) {}
}
