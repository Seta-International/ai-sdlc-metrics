import type { AgentMessageEntity } from '../entities/agent-message.entity'

export interface AgentMessageRepository {
  create(message: Omit<AgentMessageEntity, 'id' | 'createdAt'>): Promise<AgentMessageEntity>
  findBySession(sessionId: string, tenantId: string): Promise<AgentMessageEntity[]>
  findLastAssistant(tenantId: string, sessionId: string): Promise<AgentMessageEntity | null>
  findPriorUser(
    tenantId: string,
    sessionId: string,
    beforeMessageId: string,
  ): Promise<AgentMessageEntity | null>
  markSuperseded(input: { tenantId: string; messageId: string }): Promise<void>
}
export const AGENT_MESSAGE_REPOSITORY = Symbol('AGENT_MESSAGE_REPOSITORY')
