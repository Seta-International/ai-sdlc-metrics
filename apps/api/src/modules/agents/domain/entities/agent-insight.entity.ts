export interface AgentInsightEntity {
  id: string
  tenantId: string
  actorId: string
  module: string
  entity: string
  entityId: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  description: string
  actionLabel: string | null
  actionHref: string | null
  isDismissed: boolean
  createdAt: Date
}
