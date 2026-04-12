import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnreadCountQuery } from './unread-count.query'
import { UnreadCountHandler } from './unread-count.handler'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'

describe('UnreadCountHandler', () => {
  let handler: UnreadCountHandler
  let repo: INotificationRepository

  beforeEach(() => {
    repo = {
      insert: vi.fn(),
      findByRecipient: vi.fn(),
      countUnread: vi.fn().mockResolvedValue(5),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      archive: vi.fn(),
      getPreference: vi.fn(),
    }
    handler = new UnreadCountHandler(repo)
  })

  it('returns the unread count from repo', async () => {
    const result = await handler.execute(new UnreadCountQuery('tenant-1', 'actor-1'))

    expect(result).toBe(5)
    expect(repo.countUnread).toHaveBeenCalledWith('tenant-1', 'actor-1')
  })
})
