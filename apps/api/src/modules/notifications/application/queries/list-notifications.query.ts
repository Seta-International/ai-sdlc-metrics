import type { NotificationCategory } from '../../domain/value-objects/category.vo'

export class ListNotificationsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly recipientId: string,
    public readonly opts: {
      category?: NotificationCategory
      unreadOnly?: boolean
      limit: number
      offset: number
    },
  ) {}
}
