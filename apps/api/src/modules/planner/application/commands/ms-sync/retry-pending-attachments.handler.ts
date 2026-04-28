import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import {
  TASK_ATTACHMENT_REPOSITORY,
  type ITaskAttachmentRepository,
} from '../../../domain/repositories/task-attachment.repository'
import { PgBossService } from '../../../../../common/jobs/pg-boss.service'
import {
  MS_SYNC_PUSH_ATTACHMENT_JOB,
  MS_SYNC_PULL_ATTACHMENT_JOB,
} from '../../../infrastructure/jobs/pg-boss.registrar'
import { RetryPendingAttachmentsCommand } from './retry-pending-attachments.command'

@CommandHandler(RetryPendingAttachmentsCommand)
export class RetryPendingAttachmentsHandler implements ICommandHandler<RetryPendingAttachmentsCommand> {
  constructor(
    @Inject(TASK_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: ITaskAttachmentRepository,
    private readonly pgBoss: PgBossService,
  ) {}

  async execute(command: RetryPendingAttachmentsCommand): Promise<void> {
    const pending = await this.attachmentRepo.listPendingOlderThan(
      command.tenantId,
      ['pending_upload', 'pending_download'],
      30,
    )

    for (const att of pending) {
      if (att.msSyncState === 'pending_upload') {
        await this.pgBoss.enqueue(
          MS_SYNC_PUSH_ATTACHMENT_JOB,
          { attachmentId: att.id, tenantId: command.tenantId },
          { singletonKey: `push-attachment:${att.id}` },
        )
      } else if (att.msSyncState === 'pending_download') {
        await this.pgBoss.enqueue(
          MS_SYNC_PULL_ATTACHMENT_JOB,
          { attachmentId: att.id, tenantId: command.tenantId },
          { singletonKey: `pull-attachment:${att.id}` },
        )
      }
    }
  }
}
