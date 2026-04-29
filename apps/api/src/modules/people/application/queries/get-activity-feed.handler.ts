import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { GetActivityFeedQuery } from './get-activity-feed.query'

export type ActivityFeedResult = {
  events: ActivityEventResult[]
  nextCursor: string | null
}

export type ActivityEventResult = {
  id: string
  eventType: string
  description: string
  actorName: string
  occurredAt: string
}

// TODO: replace with real outbox_event query once activity logging is wired
@QueryHandler(GetActivityFeedQuery)
export class GetActivityFeedHandler implements IQueryHandler<
  GetActivityFeedQuery,
  ActivityFeedResult
> {
  async execute(_query: GetActivityFeedQuery): Promise<ActivityFeedResult> {
    return {
      events: [
        {
          id: 'evt-1',
          eventType: 'promotion',
          description: 'Promoted to Staff Engineer · L6',
          actorName: 'Mei Chen',
          occurredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'evt-2',
          eventType: 'document',
          description: 'Document uploaded: Tax 2025',
          actorName: 'Diego Ribeiro',
          occurredAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'evt-3',
          eventType: 'org_change',
          description: 'Manager changed to Mei Chen',
          actorName: 'Ana Silva',
          occurredAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
      nextCursor: null,
    }
  }
}
