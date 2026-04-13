import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { GetGenerationJobQuery } from './get-generation-job.query'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import { GENERATION_JOB_REPOSITORY } from '../../domain/repositories/generation-job.repository.port'
import type { GenerationJob } from '../../domain/entities/generation-job.entity'

@QueryHandler(GetGenerationJobQuery)
@Injectable()
export class GetGenerationJobHandler implements IQueryHandler<
  GetGenerationJobQuery,
  GenerationJob
> {
  constructor(
    @Inject(GENERATION_JOB_REPOSITORY) private readonly jobRepo: IGenerationJobRepository,
  ) {}

  async execute(query: GetGenerationJobQuery): Promise<GenerationJob> {
    const job = await this.jobRepo.findById(query.tenantId, query.jobId)
    if (!job) throw new Error(`Job not found: ${query.jobId}`)
    return job
  }
}
