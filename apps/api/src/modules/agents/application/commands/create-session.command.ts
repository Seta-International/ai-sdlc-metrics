export class CreateSessionCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly contextModule?: string,
    readonly contextEntity?: string,
    readonly contextEntityId?: string,
    readonly contextMetadata?: Record<string, unknown>,
  ) {}
}
