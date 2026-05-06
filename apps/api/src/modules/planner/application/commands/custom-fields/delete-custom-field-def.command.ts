export class DeleteCustomFieldDefCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly actorId: string,
    public readonly defId: string,
  ) {}
}
