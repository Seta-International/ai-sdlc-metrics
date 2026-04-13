import type { Notification } from '../entities/notification.entity'
import type { NotificationPreference } from '../entities/notification-preference.entity'
import type { NotificationCategory } from '../value-objects/category.vo'

export interface INotificationRepository {
  insert(
    notification: Omit<Notification, 'id' | 'readAt' | 'archivedAt' | 'createdAt'>,
  ): Promise<Notification>
  findByRecipient(
    tenantId: string,
    recipientId: string,
    opts: { category?: NotificationCategory; unreadOnly?: boolean; limit: number; offset: number },
  ): Promise<Notification[]>
  countUnread(tenantId: string, recipientId: string): Promise<number>
  markRead(tenantId: string, ids: string[]): Promise<void>
  markAllRead(tenantId: string, recipientId: string): Promise<void>
  archive(tenantId: string, ids: string[]): Promise<void>
  getPreference(
    tenantId: string,
    actorId: string,
    category: NotificationCategory,
  ): Promise<NotificationPreference | null>
  upsertPreference(data: Omit<NotificationPreference, 'id'>): Promise<NotificationPreference>
  getPreferences(tenantId: string, actorId: string): Promise<NotificationPreference[]>
}

export const NOTIFICATION_REPOSITORY = Symbol('INotificationRepository')
