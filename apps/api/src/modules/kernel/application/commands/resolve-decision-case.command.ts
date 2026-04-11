export class ResolveDecisionCaseCommand {
  constructor(
    public readonly tenantId: string,
    public readonly caseId: string,
    public readonly finalAction: 'approved' | 'rejected',
    public readonly decidedBy: string,
    public readonly comment: string | null,
  ) {}
}
