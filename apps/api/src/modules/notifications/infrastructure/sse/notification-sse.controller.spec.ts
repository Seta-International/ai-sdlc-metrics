import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotificationSseController } from './notification-sse.controller'
import type { RedisService } from '../../../../common/redis/redis.service'
import type { ClsService } from 'nestjs-cls'

const mockRedis = {
  subscribe: vi.fn().mockResolvedValue(undefined),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
} as unknown as RedisService

const mockCls = {
  get: vi.fn((key: string) => {
    if (key === 'tenantId') return 'tenant-1'
    if (key === 'actorId') return 'actor-1'
    return undefined
  }),
} as unknown as ClsService

describe('NotificationSseController', () => {
  let controller: NotificationSseController

  beforeEach(() => {
    vi.clearAllMocks()
    mockCls.get = vi.fn((key: string) => {
      if (key === 'tenantId') return 'tenant-1'
      if (key === 'actorId') return 'actor-1'
      return undefined
    })
    controller = new NotificationSseController(mockRedis, mockCls)
  })

  it('subscribes to the correct Redis channel', async () => {
    const req = {
      on: vi.fn(),
    }

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

  it('unsubscribes from Redis channel on connection close', async () => {
    let closeHandler: (() => void) | undefined
    const req = {
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'close') closeHandler = handler
      }),
    }

    controller.stream(req as never).subscribe({ next: () => {}, error: () => {} })
    await new Promise((r) => setTimeout(r, 10))

    closeHandler?.()

    expect(mockRedis.unsubscribe).toHaveBeenCalledWith('notifications:tenant-1:actor-1')
  })

  it('emits subscribe errors to the subject', async () => {
    const subscribeError = new Error('Redis connection failed')
    ;(mockRedis.subscribe as ReturnType<typeof vi.fn>).mockRejectedValueOnce(subscribeError)

    const req = { on: vi.fn() }
    const errors: unknown[] = []

    controller.stream(req as never).subscribe({
      next: () => {},
      error: (err: unknown) => errors.push(err),
    })

    await new Promise((r) => setTimeout(r, 10))

    expect(errors).toHaveLength(1)
    expect(errors[0]).toBe(subscribeError)
  })
})
