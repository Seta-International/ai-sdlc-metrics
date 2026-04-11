import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  PERIODIC_PROFILE_REVIEW_REPOSITORY,
  type IPeriodicProfileReviewRepository,
} from '../../domain/repositories/periodic-profile-review.repository'
import {
  EMPLOYMENT_PROFILE_REPOSITORY,
  type IEmploymentProfileRepository,
} from '../../domain/repositories/employment-profile.repository'
import type { PeriodicProfileReview } from '../../domain/entities/periodic-profile-review.entity'
import { ListPeriodicReviewsQuery } from './list-periodic-reviews.query'

@QueryHandler(ListPeriodicReviewsQuery)
export class ListPeriodicReviewsHandler implements IQueryHandler<
  ListPeriodicReviewsQuery,
  PeriodicProfileReview[]
> {
  constructor(
    @Inject(PERIODIC_PROFILE_REVIEW_REPOSITORY)
    private readonly periodicReviewRepo: IPeriodicProfileReviewRepository,
    @Inject(EMPLOYMENT_PROFILE_REPOSITORY)
    private readonly profileRepo: IEmploymentProfileRepository,
  ) {}

  async execute(query: ListPeriodicReviewsQuery): Promise<PeriodicProfileReview[]> {
    const profiles = await this.profileRepo.listByTenant(query.tenantId)

    const reviewsPerProfile = await Promise.all(
      profiles.map((profile) =>
        this.periodicReviewRepo.findPendingByProfileId(profile.id, query.tenantId),
      ),
    )

    return reviewsPerProfile.flat()
  }
}
