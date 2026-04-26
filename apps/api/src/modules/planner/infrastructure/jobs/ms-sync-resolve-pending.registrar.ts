import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import {
  MS_LINKED_GROUP_REPOSITORY,
  type IMsLinkedGroupRepository,
} from '../../domain/repositories/ms-linked-group.repository'
import { ResolvePendingAssignmentsCommand } from '../../application/commands/ms-sync/resolve-pending-assignments.command'

const MS_SYNC_RESOLVE_PENDING_JOB = 'ms-sync-resolve-pending'
const CRON = '0 2 * * *'

@Injectable()
export class MsSyncResolvePendingRegistrar implements OnApplicationBootstrap {
  private readonly logger = new Logger(MsSyncResolvePendingRegistrar.name)

  constructor(
    private readonly pgBoss: PgBossService,
    @Inject(MS_LINKED_GROUP_REPOSITORY)
    private readonly linkedGroups: IMsLinkedGroupRepository,
    private readonly commandBus: CommandBus,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.pgBoss.registerScheduledWorker<Record<string, never>>(
      MS_SYNC_RESOLVE_PENDING_JOB,
      async () => {
        const tenantIds = await this.linkedGroups.listDistinctActiveTenantIds()
        this.logger.log(`Resolving pending assignments for ${tenantIds.length} tenant(s)`)
        for (const tenantId of tenantIds) {
          await this.commandBus.execute(new ResolvePendingAssignmentsCommand(tenantId))
        }
      },
      { localConcurrency: 1 },
    )

    await this.pgBoss.scheduleWithData<Record<string, never>>(
      MS_SYNC_RESOLVE_PENDING_JOB,
      CRON,
      {},
      { key: MS_SYNC_RESOLVE_PENDING_JOB },
    )

    this.logger.log(`Scheduled ${MS_SYNC_RESOLVE_PENDING_JOB} at cron=${CRON}`)
  }
}
