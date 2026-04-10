export class DecisionCaseResolvedEvent {
  static readonly eventName = 'kernel.decision-case-resolved'
  constructor(
    public readonly tenantId: string,
    public readonly caseId: string,
    public readonly finalAction: 'approved' | 'rejected',
    public readonly decidedBy: string,
  ) {}
}
