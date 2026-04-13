import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotificationSseController } from './notification-sse.controller'
import type { RedisService } from '../../../../common/redis/redis.service'

const mockRedis = {
  subscribe: vi.fn().mockResolvedValue(undefined),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
} as unknown as RedisService

describe('NotificationSseController', () => {
  let controller: NotificationSseController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new NotificationSseController(mockRedis)
  })

  it('subscribes to the correct Redis channel', async () => {
    const req = {
      headers: { cookie: 'session=test' },
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      on: vi.fn(),
    }

    // Take the first emission from the observable
    controller.stream(req as never).subscribe({
      next: () => {},
      error: () => {},
    })

    // Wait for async subscribe
    await new Promise((r) => setTimeout(r, 10))

    expect(mockRedis.subscribe).toHaveBeenCalledWith(
      'notifications:tenant-1:actor-1',
      expect.any(Function),
    )
  })
})
