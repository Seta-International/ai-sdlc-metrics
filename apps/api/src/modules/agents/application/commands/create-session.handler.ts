import { Inject, Injectable } from '@nestjs/common'
import {
  AGENT_CHAT_SESSION_REPOSITORY,
  type AgentChatSessionRepository,
} from '../../domain/repositories/agent-chat-session.repository'
import type { AgentChatSessionEntity } from '../../domain/entities/agent-chat-session.entity'
import type { CreateSessionCommand } from './create-session.command'

@Injectable()
export class CreateSessionHandler {
  constructor(
    @Inject(AGENT_CHAT_SESSION_REPOSITORY)
    private readonly sessionRepo: AgentChatSessionRepository,
  ) {}

  async execute(command: CreateSessionCommand): Promise<AgentChatSessionEntity> {
    return this.sessionRepo.create({
      tenantId: command.tenantId,
      actorId: command.actorId,
      agentId: null,
      channelType: 'web_chat',
      status: 'active',
      contextModule: command.contextModule ?? null,
      contextEntity: command.contextEntity ?? null,
      contextEntityId: command.contextEntityId ?? null,
      contextMetadata: command.contextMetadata ?? null,
    })
  }
}
