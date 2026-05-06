import type { FeedbackRating, MessageFeedback } from '../entities/message-feedback'

export interface MessageFeedbackRepository {
  upsert(input: {
    tenantId: string
    messageId: string
    actorId: string
    rating: FeedbackRating
    note?: string | null
  }): Promise<MessageFeedback>
}

export const MESSAGE_FEEDBACK_REPOSITORY = Symbol('MESSAGE_FEEDBACK_REPOSITORY')
