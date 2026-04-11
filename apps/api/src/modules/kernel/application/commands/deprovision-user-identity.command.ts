export class DeprovisionUserIdentityCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
  ) {}
}
