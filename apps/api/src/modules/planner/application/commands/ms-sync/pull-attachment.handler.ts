import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import {
  TASK_ATTACHMENT_REPOSITORY,
  type ITaskAttachmentRepository,
} from '../../../domain/repositories/task-attachment.repository'
import { STORAGE_CLIENT, type StorageClient } from '../../../domain/ports/storage-client.port'
import { MsSharePointClient } from '../../../infrastructure/ms-graph/ms-sharepoint-client'
import { PullAttachmentCommand } from './pull-attachment.command'

@CommandHandler(PullAttachmentCommand)
export class PullAttachmentHandler implements ICommandHandler<PullAttachmentCommand> {
  constructor(
    @Inject(TASK_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: ITaskAttachmentRepository,
    private readonly sharepoint: MsSharePointClient,
    @Inject(STORAGE_CLIENT) private readonly storage: StorageClient,
  ) {}

  async execute(command: PullAttachmentCommand): Promise<void> {
    const attachment = await this.attachmentRepo.findById(command.attachmentId, command.tenantId)
    if (!attachment || attachment.msSyncState !== 'pending_download') return

    if (!attachment.msSharepointDriveId || !attachment.msSharepointItemId) {
      await this.attachmentRepo.setSyncState(attachment.id, command.tenantId, 'not_syncable')
      return
    }

    const { stream, size, contentType } = await this.sharepoint.downloadContent(
      command.tenantId,
      attachment.msSharepointDriveId,
      attachment.msSharepointItemId,
    )

    const buffer = await this.streamToBuffer(stream)
    const s3Key = `tenants/${command.tenantId}/attachments/${attachment.id}`
    await this.storage.putObject(s3Key, buffer, contentType)

    await this.attachmentRepo.markDownloaded(attachment.id, command.tenantId, {
      s3Key,
      sizeBytes: size || buffer.length,
      mimeType: contentType,
    })
  }

  private async streamToBuffer(stream: ReadableStream): Promise<Buffer> {
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  }
}
