import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { ListGenerationJobsQuery } from './list-generation-jobs.query'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import { GENERATION_JOB_REPOSITORY } from '../../domain/repositories/generation-job.repository.port'
import type { GenerationJob } from '../../domain/entities/generation-job.entity'

@QueryHandler(ListGenerationJobsQuery)
@Injectable()
export class ListGenerationJobsHandler implements IQueryHandler<
  ListGenerationJobsQuery,
  GenerationJob[]
> {
  constructor(
    @Inject(GENERATION_JOB_REPOSITORY) private readonly jobRepo: IGenerationJobRepository,
  ) {}

  async execute(query: ListGenerationJobsQuery): Promise<GenerationJob[]> {
    return this.jobRepo.listByTenant(query.tenantId, query.filters)
  }
}
