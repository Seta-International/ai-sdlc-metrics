import { Inject, Injectable } from '@nestjs/common'
import {
  AGENT_CHAT_SESSION_REPOSITORY,
  type AgentChatSessionRepository,
} from '../../domain/repositories/agent-chat-session.repository'
import type { AgentChatSessionEntity } from '../../domain/entities/agent-chat-session.entity'
import type { ListSessionsQuery } from './list-sessions.query'

@Injectable()
export class ListSessionsHandler {
  constructor(
    @Inject(AGENT_CHAT_SESSION_REPOSITORY)
    private readonly sessionRepo: AgentChatSessionRepository,
  ) {}

  async execute(query: ListSessionsQuery): Promise<AgentChatSessionEntity[]> {
    return this.sessionRepo.findByActor(query.actorId, query.tenantId, query.limit)
  }
}
