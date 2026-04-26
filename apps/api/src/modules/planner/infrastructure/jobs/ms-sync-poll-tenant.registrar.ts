import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { CommandBus, EventBus } from '@nestjs/cqrs'
import type { Job } from 'pg-boss'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import type { IMsLinkedGroupRepository } from '../../domain/repositories/ms-linked-group.repository'
import { MS_LINKED_GROUP_REPOSITORY } from '../../domain/repositories/ms-linked-group.repository'
import {
  MS_SYNC_CREDENTIAL_INVALIDATED_EVENT,
  MS_SYNC_DISABLED_EVENT,
  MS_SYNC_ENABLED_EVENT,
} from '@future/event-contracts'
import { PollTenantCommand } from '../../application/commands/ms-sync/poll-tenant.command'

export const MS_SYNC_POLL_JOB = 'ms-sync-poll-tenant'
const CRON = '*/3 * * * *'

type PollJobData = { tenantId: string }

@Injectable()
export class MsSyncPollTenantRegistrar implements OnApplicationBootstrap {
  private readonly logger = new Logger(MsSyncPollTenantRegistrar.name)

  constructor(
    private readonly pgBoss: PgBossService,
    @Inject(MS_LINKED_GROUP_REPOSITORY)
    private readonly linkedGroups: IMsLinkedGroupRepository,
    private readonly commandBus: CommandBus,
    private readonly eventBus: EventBus,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.pgBoss.registerScheduledWorker<PollJobData>(
      MS_SYNC_POLL_JOB,
      async (jobs: Job<PollJobData>[]) => {
        for (const job of jobs) {
          await this.commandBus.execute(new PollTenantCommand(job.data.tenantId))
        }
      },
      { localConcurrency: 1 },
    )

    const activeTenantIds = await this.linkedGroups.listDistinctActiveTenantIds()
    for (const tenantId of activeTenantIds) {
      await this.scheduleForTenant(tenantId)
    }

    this.eventBus.subscribe((event: unknown) => {
      if (!event || typeof event !== 'object') return
      const e = event as { type?: string; tenantId?: string }
      if (e.type === MS_SYNC_ENABLED_EVENT && typeof e.tenantId === 'string') {
        void this.scheduleForTenant(e.tenantId)
      } else if (
        (e.type === MS_SYNC_DISABLED_EVENT || e.type === MS_SYNC_CREDENTIAL_INVALIDATED_EVENT) &&
        typeof e.tenantId === 'string'
      ) {
        void this.cancelForTenant(e.tenantId)
      }
    })
  }

  private async scheduleForTenant(tenantId: string): Promise<void> {
    const jitterSeconds = Math.floor(Math.random() * 180)
    await this.pgBoss.scheduleWithData<PollJobData>(
      MS_SYNC_POLL_JOB,
      CRON,
      { tenantId },
      { key: `poll-tenant:${tenantId}`, startAfter: jitterSeconds },
    )
    this.logger.log(`Scheduled ms-sync-poll-tenant for tenant=${tenantId} jitter=${jitterSeconds}s`)
  }

  private async cancelForTenant(tenantId: string): Promise<void> {
    await this.pgBoss.unschedule(MS_SYNC_POLL_JOB, `poll-tenant:${tenantId}`)
    this.logger.log(`Unscheduled ms-sync-poll-tenant for tenant=${tenantId}`)
  }
}
