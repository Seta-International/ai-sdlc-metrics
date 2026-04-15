export class InitiateLinkedInAuthCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly redirectUri: string,
  ) {}
}
