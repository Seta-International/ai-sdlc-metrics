import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import {
  TASK_ATTACHMENT_REPOSITORY,
  type ITaskAttachmentRepository,
} from '../../../domain/repositories/task-attachment.repository'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import { STORAGE_CLIENT, type StorageClient } from '../../../domain/ports/storage-client.port'
import { MsSharePointClient } from '../../../infrastructure/ms-graph/ms-sharepoint-client'
import { MsGraphClient } from '../../../infrastructure/ms-graph/ms-graph-client'
import { GraphPreconditionFailedError } from '../../../infrastructure/ms-graph/errors'
import { PushAttachmentCommand } from './push-attachment.command'

const SMALL_FILE_THRESHOLD = 4 * 1024 * 1024
const CHUNK_SIZE = 5 * 1024 * 1024

@CommandHandler(PushAttachmentCommand)
export class PushAttachmentHandler implements ICommandHandler<PushAttachmentCommand> {
  constructor(
    @Inject(TASK_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: ITaskAttachmentRepository,
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    @Inject(STORAGE_CLIENT) private readonly storage: StorageClient,
    private readonly sharepoint: MsSharePointClient,
    private readonly graph: MsGraphClient,
  ) {}

  async execute(command: PushAttachmentCommand): Promise<void> {
    const attachment = await this.attachmentRepo.findById(command.attachmentId, command.tenantId)
    if (!attachment || attachment.kind !== 'file') return
    if (attachment.msSyncState !== 'pending_upload') return

    const task = await this.taskRepo.findById(attachment.taskId, command.tenantId)
    if (!task) return

    const plan = await this.planRepo.findById(task.planId, command.tenantId)
    if (!plan) return

    if (plan.container.type === 'future_only') return

    if (plan.container.type === 'ms_roster') {
      await this.attachmentRepo.setSyncState(attachment.id, command.tenantId, 'not_syncable')
      return
    }

    if (!task.msTaskId || !plan.msPlanId) return

    const taskRef = await this.taskRepo.findByMsTaskId(command.tenantId, task.msTaskId)
    if (!taskRef?.msDetailsEtag) return

    const externalId = (plan.container as unknown as { externalId: string }).externalId
    const { driveId } = await this.sharepoint.getGroupDefaultDriveId(command.tenantId, externalId)
    const safeName = plan.name.replace(/[^A-Za-z0-9 _.-]/g, '_')
    const folderPath = `/Planner/${safeName}`
    await this.sharepoint.ensureFolder(command.tenantId, driveId, folderPath)
    const filePath = `${folderPath}/${attachment.filename!}`

    const { url: presignedUrl } = await this.storage.getDownloadUrl(attachment.storageKey!)
    const s3Response = await fetch(presignedUrl)
    if (!s3Response.ok) throw new Error(`S3 download failed ${s3Response.status}`)
    const fileBuffer = Buffer.from(await s3Response.arrayBuffer())
    const fileSize = fileBuffer.length

    let uploadResult: { itemId: string; webUrl: string; driveId: string }
    if (fileSize <= SMALL_FILE_THRESHOLD) {
      uploadResult = await this.sharepoint.uploadSmall(
        command.tenantId,
        driveId,
        filePath,
        fileBuffer,
        attachment.contentType ?? 'application/octet-stream',
      )
    } else {
      const { uploadUrl } = await this.sharepoint.createUploadSession(
        command.tenantId,
        driveId,
        filePath,
      )
      uploadResult = await this.uploadInChunks(uploadUrl, fileBuffer, fileSize)
    }

    const encodedUrl = encodeURIComponent(uploadResult.webUrl)
    const referencesBody = {
      references: {
        [encodedUrl]: {
          '@odata.type': '#microsoft.graph.plannerExternalReference',
          alias: attachment.filename!,
          type: this.inferReferenceType(attachment.contentType ?? ''),
        },
      },
    }

    try {
      const res = await this.graph.patch<{ '@odata.etag'?: string }>(
        command.tenantId,
        `/planner/tasks/${encodeURIComponent(task.msTaskId)}/details`,
        referencesBody,
        { ifMatch: taskRef.msDetailsEtag, preferReturnRepresentation: true },
      )
      const newEtag = res.body?.['@odata.etag'] ?? res.etag
      if (newEtag) {
        await this.taskRepo.updateMsEtag(task.id, { msDetailsEtag: newEtag })
      }
    } catch (e) {
      if (e instanceof GraphPreconditionFailedError) {
        const fresh = await this.graph.get<{ '@odata.etag': string }>(
          command.tenantId,
          `/planner/tasks/${encodeURIComponent(task.msTaskId)}/details`,
        )
        const freshEtag = fresh.body!['@odata.etag']
        await this.graph.patch(
          command.tenantId,
          `/planner/tasks/${encodeURIComponent(task.msTaskId)}/details`,
          referencesBody,
          { ifMatch: freshEtag, preferReturnRepresentation: true },
        )
      } else {
        throw e
      }
    }

    await this.attachmentRepo.markSynced(attachment.id, command.tenantId, {
      msReferenceUrl: uploadResult.webUrl,
      msSharepointDriveId: uploadResult.driveId,
      msSharepointItemId: uploadResult.itemId,
    })
  }

  private async uploadInChunks(
    uploadUrl: string,
    data: Buffer,
    totalSize: number,
  ): Promise<{ itemId: string; webUrl: string; driveId: string }> {
    let offset = 0
    let lastResult: Awaited<ReturnType<typeof this.sharepoint.uploadChunk>> | null = null

    while (offset < totalSize) {
      const end = Math.min(offset + CHUNK_SIZE, totalSize)
      const chunk = data.subarray(offset, end)
      lastResult = await this.sharepoint.uploadChunk(uploadUrl, chunk, offset, totalSize)
      offset = end
    }

    if (!lastResult || lastResult.status === 202 || !lastResult.itemId) {
      throw new Error('chunked upload finished without completion response')
    }
    return { itemId: lastResult.itemId, webUrl: lastResult.webUrl!, driveId: lastResult.driveId! }
  }

  private inferReferenceType(mimeType: string): string {
    if (mimeType.includes('pdf')) return 'Pdf'
    if (mimeType.startsWith('image/')) return 'Image'
    if (mimeType.startsWith('video/')) return 'Video'
    if (mimeType.includes('word') || mimeType.includes('document')) return 'Word'
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'Excel'
    return 'Other'
  }
}
