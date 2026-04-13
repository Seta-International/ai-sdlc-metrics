import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { GetJobDownloadUrlQuery } from './get-job-download-url.query'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import { GENERATION_JOB_REPOSITORY } from '../../domain/repositories/generation-job.repository.port'
import type { StorageClient, PresignedUrl } from '@future/storage'

export const STORAGE_CLIENT = Symbol('StorageClient')

@QueryHandler(GetJobDownloadUrlQuery)
@Injectable()
export class GetJobDownloadUrlHandler implements IQueryHandler<
  GetJobDownloadUrlQuery,
  PresignedUrl
> {
  constructor(
    @Inject(GENERATION_JOB_REPOSITORY) private readonly jobRepo: IGenerationJobRepository,
    @Inject(STORAGE_CLIENT) private readonly storage: StorageClient,
  ) {}

  async execute(query: GetJobDownloadUrlQuery): Promise<PresignedUrl> {
    const job = await this.jobRepo.findById(query.tenantId, query.jobId)
    if (!job) throw new Error(`Job not found: ${query.jobId}`)
    if (job.status !== 'completed' || !job.outputFileKey) {
      throw new Error(`Job not completed: ${query.jobId}`)
    }
    return this.storage.getDownloadUrl(job.outputFileKey)
  }
}
