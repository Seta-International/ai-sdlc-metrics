import { Inject, Injectable } from '@nestjs/common'
import {
  AGENT_INSIGHT_REPOSITORY,
  type AgentInsightRepository,
} from '../../domain/repositories/agent-insight.repository'
import type { AgentInsightEntity } from '../../domain/entities/agent-insight.entity'
import type { ListInsightsQuery } from './list-insights.query'

@Injectable()
export class ListInsightsHandler {
  constructor(
    @Inject(AGENT_INSIGHT_REPOSITORY)
    private readonly insightRepo: AgentInsightRepository,
  ) {}

  async execute(query: ListInsightsQuery): Promise<AgentInsightEntity[]> {
    return this.insightRepo.findByActor(query.actorId, query.tenantId)
  }
}
