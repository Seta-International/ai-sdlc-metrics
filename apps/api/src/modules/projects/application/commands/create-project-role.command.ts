export class CreateProjectRoleCommand {
  constructor(
    readonly tenantId: string,
    readonly projectId: string,
    readonly roleName: string,
    readonly skillsRequired: string[] | null,
    readonly headcount: number,
  ) {}
}
