import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import type { Job } from 'pg-boss'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import {
  MS_LINKED_GROUP_REPOSITORY,
  type IMsLinkedGroupRepository,
} from '../../domain/repositories/ms-linked-group.repository'
import { RetryPendingAttachmentsCommand } from '../../application/commands/ms-sync/retry-pending-attachments.command'

export const MS_SYNC_RETRY_ATTACHMENTS_JOB = 'ms-sync-retry-attachments'
const CRON = '0 3 * * *' // 03:00 UTC daily

type RetryJobData = { tenantId: string }

@Injectable()
export class MsSyncRetryAttachmentsRegistrar implements OnApplicationBootstrap {
  private readonly logger = new Logger(MsSyncRetryAttachmentsRegistrar.name)

  constructor(
    private readonly pgBoss: PgBossService,
    @Inject(MS_LINKED_GROUP_REPOSITORY)
    private readonly linkedGroups: IMsLinkedGroupRepository,
    private readonly commandBus: CommandBus,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.pgBoss.registerScheduledWorker<RetryJobData>(
      MS_SYNC_RETRY_ATTACHMENTS_JOB,
      async (jobs: Job<RetryJobData>[]) => {
        for (const job of jobs) {
          await this.commandBus.execute(new RetryPendingAttachmentsCommand(job.data.tenantId))
        }
      },
      { localConcurrency: 1 },
    )

    const activeTenantIds = await this.linkedGroups.listDistinctActiveTenantIds()
    for (const tenantId of activeTenantIds) {
      await this.scheduleForTenant(tenantId)
    }
  }

  private async scheduleForTenant(tenantId: string): Promise<void> {
    await this.pgBoss.scheduleWithData<RetryJobData>(
      MS_SYNC_RETRY_ATTACHMENTS_JOB,
      CRON,
      { tenantId },
      { key: `retry-attachments:${tenantId}` },
    )
    this.logger.log(`Scheduled ms-sync-retry-attachments for tenant=${tenantId}`)
  }
}
