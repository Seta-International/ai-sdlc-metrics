export class TriggerOffboardingCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly reason: string,
    readonly reasonCategory: 'voluntary' | 'involuntary' | 'redundancy' | 'end_of_contract' | null,
    readonly requestedBy: string,
  ) {}
}
