export class ReinstateSuspensionCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly reason: string,
    readonly initiatedBy: string,
  ) {}
}
