import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, desc, eq } from 'drizzle-orm'
import type { AgentSessionEntity } from '../../domain/entities/agent-session.entity'
import type { AgentSessionRepository } from '../../domain/repositories/agent-session.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentSessions } from '../schema/agents.schema'

@Injectable()
export class DrizzleAgentSessionRepository implements AgentSessionRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async create(
    session: Omit<AgentSessionEntity, 'id' | 'createdAt' | 'endedAt'>,
  ): Promise<AgentSessionEntity> {
    const rows = await this.db.insert(agentSessions).values(session).returning()
    return rows[0] as AgentSessionEntity
  }

  async findById(id: string, tenantId: string): Promise<AgentSessionEntity | null> {
    const rows = await this.db
      .select()
      .from(agentSessions)
      .where(and(eq(agentSessions.id, id), eq(agentSessions.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as AgentSessionEntity | undefined) ?? null
  }

  async findByActor(
    actorId: string,
    tenantId: string,
    limit: number,
  ): Promise<AgentSessionEntity[]> {
    const rows = await this.db
      .select()
      .from(agentSessions)
      .where(and(eq(agentSessions.actorId, actorId), eq(agentSessions.tenantId, tenantId)))
      .orderBy(desc(agentSessions.createdAt))
      .limit(limit)
    return rows as AgentSessionEntity[]
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: AgentSessionEntity['status'],
  ): Promise<void> {
    await this.db
      .update(agentSessions)
      .set({ status, endedAt: status === 'active' ? null : new Date() })
      .where(and(eq(agentSessions.id, id), eq(agentSessions.tenantId, tenantId)))
  }
}
