export class CreateSprintCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly actorId: string,
    public readonly name: string,
    public readonly startDate: string, // YYYY-MM-DD string
    public readonly endDate: string, // YYYY-MM-DD string
  ) {}
}
