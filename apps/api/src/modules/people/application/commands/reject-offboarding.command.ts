export class RejectOffboardingCommand {
  constructor(
    readonly tenantId: string,
    readonly offboardingCaseId: string,
    readonly rejectedBy: string,
    readonly comment: string,
  ) {}
}
