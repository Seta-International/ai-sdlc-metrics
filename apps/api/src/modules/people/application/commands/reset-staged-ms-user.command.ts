export class ResetStagedMsUserCommand {
  constructor(
    public readonly tenantId: string,
    public readonly stagedUserId: string,
  ) {}
}
