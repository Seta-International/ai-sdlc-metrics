export class ImportLinkedInProfileCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly authorizationCode: string,
    readonly redirectUri: string,
  ) {}
}
