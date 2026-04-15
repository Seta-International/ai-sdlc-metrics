export class RevokeShareLinkCommand {
  constructor(
    readonly tenantId: string,
    readonly shareLinkId: string,
    readonly revokedBy: string,
  ) {}
}
