import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPublish = vi.fn().mockResolvedValue(1)
const mockSubscribe = vi.fn().mockResolvedValue(undefined)
const mockOn = vi.fn()
const mockQuit = vi.fn().mockResolvedValue(undefined)
const mockRemoveListener = vi.fn()
const mockUnsubscribe = vi.fn().mockResolvedValue(undefined)

const mockClient = {
  publish: mockPublish,
  subscribe: mockSubscribe,
  on: mockOn,
  quit: mockQuit,
  removeListener: mockRemoveListener,
  unsubscribe: mockUnsubscribe,
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

  it('dispatches message to handler when channel matches', async () => {
    const handler = vi.fn()
    await service.subscribe('test-channel', handler)
    const listener = mockOn.mock.calls[0]![1] as (ch: string, msg: string) => void
    listener('test-channel', 'hello')
    expect(handler).toHaveBeenCalledWith('hello')
  })

  it('does not dispatch message when channel does not match', async () => {
    const handler = vi.fn()
    await service.subscribe('test-channel', handler)
    const listener = mockOn.mock.calls[0]![1] as (ch: string, msg: string) => void
    listener('other-channel', 'hello')
    expect(handler).not.toHaveBeenCalled()
  })

  it('unsubscribes and removes the listener', async () => {
    const handler = vi.fn()
    await service.subscribe('test-channel', handler)
    await service.unsubscribe('test-channel')
    expect(mockRemoveListener).toHaveBeenCalledWith('message', expect.any(Function))
    expect(mockUnsubscribe).toHaveBeenCalledWith('test-channel')
  })

  it('calls quit on both connections during shutdown', async () => {
    await service.onApplicationShutdown()
    expect(mockQuit).toHaveBeenCalledTimes(2)
  })
})
