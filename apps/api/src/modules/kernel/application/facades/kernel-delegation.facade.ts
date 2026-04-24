import { Injectable, Inject } from '@nestjs/common'
import {
  AGENT_DELEGATION_REPOSITORY,
  type IAgentDelegationRepository,
} from '../../domain/repositories/agent-delegation.repository.port'
import type { AgentDelegationRow } from '../../infrastructure/schema/agent-delegation.schema'

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

  getDelegation(opts: {
    tenantId: string
    delegationId: string
  }): Promise<AgentDelegationRow | null> {
    return this.delegationRepo.getById(opts)
  }
}
