import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MarkReadCommand, MarkAllReadCommand } from './mark-read.command'
import { MarkReadHandler, MarkAllReadHandler } from './mark-read.handler'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('MarkReadHandler', () => {
  let handler: MarkReadHandler
  let repo: INotificationRepository

  beforeEach(() => {
    repo = {
      insert: vi.fn(),
      findByRecipient: vi.fn(),
      countUnread: vi.fn(),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      archive: vi.fn(),
      getPreference: vi.fn(),
    }
    handler = new MarkReadHandler(repo)
  })

  it('calls repo.markRead with correct args', async () => {
    await handler.execute(new MarkReadCommand(TENANT_ID, ['id-1', 'id-2']))

    expect(repo.markRead).toHaveBeenCalledWith(TENANT_ID, ['id-1', 'id-2'])
  })
})

describe('MarkAllReadHandler', () => {
  let handler: MarkAllReadHandler
  let repo: INotificationRepository

  beforeEach(() => {
    repo = {
      insert: vi.fn(),
      findByRecipient: vi.fn(),
      countUnread: vi.fn(),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      archive: vi.fn(),
      getPreference: vi.fn(),
    }
    handler = new MarkAllReadHandler(repo)
  })

  it('calls repo.markAllRead with correct args', async () => {
    await handler.execute(new MarkAllReadCommand(TENANT_ID, 'actor-1'))

    expect(repo.markAllRead).toHaveBeenCalledWith(TENANT_ID, 'actor-1')
  })
})
