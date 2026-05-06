export class RegenerateLastTurnCommand {
  constructor(
    readonly tenantId: string,
    readonly sessionId: string,
    readonly actorId: string,
  ) {}
}
