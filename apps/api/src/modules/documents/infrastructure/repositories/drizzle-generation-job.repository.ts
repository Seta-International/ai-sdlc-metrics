import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import type { GenerationJob } from '../../domain/entities/generation-job.entity'
import type { JobStatus } from '../../domain/value-objects/job-status.vo'
import { generationJob } from '../schema/documents.schema'

@Injectable()
export class DrizzleGenerationJobRepository implements IGenerationJobRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(
    data: Omit<GenerationJob, 'id' | 'createdAt' | 'completedAt'>,
  ): Promise<GenerationJob> {
    const rows = await this.db
      .insert(generationJob)
      .values({
        tenantId: data.tenantId,
        templateId: data.templateId,
        requestedBy: data.requestedBy,
        status: data.status,
        inputData: data.inputData,
        outputFileKey: data.outputFileKey ?? undefined,
        errorMessage: data.errorMessage ?? undefined,
      })
      .returning()
    return rows[0] as GenerationJob
  }

  async findById(tenantId: string, id: string): Promise<GenerationJob | null> {
    const rows = await this.db
      .select()
      .from(generationJob)
      .where(and(eq(generationJob.tenantId, tenantId), eq(generationJob.id, id)))
      .limit(1)
    return (rows[0] as GenerationJob | undefined) ?? null
  }

  async updateStatus(
    id: string,
    status: JobStatus,
    outputFileKey?: string,
    errorMessage?: string,
  ): Promise<void> {
    await this.db
      .update(generationJob)
      .set({
        status,
        outputFileKey: outputFileKey ?? undefined,
        errorMessage: errorMessage ?? undefined,
        completedAt: status === 'completed' || status === 'failed' ? new Date() : undefined,
      })
      .where(eq(generationJob.id, id))
  }

  async listByTenant(
    tenantId: string,
    filters?: { status?: JobStatus; limit?: number; offset?: number },
  ): Promise<GenerationJob[]> {
    const conditions = [eq(generationJob.tenantId, tenantId)]
    if (filters?.status) conditions.push(eq(generationJob.status, filters.status))

    let q = this.db
      .select()
      .from(generationJob)
      .where(and(...conditions))
      .$dynamic()
    if (filters?.limit !== undefined) q = q.limit(filters.limit)
    if (filters?.offset !== undefined) q = q.offset(filters.offset)

    return (await q) as GenerationJob[]
  }
}
