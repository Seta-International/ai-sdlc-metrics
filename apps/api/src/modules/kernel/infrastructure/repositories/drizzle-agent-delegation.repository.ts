import { Inject, Injectable } from '@nestjs/common'
import { and, eq, lt } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentDelegation } from '../schema/agent-delegation.schema'
import type { AgentDelegationRow } from '../schema/agent-delegation.schema'
import type { IAgentDelegationRepository } from '../../domain/repositories/agent-delegation.repository.port'
import type { AgentDelegation } from '../../domain/entities/agent-delegation.entity'

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
        ...(delegation.status !== undefined ? { status: delegation.status } : {}),
      })
      .returning({ id: agentDelegation.id })

    return { id: row!.id }
  }

  async getById(opts: { tenantId: string; delegationId: string }): Promise<AgentDelegation | null> {
    const rows = await this.db
      .select()
      .from(agentDelegation)
      .where(
        and(eq(agentDelegation.tenantId, opts.tenantId), eq(agentDelegation.id, opts.delegationId)),
      )

    const row = rows[0]
    return row ? this.toDomain(row) : null
  }

  private toDomain(row: AgentDelegationRow): AgentDelegation {
    return {
      id: row.id,
      tenantId: row.tenantId,
      delegatorUserId: row.delegatorUserId,
      delegate: row.delegate,
      scope: row.scope as Record<string, unknown>,
      expiresAt: row.expiresAt,
      status: row.status as 'active' | 'expired' | 'revoked',
      autonomousWritesAllowed: row.autonomousWritesAllowed,
      createdAt: row.createdAt,
    }
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

  async countActiveByDelegator(opts: {
    tenantId: string
    delegatorUserId: string
  }): Promise<number> {
    const rows = await this.db
      .select({ id: agentDelegation.id })
      .from(agentDelegation)
      .where(
        and(
          eq(agentDelegation.tenantId, opts.tenantId),
          eq(agentDelegation.delegatorUserId, opts.delegatorUserId),
          eq(agentDelegation.status, 'active'),
        ),
      )
    return rows.length
  }

  async listActiveByDelegator(opts: {
    tenantId: string
    delegatorUserId: string
  }): Promise<AgentDelegation[]> {
    const rows = await this.db
      .select()
      .from(agentDelegation)
      .where(
        and(
          eq(agentDelegation.tenantId, opts.tenantId),
          eq(agentDelegation.delegatorUserId, opts.delegatorUserId),
          eq(agentDelegation.status, 'active'),
        ),
      )
    return rows.map((r) => this.toDomain(r))
  }

  async listActiveForTenant(opts: { tenantId: string }): Promise<AgentDelegation[]> {
    const rows = await this.db
      .select()
      .from(agentDelegation)
      .where(and(eq(agentDelegation.tenantId, opts.tenantId), eq(agentDelegation.status, 'active')))
    return rows.map((r) => this.toDomain(r))
  }

  async sweepExpired(opts: { beforeDate: Date }): Promise<{
    expiredDelegationIds: string[]
    affectedTenantIds: string[]
  }> {
    const rows = await this.db
      .update(agentDelegation)
      .set({ status: 'expired' })
      .where(
        and(eq(agentDelegation.status, 'active'), lt(agentDelegation.expiresAt, opts.beforeDate)),
      )
      .returning({ id: agentDelegation.id, tenantId: agentDelegation.tenantId })

    const expiredDelegationIds = rows.map((r) => r.id)
    const affectedTenantIds = [...new Set(rows.map((r) => r.tenantId))]
    return { expiredDelegationIds, affectedTenantIds }
  }

  async bulkRevokeByDelegator(opts: {
    tenantId: string
    delegatorUserId: string
    reason: string
  }): Promise<{ revokedIds: string[] }> {
    const rows = await this.db
      .update(agentDelegation)
      .set({ status: 'revoked' })
      .where(
        and(
          eq(agentDelegation.tenantId, opts.tenantId),
          eq(agentDelegation.delegatorUserId, opts.delegatorUserId),
          eq(agentDelegation.status, 'active'),
        ),
      )
      .returning({ id: agentDelegation.id })

    return { revokedIds: rows.map((r) => r.id) }
  }
}
