import type { GenerationJob } from '../entities/generation-job.entity'
import type { JobStatus } from '../value-objects/job-status.vo'

export interface IGenerationJobRepository {
  insert(job: Omit<GenerationJob, 'id' | 'createdAt' | 'completedAt'>): Promise<GenerationJob>
  findById(tenantId: string, id: string): Promise<GenerationJob | null>
  updateStatus(
    id: string,
    status: JobStatus,
    outputFileKey?: string,
    errorMessage?: string,
  ): Promise<void>
}

export const GENERATION_JOB_REPOSITORY = Symbol('IGenerationJobRepository')
