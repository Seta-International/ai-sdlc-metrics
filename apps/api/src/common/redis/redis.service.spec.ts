import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPublish = vi.fn().mockResolvedValue(1)
const mockSubscribe = vi.fn().mockResolvedValue(undefined)
const mockOn = vi.fn()
const mockQuit = vi.fn().mockResolvedValue(undefined)

const mockClient = {
  publish: mockPublish,
  subscribe: mockSubscribe,
  on: mockOn,
  quit: mockQuit,
}

vi.mock('ioredis', () => {
  return {
    default: class MockRedis {
      constructor() {
        Object.assign(this, mockClient)
      }
    },
  }
})

import { RedisService } from './redis.service'

describe('RedisService', () => {
  let service: RedisService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new RedisService('redis://localhost:6379')
  })

  it('publishes a message to a channel', async () => {
    await service.publish('test-channel', 'hello')
    expect(mockPublish).toHaveBeenCalledWith('test-channel', 'hello')
  })

  it('subscribes a handler to a channel', async () => {
    const handler = vi.fn()
    await service.subscribe('test-channel', handler)
    expect(mockSubscribe).toHaveBeenCalledWith('test-channel')
  })
})
