export class SetDefaultSavedViewCommand {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly resourceKey: string,
  ) {}
}
