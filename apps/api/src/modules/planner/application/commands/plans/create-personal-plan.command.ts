export class CreatePersonalPlanCommand {
  constructor(
    public readonly actorId: string,
    public readonly tenantId: string,
  ) {}
}
