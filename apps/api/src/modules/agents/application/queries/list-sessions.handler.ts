import { Inject, Injectable } from '@nestjs/common'
import {
  AGENT_SESSION_REPOSITORY,
  type AgentSessionRepository,
} from '../../domain/repositories/agent-session.repository'
import type { AgentSessionEntity } from '../../domain/entities/agent-session.entity'
import type { ListSessionsQuery } from './list-sessions.query'

@Injectable()
export class ListSessionsHandler {
  constructor(
    @Inject(AGENT_SESSION_REPOSITORY)
    private readonly sessionRepo: AgentSessionRepository,
  ) {}

  async execute(query: ListSessionsQuery): Promise<AgentSessionEntity[]> {
    return this.sessionRepo.findByActor(query.actorId, query.tenantId, query.limit)
  }
}
