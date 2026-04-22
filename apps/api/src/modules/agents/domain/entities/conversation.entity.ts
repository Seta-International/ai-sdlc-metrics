export interface ConversationEntity {
  id: string
  tenantId: string
  userId: string
  surface: string
  status: 'active' | 'archived'
  title: string | null
  lastUserTurnAt: Date | null
  updatedAt: Date
  archivedAt: Date | null
  summaryFailureStreak: number
  summaryDisabledAt: Date | null
}
