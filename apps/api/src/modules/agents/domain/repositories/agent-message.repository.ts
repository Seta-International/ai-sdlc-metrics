import type { AgentMessageEntity } from '../entities/agent-message.entity'

export interface AgentMessageRepository {
  create(message: Omit<AgentMessageEntity, 'id' | 'createdAt'>): Promise<AgentMessageEntity>
  findBySession(sessionId: string, tenantId: string): Promise<AgentMessageEntity[]>
}
export const AGENT_MESSAGE_REPOSITORY = Symbol('AGENT_MESSAGE_REPOSITORY')
