export type FeedbackRating = 'up' | 'down'

export class SubmitFeedbackCommand {
  constructor(
    readonly tenantId: string,
    readonly messageId: string,
    readonly actorId: string,
    readonly rating: FeedbackRating,
    readonly note?: string,
  ) {}
}
