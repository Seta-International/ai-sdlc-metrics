import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, asc, eq } from 'drizzle-orm'
import type { AgentMessageEntity } from '../../domain/entities/agent-message.entity'
import type { AgentMessageRepository } from '../../domain/repositories/agent-message.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentChatMessages } from '../schema/agents.schema'

@Injectable()
export class DrizzleAgentMessageRepository implements AgentMessageRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async create(message: Omit<AgentMessageEntity, 'id' | 'createdAt'>): Promise<AgentMessageEntity> {
    const rows = await this.db.insert(agentChatMessages).values(message).returning()
    return rows[0] as AgentMessageEntity
  }

  async findBySession(sessionId: string, tenantId: string): Promise<AgentMessageEntity[]> {
    const rows = await this.db
      .select()
      .from(agentChatMessages)
      .where(
        and(eq(agentChatMessages.sessionId, sessionId), eq(agentChatMessages.tenantId, tenantId)),
      )
      .orderBy(asc(agentChatMessages.createdAt))
    return rows as AgentMessageEntity[]
  }
}
