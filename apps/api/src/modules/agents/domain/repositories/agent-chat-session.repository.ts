import type { AgentChatSessionEntity } from '../entities/agent-chat-session.entity'

export interface AgentChatSessionRepository {
  create(
    session: Omit<AgentChatSessionEntity, 'id' | 'createdAt' | 'endedAt'>,
  ): Promise<AgentChatSessionEntity>
  findById(id: string, tenantId: string): Promise<AgentChatSessionEntity | null>
  findByActor(actorId: string, tenantId: string, limit: number): Promise<AgentChatSessionEntity[]>
  updateStatus(
    id: string,
    tenantId: string,
    status: AgentChatSessionEntity['status'],
  ): Promise<void>
}
export const AGENT_CHAT_SESSION_REPOSITORY = Symbol('AGENT_CHAT_SESSION_REPOSITORY')
