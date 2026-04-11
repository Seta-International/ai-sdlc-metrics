export class RevokeAllRoleGrantsCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
  ) {}
}
