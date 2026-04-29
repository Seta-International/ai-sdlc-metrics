import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import {
  MS_SYNC_CONFLICT_REPOSITORY,
  type IMsSyncConflictRepository,
} from '../../../domain/repositories/ms-sync-conflict.repository'
import { PgBossService } from '../../../../../common/jobs/pg-boss.service'
import {
  MS_SYNC_PUSH_TASK_JOB,
  MS_SYNC_PUSH_ATTACHMENT_JOB,
} from '../../../infrastructure/jobs/pg-boss.registrar'
import { RetryConflictCommand } from './retry-conflict.command'

@CommandHandler(RetryConflictCommand)
export class RetryConflictHandler implements ICommandHandler<RetryConflictCommand> {
  constructor(
    @Inject(MS_SYNC_CONFLICT_REPOSITORY)
    private readonly conflictRepo: IMsSyncConflictRepository,
    private readonly pgBoss: PgBossService,
  ) {}

  async execute(cmd: RetryConflictCommand): Promise<void> {
    const conflict = await this.conflictRepo.get(cmd.conflictId, cmd.tenantId)
    if (!conflict) throw new Error('Not found')
    if (conflict.resolvedAt) throw new Error('Already resolved')

    switch (conflict.kind) {
      case 'push_412_exhausted':
      case 'push_failed':
      case 'push_403_quota':
        if (!conflict.taskId) {
          throw new Error('Cannot retry plan-level quota conflict — resolve in Microsoft 365 first')
        }
        await this.pgBoss.enqueue(
          MS_SYNC_PUSH_TASK_JOB,
          { tenantId: cmd.tenantId, taskId: conflict.taskId },
          { singletonKey: `push-task:${conflict.taskId}` },
        )
        break
      case 'attachment_upload_failed':
        await this.pgBoss.enqueue(
          MS_SYNC_PUSH_ATTACHMENT_JOB,
          { tenantId: cmd.tenantId, attachmentId: conflict.field! },
          { singletonKey: `push-attachment:${conflict.field!}` },
        )
        break
      default:
        throw new Error(`Cannot retry conflict kind=${conflict.kind}`)
    }

    await this.conflictRepo.markResolved(conflict.id, cmd.actorId, 'applied_mine')
  }
}
