export class CreateJobProfileCommand {
  constructor(
    readonly tenantId: string,
    readonly jobFamilyId: string,
    readonly title: string,
    readonly createdBy: string,
    readonly level?: string | null,
    readonly description?: string | null,
  ) {}
}
