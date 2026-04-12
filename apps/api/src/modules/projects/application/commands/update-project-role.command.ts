export class UpdateProjectRoleCommand {
  constructor(
    readonly tenantId: string,
    readonly projectRoleId: string,
    readonly data: {
      roleName?: string
      skillsRequired?: string[] | null
      headcount?: number
    },
  ) {}
}
