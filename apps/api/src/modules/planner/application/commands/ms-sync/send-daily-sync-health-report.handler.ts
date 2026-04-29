import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject, Logger } from '@nestjs/common'
import {
  MS_LINKED_GROUP_REPOSITORY,
  type IMsLinkedGroupRepository,
} from '../../../domain/repositories/ms-linked-group.repository'
import {
  MS_SYNC_CONFLICT_REPOSITORY,
  type IMsSyncConflictRepository,
} from '../../../domain/repositories/ms-sync-conflict.repository'
import { SendDailySyncHealthReportCommand } from './send-daily-sync-health-report.command'

@CommandHandler(SendDailySyncHealthReportCommand)
export class SendDailySyncHealthReportHandler implements ICommandHandler<SendDailySyncHealthReportCommand> {
  private readonly logger = new Logger(SendDailySyncHealthReportHandler.name)

  constructor(
    @Inject(MS_LINKED_GROUP_REPOSITORY)
    private readonly groupRepo: IMsLinkedGroupRepository,
    @Inject(MS_SYNC_CONFLICT_REPOSITORY)
    private readonly conflictRepo: IMsSyncConflictRepository,
  ) {}

  async execute(_cmd: SendDailySyncHealthReportCommand): Promise<void> {
    if (process.env['MS_SYNC_HEALTH_REPORT_ENABLED'] !== 'true') {
      this.logger.debug(
        'Daily sync health report disabled — set MS_SYNC_HEALTH_REPORT_ENABLED=true',
      )
      return
    }

    const tenantIds = await this.groupRepo.listDistinctActiveTenantIds()
    const lines: string[] = ['MS Sync Daily Health Report', '']

    for (const tenantId of tenantIds) {
      const groups = await this.groupRepo.listActiveForTenant(tenantId)
      const conflicts = await this.conflictRepo.listOpenForTenant(tenantId)
      lines.push(`Tenant: ${tenantId}`)
      lines.push(`  Linked groups: ${groups.length}`)
      lines.push(`  Open conflicts: ${conflicts.length}`)
      lines.push('')
    }

    // Log to stdout — in production this should email the ops list
    this.logger.log(lines.join('\n'))
  }
}
