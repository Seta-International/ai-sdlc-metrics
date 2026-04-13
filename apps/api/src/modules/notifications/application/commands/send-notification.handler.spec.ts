import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SendNotificationCommand } from './send-notification.command'
import { SendNotificationHandler } from './send-notification.handler'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import type { Notification } from '../../domain/entities/notification.entity'
import type { NotificationPublisher } from '../../domain/ports/notification-publisher'
import { JOB_NOTIFICATIONS_SEND_EMAIL } from '../../../../common/jobs/pg-boss.service'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakeNotification: Notification = {
  id: '01900000-0000-7000-8000-000000000099',
  tenantId: TENANT_ID,
  recipientId: 'actor-1',
  senderId: 'actor-2',
  category: 'approval',
  title: 'Leave approved',
  body: 'Your leave was approved',
  resourceType: 'leave_request',
  resourceId: 'lr-1',
  resourceUrl: '/time/leave/lr-1',
  readAt: null,
  archivedAt: null,
  createdAt: new Date(),
}

describe('SendNotificationHandler', () => {
  let handler: SendNotificationHandler
  let repo: INotificationRepository
  let publisher: NotificationPublisher
  let mockPgBoss: PgBossService

  beforeEach(() => {
    repo = {
      insert: vi.fn().mockResolvedValue(fakeNotification),
      findByRecipient: vi.fn(),
      countUnread: vi.fn(),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      archive: vi.fn(),
      getPreference: vi.fn().mockResolvedValue(null), // default: no custom prefs
    }
    publisher = { publish: vi.fn().mockResolvedValue(undefined) } as NotificationPublisher
    mockPgBoss = { enqueue: vi.fn().mockResolvedValue('job-id-1') } as unknown as PgBossService
    handler = new SendNotificationHandler(repo, publisher, mockPgBoss)
  })

  it('inserts notification and publishes to Redis', async () => {
    const cmd = new SendNotificationCommand(
      TENANT_ID,
      'actor-1',
      'actor-2',
      'approval',
      'Leave approved',
      'Your leave was approved',
      'leave_request',
      'lr-1',
      '/time/leave/lr-1',
    )

    const result = await handler.execute(cmd)

    expect(result).toBe(fakeNotification.id)
    expect(repo.insert).toHaveBeenCalledOnce()
    expect(publisher.publish).toHaveBeenCalledWith(
      TENANT_ID,
      'actor-1',
      expect.objectContaining({ id: fakeNotification.id }),
    )
  })

  it('skips publishing when in-app preference is disabled', async () => {
    vi.mocked(repo.getPreference).mockResolvedValue({
      id: 'pref-1',
      tenantId: TENANT_ID,
      actorId: 'actor-1',
      category: 'approval',
      inApp: false,
      email: true,
    })

    const cmd = new SendNotificationCommand(
      TENANT_ID,
      'actor-1',
      'actor-2',
      'approval',
      'Leave approved',
      null,
      null,
      null,
      null,
    )

    await handler.execute(cmd)

    expect(repo.insert).toHaveBeenCalledOnce()
    expect(publisher.publish).not.toHaveBeenCalled()
  })

  it('enqueues email job when email preference is enabled (default)', async () => {
    const cmd = new SendNotificationCommand(
      TENANT_ID,
      'actor-1',
      'actor-2',
      'approval',
      'Leave approved',
      'Your leave was approved',
      'leave_request',
      'lr-1',
      '/time/leave/lr-1',
    )

    await handler.execute(cmd)

    expect(mockPgBoss.enqueue).toHaveBeenCalledWith(JOB_NOTIFICATIONS_SEND_EMAIL, {
      notificationId: fakeNotification.id,
      tenantId: TENANT_ID,
      recipientId: 'actor-1',
    })
  })

  it('does not enqueue email job when email preference is disabled', async () => {
    vi.mocked(repo.getPreference).mockResolvedValue({
      id: 'pref-2',
      tenantId: TENANT_ID,
      actorId: 'actor-1',
      category: 'approval',
      inApp: true,
      email: false,
    })

    const cmd = new SendNotificationCommand(
      TENANT_ID,
      'actor-1',
      'actor-2',
      'approval',
      'Leave approved',
      null,
      null,
      null,
      null,
    )

    await handler.execute(cmd)

    expect(mockPgBoss.enqueue).not.toHaveBeenCalled()
  })
})
