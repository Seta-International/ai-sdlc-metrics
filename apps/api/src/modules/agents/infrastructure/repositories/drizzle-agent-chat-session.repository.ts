import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, desc, eq } from 'drizzle-orm'
import type { AgentChatSessionEntity } from '../../domain/entities/agent-chat-session.entity'
import type { AgentChatSessionRepository } from '../../domain/repositories/agent-chat-session.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentChatSessions } from '../schema/agents.schema'

@Injectable()
export class DrizzleAgentChatSessionRepository implements AgentChatSessionRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async create(
    session: Omit<AgentChatSessionEntity, 'id' | 'createdAt' | 'endedAt'>,
  ): Promise<AgentChatSessionEntity> {
    const rows = await this.db.insert(agentChatSessions).values(session).returning()
    return rows[0] as AgentChatSessionEntity
  }

  async findById(id: string, tenantId: string): Promise<AgentChatSessionEntity | null> {
    const rows = await this.db
      .select()
      .from(agentChatSessions)
      .where(and(eq(agentChatSessions.id, id), eq(agentChatSessions.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as AgentChatSessionEntity | undefined) ?? null
  }

  async findByActor(
    actorId: string,
    tenantId: string,
    limit: number,
  ): Promise<AgentChatSessionEntity[]> {
    const rows = await this.db
      .select()
      .from(agentChatSessions)
      .where(and(eq(agentChatSessions.actorId, actorId), eq(agentChatSessions.tenantId, tenantId)))
      .orderBy(desc(agentChatSessions.createdAt))
      .limit(limit)
    return rows as AgentChatSessionEntity[]
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: AgentChatSessionEntity['status'],
  ): Promise<void> {
    await this.db
      .update(agentChatSessions)
      .set({ status, endedAt: status === 'active' ? null : new Date() })
      .where(and(eq(agentChatSessions.id, id), eq(agentChatSessions.tenantId, tenantId)))
  }
}
