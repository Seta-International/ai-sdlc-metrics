import type { Delegation } from '../entities/delegation.entity'

export const DELEGATION_REPOSITORY = Symbol('IDelegationRepository')

export interface IDelegationRepository {
  findActiveDelegationsForDelegatee(delegateeId: string, tenantId: string): Promise<Delegation[]>
}
