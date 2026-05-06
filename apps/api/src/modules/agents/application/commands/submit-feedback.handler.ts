import { Inject, Injectable } from '@nestjs/common'
import {
  MESSAGE_FEEDBACK_REPOSITORY,
  type MessageFeedbackRepository,
} from '../../domain/repositories/message-feedback.repository'
import type { SubmitFeedbackCommand } from './submit-feedback.command'

@Injectable()
export class SubmitFeedbackHandler {
  constructor(
    @Inject(MESSAGE_FEEDBACK_REPOSITORY)
    private readonly feedbackRepo: MessageFeedbackRepository,
  ) {}

  async execute(command: SubmitFeedbackCommand): Promise<void> {
    await this.feedbackRepo.upsert({
      tenantId: command.tenantId,
      messageId: command.messageId,
      actorId: command.actorId,
      rating: command.rating,
      note: command.note,
    })
  }
}
