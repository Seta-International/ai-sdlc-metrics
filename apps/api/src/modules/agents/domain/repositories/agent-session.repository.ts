import type { AgentSessionEntity } from '../entities/agent-session.entity'

export interface AgentSessionRepository {
  create(
    session: Omit<AgentSessionEntity, 'id' | 'createdAt' | 'endedAt'>,
  ): Promise<AgentSessionEntity>
  findById(id: string, tenantId: string): Promise<AgentSessionEntity | null>
  findByActor(actorId: string, tenantId: string, limit: number): Promise<AgentSessionEntity[]>
  updateStatus(id: string, tenantId: string, status: AgentSessionEntity['status']): Promise<void>
}
export const AGENT_SESSION_REPOSITORY = Symbol('AGENT_SESSION_REPOSITORY')
