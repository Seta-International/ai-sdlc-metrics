import {
  PeriodicProfileReview,
  PeriodicReviewStatus,
} from '../entities/periodic-profile-review.entity'

export const PERIODIC_PROFILE_REVIEW_REPOSITORY = Symbol('IPeriodicProfileReviewRepository')

export interface IPeriodicProfileReviewRepository {
  findById(id: string, tenantId: string): Promise<PeriodicProfileReview | null>
  findPendingByProfileId(profileId: string, tenantId: string): Promise<PeriodicProfileReview[]>
  insert(data: {
    tenantId: string
    profileId: string
    dueDate: Date
  }): Promise<PeriodicProfileReview>
  updateStatus(
    id: string,
    tenantId: string,
    status: PeriodicReviewStatus,
    completedAt?: Date,
  ): Promise<void>
}
