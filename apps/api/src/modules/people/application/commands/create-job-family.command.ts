export class CreateJobFamilyCommand {
  constructor(
    readonly tenantId: string,
    readonly name: string,
    readonly createdBy: string,
    readonly description?: string | null,
    readonly parentId?: string | null,
  ) {}
}
