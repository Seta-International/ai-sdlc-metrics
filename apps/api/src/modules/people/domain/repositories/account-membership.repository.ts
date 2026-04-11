import { AccountMembership } from '../entities/account-membership.entity'

export const ACCOUNT_MEMBERSHIP_REPOSITORY = Symbol('IAccountMembershipRepository')

export interface IAccountMembershipRepository {
  findActiveByActorId(actorId: string, tenantId: string): Promise<AccountMembership[]>
  closeAllForActor(actorId: string, tenantId: string, leftAt: Date): Promise<void>
  insert(data: Omit<AccountMembership, 'id'>): Promise<AccountMembership>
  remove(id: string, tenantId: string, leftAt: Date): Promise<void>
}
