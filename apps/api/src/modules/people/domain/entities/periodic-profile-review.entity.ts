export type PeriodicReviewStatus = 'pending' | 'completed' | 'skipped'

export interface PeriodicProfileReview {
  id: string
  tenantId: string
  profileId: string
  dueDate: Date
  status: PeriodicReviewStatus
  completedAt: Date | null
}
