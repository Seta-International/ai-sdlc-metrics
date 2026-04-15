import { Injectable, Logger, Inject } from '@nestjs/common'
import {
  IMPORT_JOB_REPOSITORY,
  type IImportJobRepository,
} from '../../domain/repositories/import-job.repository'

export const PROCESS_IMPORT_JOB = 'people.process-import'

@Injectable()
export class ProcessImportJob {
  private readonly logger = new Logger(ProcessImportJob.name)

  constructor(
    @Inject(IMPORT_JOB_REPOSITORY)
    private readonly importJobRepo: IImportJobRepository,
  ) {}

  async handle(payload: { importJobId: string; tenantId: string }): Promise<void> {
    const job = await this.importJobRepo.findById(payload.importJobId, payload.tenantId)
    if (!job) return

    await this.importJobRepo.updateStatus(job.id, payload.tenantId, 'committed')

    // TODO: iterate CSV rows and create profiles/employments via command bus
    // Each row should: create PersonProfile + Employment + JobAssignment via command handlers
    // Track created/updated/skipped counts and call updateResults at end
    this.logger.log(`TODO: process import job ${job.id} with ${job.rowCount} rows`)

    await this.importJobRepo.updateResults(
      job.id,
      payload.tenantId,
      0, // createdCount — TODO
      0, // updatedCount — TODO
      job.rowCount, // skippedCount — all skipped until implemented
      null,
    )
  }
}
