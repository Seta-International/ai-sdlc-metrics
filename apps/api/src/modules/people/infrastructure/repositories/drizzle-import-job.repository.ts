import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { ImportJob, ImportJobStatus } from '../../domain/entities/import-job.entity'
import type { IImportJobRepository } from '../../domain/repositories/import-job.repository'
import { importJob } from '../schema/people.schema'

@Injectable()
export class DrizzleImportJobRepository implements IImportJobRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<ImportJob | null> {
    const rows = await this.db
      .select()
      .from(importJob)
      .where(and(eq(importJob.id, id), eq(importJob.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as ImportJob) ?? null
  }

  async insert(data: Omit<ImportJob, 'id'>): Promise<ImportJob> {
    const rows = await this.db
      .insert(importJob)
      .values(data as unknown as typeof importJob.$inferInsert)
      .returning()
    return rows[0] as ImportJob
  }

  async updateStatus(id: string, tenantId: string, status: ImportJobStatus): Promise<void> {
    await this.db
      .update(importJob)
      .set({ status } as Record<string, unknown>)
      .where(and(eq(importJob.id, id), eq(importJob.tenantId, tenantId)))
  }

  async updateMapping(
    id: string,
    tenantId: string,
    columnMapping: Record<string, string>,
    mappingProfile: string | null,
  ): Promise<void> {
    await this.db
      .update(importJob)
      .set({ columnMapping, mappingProfile, status: 'mapped' } as Record<string, unknown>)
      .where(and(eq(importJob.id, id), eq(importJob.tenantId, tenantId)))
  }

  async updateValidation(
    id: string,
    tenantId: string,
    validCount: number,
    errorCount: number,
    warningCount: number,
    validationReport: Record<string, unknown>,
  ): Promise<void> {
    await this.db
      .update(importJob)
      .set({
        validCount,
        errorCount,
        warningCount,
        validationReport,
        status: 'validated',
      } as Record<string, unknown>)
      .where(and(eq(importJob.id, id), eq(importJob.tenantId, tenantId)))
  }

  async updateResults(
    id: string,
    tenantId: string,
    createdCount: number,
    updatedCount: number,
    skippedCount: number,
    errorDetails: Record<string, unknown> | null,
  ): Promise<void> {
    const status =
      errorDetails && Object.keys(errorDetails).length > 0 ? 'partially_committed' : 'committed'
    await this.db
      .update(importJob)
      .set({
        createdCount,
        updatedCount,
        skippedCount,
        errorDetails,
        status,
        completedAt: new Date(),
      } as Record<string, unknown>)
      .where(and(eq(importJob.id, id), eq(importJob.tenantId, tenantId)))
  }
}
