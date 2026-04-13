import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RedisNotificationPublisher } from './redis-notification-publisher'
import type { RedisService } from '../../../../common/redis/redis.service'
import type { Notification } from '../../domain/entities/notification.entity'

const mockRedis = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as RedisService

const notification: Notification = {
  id: 'n-1',
  tenantId: 'tenant-1',
  recipientId: 'actor-1',
  senderId: null,
  category: 'approval',
  title: 'Leave approved',
  body: null,
  resourceType: null,
  resourceId: null,
  resourceUrl: null,
  readAt: null,
  archivedAt: null,
  createdAt: new Date(),
}

describe('RedisNotificationPublisher', () => {
  let publisher: RedisNotificationPublisher

  beforeEach(() => {
    vi.clearAllMocks()
    publisher = new RedisNotificationPublisher(mockRedis)
  })

  it('publishes notification to the correct channel', async () => {
    await publisher.publish('tenant-1', 'actor-1', notification)

    expect(mockRedis.publish).toHaveBeenCalledWith(
      'notifications:tenant-1:actor-1',
      JSON.stringify(notification),
    )
  })
})
