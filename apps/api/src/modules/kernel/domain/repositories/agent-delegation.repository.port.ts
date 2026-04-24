import type { AgentDelegation } from '../entities/agent-delegation.entity'

export const AGENT_DELEGATION_REPOSITORY = Symbol('IAgentDelegationRepository')

export interface IAgentDelegationRepository {
  insert(delegation: {
    tenantId: string
    delegatorUserId: string | null
    delegate: string
    scope: Record<string, unknown>
    expiresAt: Date
    status?: string
  }): Promise<{ id: string }>

  getById(opts: { tenantId: string; delegationId: string }): Promise<AgentDelegation | null>

  updateStatus(opts: {
    tenantId: string
    delegationId: string
    status: 'active' | 'expired' | 'revoked'
  }): Promise<void>

  countActiveByDelegator(opts: { tenantId: string; delegatorUserId: string }): Promise<number>

  listActiveByDelegator(opts: {
    tenantId: string
    delegatorUserId: string
  }): Promise<AgentDelegation[]>

  listActiveForTenant(opts: { tenantId: string }): Promise<AgentDelegation[]>

  sweepExpired(opts: { beforeDate: Date }): Promise<{
    expiredDelegationIds: string[]
    affectedTenantIds: string[]
  }>

  bulkRevokeByDelegator(opts: {
    tenantId: string
    delegatorUserId: string
    reason: string
  }): Promise<{ revokedIds: string[] }>
}
