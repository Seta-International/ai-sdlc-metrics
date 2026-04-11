export class CompleteOffboardingCommand {
  constructor(
    readonly tenantId: string,
    readonly offboardingCaseId: string,
    readonly completedBy: string,
  ) {}
}
