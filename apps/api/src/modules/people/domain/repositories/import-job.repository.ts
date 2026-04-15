import type { ImportJob, ImportJobStatus } from '../entities/import-job.entity'

export const IMPORT_JOB_REPOSITORY = Symbol('IImportJobRepository')

export interface IImportJobRepository {
  findById(id: string, tenantId: string): Promise<ImportJob | null>
  insert(data: Omit<ImportJob, 'id'>): Promise<ImportJob>
  updateStatus(id: string, tenantId: string, status: ImportJobStatus): Promise<void>
  updateMapping(
    id: string,
    tenantId: string,
    columnMapping: Record<string, string>,
    mappingProfile: string | null,
  ): Promise<void>
  updateValidation(
    id: string,
    tenantId: string,
    validCount: number,
    errorCount: number,
    warningCount: number,
    validationReport: Record<string, unknown>,
  ): Promise<void>
  updateResults(
    id: string,
    tenantId: string,
    createdCount: number,
    updatedCount: number,
    skippedCount: number,
    errorDetails: Record<string, unknown> | null,
  ): Promise<void>
}
