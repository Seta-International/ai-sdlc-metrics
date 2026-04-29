import { Injectable, Logger } from '@nestjs/common'
import type { IJobScheduler } from '../../domain/ports/job-scheduler.port'

/**
 * Stub implementation — used only in tests and legacy wiring.
 * Production: see PgBossJobScheduler.
 */
@Injectable()
export class StubJobScheduler implements IJobScheduler {
  private readonly logger = new Logger(StubJobScheduler.name)

  async enqueueDirectorySync(tenantId: string, identityProviderId: string): Promise<string> {
    this.logger.warn(
      `StubJobScheduler.enqueueDirectorySync() — tenantId: ${tenantId} providerId: ${identityProviderId}`,
    )
    return 'stub-job-id'
  }

  async getNextScheduledSync(_tenantId: string): Promise<Date | null> {
    return null
  }
}
