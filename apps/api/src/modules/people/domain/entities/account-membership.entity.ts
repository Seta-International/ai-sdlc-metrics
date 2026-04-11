export type AccountMemberRole = 'account_manager' | 'staffing_owner' | 'member'

export interface AccountMembership {
  id: string
  tenantId: string
  accountId: string
  actorId: string
  roleKey: AccountMemberRole
  joinedAt: Date
  leftAt: Date | null
}
