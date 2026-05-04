import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { ProfileChangeRequest } from '../../domain/entities/profile-change-request.entity'
import {
  PROFILE_CHANGE_REQUEST_REPOSITORY,
  type IProfileChangeRequestRepository,
} from '../../domain/repositories/profile-change-request.repository'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  PERSON_PROFILE_REPOSITORY,
  type IPersonProfileRepository,
} from '../../domain/repositories/person-profile.repository'
import { ListProfileChangeRequestsQuery } from './list-profile-change-requests.query'

export interface ChangeRequestListItem extends ProfileChangeRequest {
  employeeName: string | null
}

export interface ListProfileChangeRequestsResult {
  items: ChangeRequestListItem[]
  total: number
}

@QueryHandler(ListProfileChangeRequestsQuery)
export class ListProfileChangeRequestsHandler implements IQueryHandler<
  ListProfileChangeRequestsQuery,
  ListProfileChangeRequestsResult
> {
  constructor(
    @Inject(PROFILE_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRepo: IProfileChangeRequestRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly profileRepo: IPersonProfileRepository,
  ) {}

  async execute(query: ListProfileChangeRequestsQuery): Promise<ListProfileChangeRequestsResult> {
    if (query.mode === 'byEmployment') {
      const items = await this.changeRepo.findByEmploymentId(
        query.employmentId!,
        query.tenantId,
        query.status ?? undefined,
      )
      return {
        items: items.map((r) => ({ ...r, employeeName: null })),
        total: items.length,
      }
    }

    const raw = await this.changeRepo.findByTenant(
      query.tenantId,
      query.status ?? undefined,
      query.limit,
      query.offset,
    )

    const items: ChangeRequestListItem[] = []
    for (const change of raw) {
      const employment = await this.employmentRepo.findById(change.employmentId, query.tenantId)
      if (!employment) {
        items.push({ ...change, employeeName: null })
        continue
      }
      const profile = await this.profileRepo.findById(employment.personProfileId, query.tenantId)
      items.push({ ...change, employeeName: profile?.fullName ?? null })
    }

    return { items, total: items.length }
  }
}
