import type { NotificationCategory } from '../value-objects/category.vo'

export interface Notification {
  id: string
  tenantId: string
  recipientId: string
  senderId: string | null
  category: NotificationCategory
  title: string
  body: string | null
  resourceType: string | null
  resourceId: string | null
  resourceUrl: string | null
  readAt: Date | null
  archivedAt: Date | null
  createdAt: Date
}
