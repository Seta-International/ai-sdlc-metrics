export class DisconnectMsSyncCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly mode: 'pause' | 'destroy',
  ) {}
}
