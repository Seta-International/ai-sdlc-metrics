export class GenerateShareLinkCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly createdBy: string,
    readonly expiresInDays: number = 7,
    readonly maxViews?: number | null,
  ) {}
}
