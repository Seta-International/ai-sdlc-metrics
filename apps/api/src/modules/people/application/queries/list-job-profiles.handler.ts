import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { JobProfile } from '../../domain/entities/job-profile.entity'
import {
  JOB_PROFILE_REPOSITORY,
  type IJobProfileRepository,
} from '../../domain/repositories/job-profile.repository'
import { ListJobProfilesQuery } from './list-job-profiles.query'

@QueryHandler(ListJobProfilesQuery)
export class ListJobProfilesHandler implements IQueryHandler<ListJobProfilesQuery, JobProfile[]> {
  constructor(
    @Inject(JOB_PROFILE_REPOSITORY)
    private readonly jobProfileRepo: IJobProfileRepository,
  ) {}

  async execute(query: ListJobProfilesQuery): Promise<JobProfile[]> {
    return this.jobProfileRepo.listByTenant(query.tenantId, {
      familyId: query.familyId,
      isActive: query.isActive,
    })
  }
}
