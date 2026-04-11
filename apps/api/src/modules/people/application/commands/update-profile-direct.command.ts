export class UpdateProfileDirectCommand {
  constructor(
    readonly tenantId: string,
    readonly profileId: string,
    readonly updatedBy: string,
    readonly fields: Record<string, unknown>,
  ) {}
}
