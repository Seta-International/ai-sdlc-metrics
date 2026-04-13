import { pgSchema, uuid, text, timestamp, boolean, uniqueIndex } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const notificationsSchema = pgSchema('notifications')

export const notification = notificationsSchema.table('notification', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  recipientId: uuid('recipient_id').notNull(),
  senderId: uuid('sender_id'),
  category: text('category', { enum: ['approval', 'mention', 'assignment', 'system'] }).notNull(),
  title: text('title').notNull(),
  body: text('body'),
  resourceType: text('resource_type'),
  resourceId: uuid('resource_id'),
  resourceUrl: text('resource_url'),
  readAt: timestamp('read_at'),
  archivedAt: timestamp('archived_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const notificationPreference = notificationsSchema.table(
  'notification_preference',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    category: text('category', {
      enum: ['approval', 'mention', 'assignment', 'system'],
    }).notNull(),
    inApp: boolean('in_app').notNull().default(true),
    email: boolean('email').notNull().default(true),
  },
  (t) => [uniqueIndex('uq_notification_preference').on(t.tenantId, t.actorId, t.category)],
)
