export class RevokeApiKeyCommand {
  constructor(
    readonly tenantId: string,
    readonly apiKeyId: string,
    readonly revokedBy: string,
  ) {}
}
