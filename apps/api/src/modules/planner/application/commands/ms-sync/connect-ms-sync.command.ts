export class ConnectMsSyncCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly input: {
      clientId: string
      tenantAdId: string
      clientSecret: string
    },
  ) {}
}
