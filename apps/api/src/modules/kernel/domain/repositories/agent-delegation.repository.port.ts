import type { AgentDelegationRow } from '../../infrastructure/schema/agent-delegation.schema'

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

  getById(opts: { tenantId: string; delegationId: string }): Promise<AgentDelegationRow | null>

  updateStatus(opts: {
    tenantId: string
    delegationId: string
    status: 'active' | 'expired' | 'revoked'
  }): Promise<void>
}
