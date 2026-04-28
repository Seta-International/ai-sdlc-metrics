export class PushPlanCommand {
  constructor(
    public readonly planId: string,
    public readonly tenantId: string,
  ) {}
}
