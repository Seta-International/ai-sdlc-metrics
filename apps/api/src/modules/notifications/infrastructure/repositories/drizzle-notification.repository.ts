import { Inject, Injectable } from '@nestjs/common'
import { and, eq, isNull, inArray, count } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import type { Notification } from '../../domain/entities/notification.entity'
import type { NotificationPreference } from '../../domain/entities/notification-preference.entity'
import type { NotificationCategory } from '../../domain/value-objects/category.vo'
import { notification, notificationPreference } from '../schema/notifications.schema'

@Injectable()
export class DrizzleNotificationRepository implements INotificationRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(
    data: Omit<Notification, 'id' | 'readAt' | 'archivedAt' | 'createdAt'>,
  ): Promise<Notification> {
    const rows = await this.db
      .insert(notification)
      .values({
        tenantId: data.tenantId,
        recipientId: data.recipientId,
        senderId: data.senderId ?? undefined,
        category: data.category,
        title: data.title,
        body: data.body ?? undefined,
        resourceType: data.resourceType ?? undefined,
        resourceId: data.resourceId ?? undefined,
        resourceUrl: data.resourceUrl ?? undefined,
      })
      .returning()
    return rows[0] as Notification
  }

  async findByRecipient(
    tenantId: string,
    recipientId: string,
    opts: { category?: NotificationCategory; unreadOnly?: boolean; limit: number; offset: number },
  ): Promise<Notification[]> {
    const conditions = [
      eq(notification.tenantId, tenantId),
      eq(notification.recipientId, recipientId),
      isNull(notification.archivedAt),
    ]
    if (opts.category) conditions.push(eq(notification.category, opts.category))
    if (opts.unreadOnly) conditions.push(isNull(notification.readAt))

    const rows = await this.db
      .select()
      .from(notification)
      .where(and(...conditions))
      .limit(opts.limit)
      .offset(opts.offset)
    return rows as Notification[]
  }

  async countUnread(tenantId: string, recipientId: string): Promise<number> {
    const result = await this.db
      .select({ value: count() })
      .from(notification)
      .where(
        and(
          eq(notification.tenantId, tenantId),
          eq(notification.recipientId, recipientId),
          isNull(notification.readAt),
          isNull(notification.archivedAt),
        ),
      )
    return Number(result[0]?.value ?? 0)
  }

  async markRead(tenantId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await this.db
      .update(notification)
      .set({ readAt: new Date() })
      .where(and(eq(notification.tenantId, tenantId), inArray(notification.id, ids)))
  }

  async markAllRead(tenantId: string, recipientId: string): Promise<void> {
    await this.db
      .update(notification)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notification.tenantId, tenantId),
          eq(notification.recipientId, recipientId),
          isNull(notification.readAt),
        ),
      )
  }

  async archive(tenantId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await this.db
      .update(notification)
      .set({ archivedAt: new Date() })
      .where(and(eq(notification.tenantId, tenantId), inArray(notification.id, ids)))
  }

  async getPreference(
    tenantId: string,
    actorId: string,
    category: NotificationCategory,
  ): Promise<NotificationPreference | null> {
    const rows = await this.db
      .select()
      .from(notificationPreference)
      .where(
        and(
          eq(notificationPreference.tenantId, tenantId),
          eq(notificationPreference.actorId, actorId),
          eq(notificationPreference.category, category),
        ),
      )
      .limit(1)
    return (rows[0] as NotificationPreference | undefined) ?? null
  }

  async upsertPreference(
    data: Omit<NotificationPreference, 'id'>,
  ): Promise<NotificationPreference> {
    const rows = await this.db
      .insert(notificationPreference)
      .values({
        tenantId: data.tenantId,
        actorId: data.actorId,
        category: data.category,
        inApp: data.inApp,
        email: data.email,
      })
      .onConflictDoUpdate({
        target: [
          notificationPreference.tenantId,
          notificationPreference.actorId,
          notificationPreference.category,
        ],
        set: { inApp: data.inApp, email: data.email },
      })
      .returning()
    return rows[0] as NotificationPreference
  }

  async getPreferences(tenantId: string, actorId: string): Promise<NotificationPreference[]> {
    const rows = await this.db
      .select()
      .from(notificationPreference)
      .where(
        and(
          eq(notificationPreference.tenantId, tenantId),
          eq(notificationPreference.actorId, actorId),
        ),
      )
    return rows as NotificationPreference[]
  }
}
