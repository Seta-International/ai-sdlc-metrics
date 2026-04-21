import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  JOB_HISTORY_REPOSITORY,
  type IJobHistoryRepository,
} from '../../domain/repositories/job-history.repository'
import type { JobHistoryEntry } from '../../domain/entities/job-history-entry.entity'
import { GetJobHistoryQuery } from './get-job-history.query'

@QueryHandler(GetJobHistoryQuery)
export class GetJobHistoryHandler implements IQueryHandler<GetJobHistoryQuery, JobHistoryEntry[]> {
  constructor(
    @Inject(JOB_HISTORY_REPOSITORY)
    private readonly repo: IJobHistoryRepository,
  ) {}

  async execute(query: GetJobHistoryQuery): Promise<JobHistoryEntry[]> {
    return this.repo.findByProfile(query.profileId, query.tenantId)
  }
}
