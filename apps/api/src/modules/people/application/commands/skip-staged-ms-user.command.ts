export class SkipStagedMsUserCommand {
  constructor(
    public readonly tenantId: string,
    public readonly stagedUserId: string,
  ) {}
}
