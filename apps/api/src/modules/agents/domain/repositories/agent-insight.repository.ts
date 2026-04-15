import type { AgentInsightEntity } from '../entities/agent-insight.entity'

export interface AgentInsightRepository {
  create(
    insight: Omit<AgentInsightEntity, 'id' | 'createdAt' | 'isDismissed'>,
  ): Promise<AgentInsightEntity>
  findByActor(actorId: string, tenantId: string): Promise<AgentInsightEntity[]>
  dismiss(id: string, tenantId: string): Promise<void>
}
export const AGENT_INSIGHT_REPOSITORY = Symbol('AGENT_INSIGHT_REPOSITORY')
