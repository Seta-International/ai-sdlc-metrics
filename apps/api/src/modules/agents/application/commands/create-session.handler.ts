import { Inject, Injectable } from '@nestjs/common'
import {
  AGENT_SESSION_REPOSITORY,
  type AgentSessionRepository,
} from '../../domain/repositories/agent-session.repository'
import type { AgentSessionEntity } from '../../domain/entities/agent-session.entity'
import type { CreateSessionCommand } from './create-session.command'

@Injectable()
export class CreateSessionHandler {
  constructor(
    @Inject(AGENT_SESSION_REPOSITORY)
    private readonly sessionRepo: AgentSessionRepository,
  ) {}

  async execute(command: CreateSessionCommand): Promise<AgentSessionEntity> {
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
