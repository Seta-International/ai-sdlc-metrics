import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ArchiveNotificationHandler } from './archive-notification.handler'
import { ArchiveNotificationCommand } from './archive-notification.command'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'

const mockRepo = {
  archive: vi.fn().mockResolvedValue(undefined),
} as unknown as INotificationRepository

describe('ArchiveNotificationHandler', () => {
  let handler: ArchiveNotificationHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new ArchiveNotificationHandler(mockRepo)
  })

  it('calls repo.archive with provided ids', async () => {
    await handler.execute(new ArchiveNotificationCommand('tenant-1', ['n-1', 'n-2']))
    expect(mockRepo.archive).toHaveBeenCalledWith('tenant-1', ['n-1', 'n-2'])
  })
})
