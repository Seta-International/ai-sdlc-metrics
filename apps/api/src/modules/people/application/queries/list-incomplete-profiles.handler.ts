import { Inject } from '@nestjs/common'
import { QueryBus, QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  GetProfileCompletenessQuery,
  type CompletenessResult,
} from './get-profile-completeness.query'
import {
  ListIncompleteProfilesQuery,
  type IncompleteProfileResult,
} from './list-incomplete-profiles.query'

@QueryHandler(ListIncompleteProfilesQuery)
export class ListIncompleteProfilesHandler implements IQueryHandler<
  ListIncompleteProfilesQuery,
  IncompleteProfileResult[]
> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: ListIncompleteProfilesQuery): Promise<IncompleteProfileResult[]> {
    const employments = await this.employmentRepo.listByTenant(query.tenantId, {
      status: 'active',
    })

    const results: IncompleteProfileResult[] = []
    for (const employment of employments) {
      const completeness: CompletenessResult = await this.queryBus.execute(
        new GetProfileCompletenessQuery(query.tenantId, employment.id),
      )
      if (completeness.score < query.threshold) {
        results.push({
          employmentId: employment.id,
          score: completeness.score,
          filled: completeness.filled,
          total: completeness.total,
        })
      }
    }

    return results
  }
}
