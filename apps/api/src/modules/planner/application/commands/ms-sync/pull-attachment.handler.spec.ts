import { describe, it, expect, vi } from 'vitest'
import { PullAttachmentHandler } from './pull-attachment.handler'
import { PullAttachmentCommand } from './pull-attachment.command'
import { TaskAttachment } from '../../../domain/entities/task-attachment.entity'
import type { ITaskAttachmentRepository } from '../../../domain/repositories/task-attachment.repository'
import type { MsSharePointClient } from '../../../infrastructure/ms-graph/ms-sharepoint-client'
import type { StorageClient } from '../../../domain/ports/storage-client.port'

const tenantId = 'tenant-1'
const attachmentId = 'attach-1'
const taskId = 'task-1'

function makePendingDownloadAttachment(overrides: Record<string, unknown> = {}) {
  return TaskAttachment.reconstitute({
    id: attachmentId,
    taskId,
    tenantId,
    createdBy: 'ms-sync',
    kind: 'file',
    storageKey: null,
    filename: 'report.pdf',
    contentType: null,
    sizeBytes: null,
    url: null,
    linkTitle: null,
    previewType: null,
    createdAt: new Date(),
    msSyncState: 'pending_download',
    msReferenceUrl: 'https://sp/file.pdf',
    msSharepointDriveId: 'drive-1',
    msSharepointItemId: 'item-1',
    ...overrides,
  })
}

function makeHandler() {
  const attachmentRepo = {
    findById: vi.fn().mockResolvedValue(makePendingDownloadAttachment()),
    setSyncState: vi.fn().mockResolvedValue(undefined),
    markDownloaded: vi.fn().mockResolvedValue(undefined),
  }
  const sharepoint = {
    downloadContent: vi.fn().mockResolvedValue({
      stream: new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array([1, 2, 3]))
          c.close()
        },
      }),
      size: 3,
      contentType: 'application/pdf',
    }),
    getItemMetadata: vi.fn(),
  }
  const storage = {
    putObject: vi.fn().mockResolvedValue(undefined),
  }
  return {
    handler: new PullAttachmentHandler(
      attachmentRepo as unknown as ITaskAttachmentRepository,
      sharepoint as unknown as MsSharePointClient,
      storage as unknown as StorageClient,
    ),
    attachmentRepo,
    sharepoint,
    storage,
  }
}

describe('PullAttachmentHandler', () => {
  it('downloads from SharePoint and uploads to S3, then markDownloaded', async () => {
    const { handler, sharepoint, storage, attachmentRepo } = makeHandler()
    await handler.execute(new PullAttachmentCommand(attachmentId, tenantId))
    expect(sharepoint.downloadContent).toHaveBeenCalledWith(tenantId, 'drive-1', 'item-1')
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.stringContaining(`tenants/${tenantId}/attachments/${attachmentId}`),
      expect.any(Buffer),
      'application/pdf',
    )
    expect(attachmentRepo.markDownloaded).toHaveBeenCalledWith(
      attachmentId,
      tenantId,
      expect.objectContaining({ mimeType: 'application/pdf' }),
    )
  })

  it('non-pending_download → no-op', async () => {
    const { handler, storage, attachmentRepo } = makeHandler()
    attachmentRepo.findById.mockResolvedValue(
      makePendingDownloadAttachment({ msSyncState: 'synced' }),
    )
    await handler.execute(new PullAttachmentCommand(attachmentId, tenantId))
    expect(storage.putObject).not.toHaveBeenCalled()
  })

  it('missing driveId/itemId → marks not_syncable', async () => {
    const { handler, attachmentRepo } = makeHandler()
    attachmentRepo.findById.mockResolvedValue(
      makePendingDownloadAttachment({
        msSharepointDriveId: null,
        msSharepointItemId: null,
      }),
    )
    await handler.execute(new PullAttachmentCommand(attachmentId, tenantId))
    expect(attachmentRepo.setSyncState).toHaveBeenCalledWith(attachmentId, tenantId, 'not_syncable')
  })
})
