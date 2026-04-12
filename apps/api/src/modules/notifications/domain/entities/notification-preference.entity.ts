import type { NotificationCategory } from '../value-objects/category.vo'

export interface NotificationPreference {
  id: string
  tenantId: string
  actorId: string
  category: NotificationCategory
  inApp: boolean
  email: boolean
}
