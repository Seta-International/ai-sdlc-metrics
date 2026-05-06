export class UpdateCustomFieldDefCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly actorId: string,
    public readonly defId: string,
    public readonly name: string,
    public readonly choiceOptions: string[] | null,
    public readonly position: number,
  ) {}
}
