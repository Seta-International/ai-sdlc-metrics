import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { ProfileChangeRequest } from '../../domain/entities/profile-change-request.entity'
import { ListProfileChangeRequestsQuery } from './list-profile-change-requests.query'

// TODO: Plan 06 — rewrite for new domain model
// Old implementation referenced deleted employment-profile.repository

@QueryHandler(ListProfileChangeRequestsQuery)
export class ListProfileChangeRequestsHandler implements IQueryHandler<
  ListProfileChangeRequestsQuery,
  ProfileChangeRequest[]
> {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor() {}

  async execute(_query: ListProfileChangeRequestsQuery): Promise<ProfileChangeRequest[]> {
    // TODO: Plan 06 — implement using Employment + ProfileChangeRequest repositories
    throw new Error('Not implemented: ListProfileChangeRequestsHandler needs Plan 06 rewrite')
  }
}
