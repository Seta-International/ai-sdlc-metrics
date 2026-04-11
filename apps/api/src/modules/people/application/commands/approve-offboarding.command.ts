export class ApproveOffboardingCommand {
  constructor(
    readonly tenantId: string,
    readonly offboardingCaseId: string,
    readonly approvedBy: string,
  ) {}
}
