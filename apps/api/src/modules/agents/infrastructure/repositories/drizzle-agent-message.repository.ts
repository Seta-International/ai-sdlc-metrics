import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, asc, desc, eq, isNull, lt } from 'drizzle-orm'
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

  async findLastAssistant(tenantId: string, sessionId: string): Promise<AgentMessageEntity | null> {
    const rows = await this.db
      .select()
      .from(agentChatMessages)
      .where(
        and(
          eq(agentChatMessages.tenantId, tenantId),
          eq(agentChatMessages.sessionId, sessionId),
          eq(agentChatMessages.role, 'assistant'),
          isNull(agentChatMessages.supersededAt),
        ),
      )
      .orderBy(desc(agentChatMessages.createdAt))
      .limit(1)
    return (rows[0] as AgentMessageEntity | undefined) ?? null
  }

  async findPriorUser(
    tenantId: string,
    sessionId: string,
    beforeMessageId: string,
  ): Promise<AgentMessageEntity | null> {
    const anchor = await this.db
      .select({ createdAt: agentChatMessages.createdAt })
      .from(agentChatMessages)
      .where(
        and(eq(agentChatMessages.id, beforeMessageId), eq(agentChatMessages.tenantId, tenantId)),
      )
      .limit(1)
    if (!anchor[0]) return null

    const rows = await this.db
      .select()
      .from(agentChatMessages)
      .where(
        and(
          eq(agentChatMessages.tenantId, tenantId),
          eq(agentChatMessages.sessionId, sessionId),
          eq(agentChatMessages.role, 'user'),
          lt(agentChatMessages.createdAt, anchor[0].createdAt),
        ),
      )
      .orderBy(desc(agentChatMessages.createdAt))
      .limit(1)
    return (rows[0] as AgentMessageEntity | undefined) ?? null
  }

  async markSuperseded(input: { tenantId: string; messageId: string }): Promise<void> {
    await this.db
      .update(agentChatMessages)
      .set({ supersededAt: new Date() })
      .where(
        and(
          eq(agentChatMessages.tenantId, input.tenantId),
          eq(agentChatMessages.id, input.messageId),
        ),
      )
  }
}
