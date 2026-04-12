export class NotificationSentEvent {
  static readonly eventName = 'notifications.notification-sent'
  constructor(
    public readonly tenantId: string,
    public readonly notificationId: string,
    public readonly recipientId: string,
    public readonly category: string,
  ) {}
}
