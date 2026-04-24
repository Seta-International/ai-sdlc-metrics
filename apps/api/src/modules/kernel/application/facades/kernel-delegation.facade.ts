import { Injectable, Inject } from '@nestjs/common'
import {
  AGENT_DELEGATION_REPOSITORY,
  type IAgentDelegationRepository,
} from '../../domain/repositories/agent-delegation.repository.port'
import type { AgentDelegation } from '../../domain/entities/agent-delegation.entity'

// Re-export so consumers outside the kernel module never need to import from domain/
export type { AgentDelegation }

/**
 * KernelDelegationFacade — the only cross-module write interface for agent delegation grants.
 * Other modules must NOT inject AGENT_DELEGATION_REPOSITORY directly.
 */
@Injectable()
export class KernelDelegationFacade {
  constructor(
    @Inject(AGENT_DELEGATION_REPOSITORY)
    private readonly delegationRepo: IAgentDelegationRepository,
  ) {}

  createDelegation(opts: {
    tenantId: string
    delegatorUserId: string | null
    delegate: 'agent:approval-executor' | 'agent:scheduler'
    scope: Record<string, unknown>
    expiresAt: Date
  }): Promise<{ id: string }> {
    return this.delegationRepo.insert(opts)
  }

  async revokeDelegation(opts: {
    tenantId: string
    delegationId: string
    reason: string
  }): Promise<void> {
    // reason is recorded by callers via audit trail; revocation itself only flips status
    await this.delegationRepo.updateStatus({
      tenantId: opts.tenantId,
      delegationId: opts.delegationId,
      status: 'revoked',
    })
  }

  getDelegation(opts: { tenantId: string; delegationId: string }): Promise<AgentDelegation | null> {
    return this.delegationRepo.getById(opts)
  }

  countActiveByDelegator(opts: { tenantId: string; delegatorUserId: string }): Promise<number> {
    return this.delegationRepo.countActiveByDelegator(opts)
  }

  listActiveByDelegator(opts: {
    tenantId: string
    delegatorUserId: string
  }): Promise<AgentDelegation[]> {
    return this.delegationRepo.listActiveByDelegator(opts)
  }

  listActiveForTenant(opts: { tenantId: string }): Promise<AgentDelegation[]> {
    return this.delegationRepo.listActiveForTenant(opts)
  }

  sweepExpired(opts: { beforeDate: Date }): Promise<{
    expiredDelegationIds: string[]
    affectedTenantIds: string[]
  }> {
    return this.delegationRepo.sweepExpired(opts)
  }

  bulkRevokeByDelegator(opts: {
    tenantId: string
    delegatorUserId: string
    reason: string
  }): Promise<{ revokedIds: string[] }> {
    return this.delegationRepo.bulkRevokeByDelegator(opts)
  }
}
