export class ConfirmProbationCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly confirmedBy: string,
    readonly note?: string,
  ) {}
}
