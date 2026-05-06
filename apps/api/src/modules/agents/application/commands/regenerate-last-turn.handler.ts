import { Inject, Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import {
  AGENT_MESSAGE_REPOSITORY,
  type AgentMessageRepository,
} from '../../domain/repositories/agent-message.repository'
import { SendMessageCommand } from './send-message.command'
import type { SendMessageHandler } from './send-message.handler'
import type { RegenerateLastTurnCommand } from './regenerate-last-turn.command'

@Injectable()
export class RegenerateLastTurnHandler {
  constructor(
    @Inject(AGENT_MESSAGE_REPOSITORY)
    private readonly messageRepo: AgentMessageRepository,
    private readonly sendMessageHandler: SendMessageHandler,
  ) {}

  async execute(command: RegenerateLastTurnCommand): Promise<{ newTurnId: string }> {
    const assistant = await this.messageRepo.findLastAssistant(command.tenantId, command.sessionId)
    if (!assistant) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'no assistant turn to regenerate' })
    }

    const priorUser = await this.messageRepo.findPriorUser(
      command.tenantId,
      command.sessionId,
      assistant.id,
    )
    if (!priorUser) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'no prior user turn to regenerate' })
    }

    await this.messageRepo.markSuperseded({ tenantId: command.tenantId, messageId: assistant.id })

    const newTurn = await this.sendMessageHandler.execute(
      new SendMessageCommand(command.tenantId, command.sessionId, 'user', priorUser.content),
    )
    return { newTurnId: newTurn.id }
  }
}
