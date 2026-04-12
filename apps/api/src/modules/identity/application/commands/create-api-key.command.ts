export class CreateApiKeyCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly name: string,
    readonly expiresAt: Date | null,
    readonly createdBy: string,
  ) {}
}
