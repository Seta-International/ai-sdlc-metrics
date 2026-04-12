import type { NotificationCategory } from '../../domain/value-objects/category.vo'

export class SendNotificationCommand {
  constructor(
    public readonly tenantId: string,
    public readonly recipientId: string,
    public readonly senderId: string | null,
    public readonly category: NotificationCategory,
    public readonly title: string,
    public readonly body: string | null,
    public readonly resourceType: string | null,
    public readonly resourceId: string | null,
    public readonly resourceUrl: string | null,
  ) {}
}
