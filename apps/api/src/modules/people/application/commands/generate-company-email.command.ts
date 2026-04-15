export class GenerateCompanyEmailCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly overrideEmail?: string | null,
  ) {}
}
