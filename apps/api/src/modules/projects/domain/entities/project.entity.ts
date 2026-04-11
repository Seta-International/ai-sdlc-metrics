export type DeliveryModel = 'scrum' | 'kanban' | 'waterfall' | 'other'
export type ProjectStatus = 'active' | 'on_hold' | 'closed' | 'tentative'

export interface Project {
  id: string
  tenantId: string
  accountId: string
  name: string
  code: string | null
  description: string | null
  deliveryModel: DeliveryModel | null
  status: ProjectStatus
  startedAt: Date | null
  endedAt: Date | null
  tags: unknown
  createdAt: Date
  updatedAt: Date
}
