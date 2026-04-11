export class DeactivateLocalUserCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly deactivatedBy: string,
  ) {}
}
