export class FailProbationCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly failedBy: string,
    readonly note?: string,
  ) {}
}
