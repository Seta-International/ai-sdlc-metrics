import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import {
  AGENT_SESSION_REPOSITORY,
  type AgentSessionRepository,
} from '../../domain/repositories/agent-session.repository'
import {
  AGENT_MESSAGE_REPOSITORY,
  type AgentMessageRepository,
} from '../../domain/repositories/agent-message.repository'
import type { AgentMessageEntity } from '../../domain/entities/agent-message.entity'
import type { SendMessageCommand } from './send-message.command'

@Injectable()
export class SendMessageHandler {
  constructor(
    @Inject(AGENT_SESSION_REPOSITORY)
    private readonly sessionRepo: AgentSessionRepository,
    @Inject(AGENT_MESSAGE_REPOSITORY)
    private readonly messageRepo: AgentMessageRepository,
  ) {}

  async execute(command: SendMessageCommand): Promise<AgentMessageEntity> {
    const session = await this.sessionRepo.findById(command.sessionId, command.tenantId)
    if (!session) {
      throw new NotFoundException(`Session ${command.sessionId} not found`)
    }

    return this.messageRepo.create({
      sessionId: command.sessionId,
      tenantId: command.tenantId,
      role: command.role,
      content: command.content,
      toolName: command.toolName ?? null,
      toolArgs: command.toolArgs ?? null,
      modelUsed: command.modelUsed ?? null,
      tokensUsed: command.tokensUsed ?? null,
      isError: command.isError ?? false,
    })
  }
}
