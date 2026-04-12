export class RunDirectorySyncCommand {
  constructor(
    readonly tenantId: string,
    readonly identityProviderId: string,
  ) {}
}
