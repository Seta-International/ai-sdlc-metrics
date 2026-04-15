export class ExtendProbationCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly newEndDate: Date,
    readonly extendedBy: string,
    readonly note?: string,
  ) {}
}
