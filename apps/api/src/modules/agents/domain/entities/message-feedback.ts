export type FeedbackRating = 'up' | 'down'

export interface MessageFeedback {
  tenantId: string
  messageId: string
  actorId: string
  rating: FeedbackRating
  note: string | null
  createdAt: Date
}
