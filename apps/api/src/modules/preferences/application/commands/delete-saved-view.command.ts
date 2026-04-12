export class DeleteSavedViewCommand {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly actorId: string,
  ) {}
}
