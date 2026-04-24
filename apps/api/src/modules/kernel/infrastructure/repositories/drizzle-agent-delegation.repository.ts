import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentDelegation } from '../schema/agent-delegation.schema'
import type { AgentDelegationRow } from '../schema/agent-delegation.schema'
import type { IAgentDelegationRepository } from '../../domain/repositories/agent-delegation.repository.port'

@Injectable()
export class DrizzleAgentDelegationRepository implements IAgentDelegationRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(delegation: {
    tenantId: string
    delegatorUserId: string | null
    delegate: string
    scope: Record<string, unknown>
    expiresAt: Date
    status?: string
  }): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(agentDelegation)
      .values({
        tenantId: delegation.tenantId,
        delegatorUserId: delegation.delegatorUserId,
        delegate: delegation.delegate,
        scope: delegation.scope,
        expiresAt: delegation.expiresAt,
        ...(delegation.status ? { status: delegation.status } : {}),
      })
      .returning({ id: agentDelegation.id })

    return { id: row!.id }
  }

  async getById(opts: {
    tenantId: string
    delegationId: string
  }): Promise<AgentDelegationRow | null> {
    const rows = await this.db
      .select()
      .from(agentDelegation)
      .where(
        and(eq(agentDelegation.tenantId, opts.tenantId), eq(agentDelegation.id, opts.delegationId)),
      )

    return rows[0] ?? null
  }

  async updateStatus(opts: {
    tenantId: string
    delegationId: string
    status: 'active' | 'expired' | 'revoked'
  }): Promise<void> {
    await this.db
      .update(agentDelegation)
      .set({ status: opts.status })
      .where(
        and(eq(agentDelegation.tenantId, opts.tenantId), eq(agentDelegation.id, opts.delegationId)),
      )
  }
}
