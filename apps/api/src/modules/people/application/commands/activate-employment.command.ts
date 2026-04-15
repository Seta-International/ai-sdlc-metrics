export class ActivateEmploymentCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly activatedBy: string,
  ) {}
}
