export class CreateDecisionCaseCommand {
  constructor(
    public readonly tenantId: string,
    public readonly module: string,
    public readonly subjectId: string,
    public readonly requestedBy: string,
  ) {}
}
