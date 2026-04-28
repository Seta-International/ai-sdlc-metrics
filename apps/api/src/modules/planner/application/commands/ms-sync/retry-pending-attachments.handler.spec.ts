import { describe, it, expect, vi } from 'vitest'
import { RetryPendingAttachmentsHandler } from './retry-pending-attachments.handler'
import { RetryPendingAttachmentsCommand } from './retry-pending-attachments.command'

describe('RetryPendingAttachmentsHandler', () => {
  it('re-enqueues push job for pending_upload attachments', async () => {
    const attachmentRepo = {
      listPendingOlderThan: vi.fn().mockResolvedValue([
        { id: 'a1', msSyncState: 'pending_upload' },
        { id: 'a2', msSyncState: 'pending_upload' },
      ]),
    }
    const pgBoss = {
      enqueue: vi.fn().mockResolvedValue(undefined),
    }
    const handler = new RetryPendingAttachmentsHandler(attachmentRepo as any, pgBoss as any)
    await handler.execute(new RetryPendingAttachmentsCommand('tenant-1'))
    expect(attachmentRepo.listPendingOlderThan).toHaveBeenCalledWith(
      'tenant-1',
      ['pending_upload', 'pending_download'],
      30,
    )
    expect(pgBoss.enqueue).toHaveBeenCalledTimes(2)
  })

  it('re-enqueues pull job for pending_download attachments', async () => {
    const attachmentRepo = {
      listPendingOlderThan: vi
        .fn()
        .mockResolvedValue([{ id: 'b1', msSyncState: 'pending_download' }]),
    }
    const pgBoss = {
      enqueue: vi.fn().mockResolvedValue(undefined),
    }
    const handler = new RetryPendingAttachmentsHandler(attachmentRepo as any, pgBoss as any)
    await handler.execute(new RetryPendingAttachmentsCommand('tenant-1'))
    expect(pgBoss.enqueue).toHaveBeenCalledWith(
      'ms-sync-pull-attachment',
      { attachmentId: 'b1', tenantId: 'tenant-1' },
      expect.any(Object),
    )
  })

  it('no-op when no pending attachments', async () => {
    const attachmentRepo = {
      listPendingOlderThan: vi.fn().mockResolvedValue([]),
    }
    const pgBoss = { enqueue: vi.fn() }
    const handler = new RetryPendingAttachmentsHandler(attachmentRepo as any, pgBoss as any)
    await handler.execute(new RetryPendingAttachmentsCommand('tenant-1'))
    expect(pgBoss.enqueue).not.toHaveBeenCalled()
  })
})
