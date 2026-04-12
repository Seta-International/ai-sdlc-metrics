export class InviteLocalUserCommand {
  constructor(
    readonly tenantId: string,
    readonly email: string,
    readonly displayName: string,
    readonly roleAssignments: Array<{
      roleKey: string
      scopeType: 'global' | 'department' | 'project' | 'account'
      scopeId: string | null
    }>,
    readonly invitedBy: string,
  ) {}
}
