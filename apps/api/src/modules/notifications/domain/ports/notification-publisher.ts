import type { Notification } from '../entities/notification.entity'

export interface NotificationPublisher {
  publish(tenantId: string, recipientId: string, notification: Notification): Promise<void>
}

export const NOTIFICATION_PUBLISHER = Symbol('NotificationPublisher')
