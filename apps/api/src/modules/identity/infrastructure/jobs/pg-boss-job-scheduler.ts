import { Injectable } from '@nestjs/common'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import type { IJobScheduler } from '../../domain/ports/job-scheduler.port'

export const IDENTITY_DIRECTORY_SYNC_JOB = 'identity.directory-sync'

export interface DirectorySyncJobData {
  tenantId: string
  identityProviderId: string
}

@Injectable()
export class PgBossJobScheduler implements IJobScheduler {
  constructor(private readonly pgBoss: PgBossService) {}

  async enqueueDirectorySync(tenantId: string, identityProviderId: string): Promise<string> {
    return this.pgBoss.enqueue<DirectorySyncJobData>(IDENTITY_DIRECTORY_SYNC_JOB, {
      tenantId,
      identityProviderId,
    })
  }

  async getNextScheduledSync(_tenantId: string): Promise<Date | null> {
    return null
  }
}
