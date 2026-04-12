import { Injectable, Logger } from '@nestjs/common'
import type { IJobScheduler } from '../../domain/ports/job-scheduler.port'

/**
 * Stub implementation — pg-boss job scheduling for directory sync not yet wired up.
 * Replace with PgBossJobScheduler once the jobs table is set up.
 */
@Injectable()
export class StubJobScheduler implements IJobScheduler {
  private readonly logger = new Logger(StubJobScheduler.name)

  async enqueueDirectorySync(tenantId: string): Promise<string> {
    this.logger.warn(`StubJobScheduler.enqueueDirectorySync() — tenantId: ${tenantId}`)
    return 'stub-job-id'
  }

  async getNextScheduledSync(_tenantId: string): Promise<Date | null> {
    return null
  }
}
