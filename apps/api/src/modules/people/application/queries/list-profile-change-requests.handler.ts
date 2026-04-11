import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  EMPLOYMENT_PROFILE_REPOSITORY,
  type IEmploymentProfileRepository,
} from '../../domain/repositories/employment-profile.repository'
import {
  PROFILE_CHANGE_REQUEST_REPOSITORY,
  type IProfileChangeRequestRepository,
} from '../../domain/repositories/profile-change-request.repository'
import type { ProfileChangeRequest } from '../../domain/entities/profile-change-request.entity'
import { ListProfileChangeRequestsQuery } from './list-profile-change-requests.query'

@QueryHandler(ListProfileChangeRequestsQuery)
export class ListProfileChangeRequestsHandler implements IQueryHandler<
  ListProfileChangeRequestsQuery,
  ProfileChangeRequest[]
> {
  constructor(
    @Inject(EMPLOYMENT_PROFILE_REPOSITORY)
    private readonly profileRepo: IEmploymentProfileRepository,
    @Inject(PROFILE_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRequestRepo: IProfileChangeRequestRepository,
  ) {}

  async execute(query: ListProfileChangeRequestsQuery): Promise<ProfileChangeRequest[]> {
    const profiles = await this.profileRepo.listByTenant(query.tenantId)

    const requestsPerProfile = await Promise.all(
      profiles.map((profile) => this.changeRequestRepo.listByProfile(profile.id, query.tenantId)),
    )

    return requestsPerProfile.flat().filter((r) => r.status === 'pending')
  }
}
